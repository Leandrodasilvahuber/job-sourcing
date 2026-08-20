const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db/database');
const { validarVagaComMistral } = require('../services/validarVaga');
const { personalizarEmailVaga } = require('../services/personalizarEmail');
const { enviarEmailComCv } = require('../services/emailSender');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.csv$/i.test(file.originalname)) {
      return cb(new Error('Apenas arquivos .csv são aceitos.'));
    }
    cb(null, true);
  },
});

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function detectarDelimitador(linhaCabecalho) {
  const virgulas = (linhaCabecalho.match(/,/g) || []).length;
  const pontoEVirgulas = (linhaCabecalho.match(/;/g) || []).length;
  return pontoEVirgulas > virgulas ? ';' : ',';
}

function parseLinhaCsv(linha, delimitador) {
  const campos = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; } else dentroAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === delimitador) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

// Aceita cabeçalhos em variações comuns de relatório (empresa/nome,
// vaga/titulo/cargo), com vírgula ou ponto-e-vírgula como delimitador (BR).
function parseRelatorioCsv(texto) {
  const linhas = texto.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (linhas.length === 0) {
    return { colunaEmpresa: -1, colunaTitulo: -1, registros: [] };
  }

  const delimitador = detectarDelimitador(linhas[0]);
  const cabecalho = parseLinhaCsv(linhas[0], delimitador).map(normalizar);
  const colunaEmpresa = cabecalho.findIndex((c) => c.includes('empresa') || c.includes('nome'));
  const colunaTitulo = cabecalho.findIndex((c) => c.includes('vaga') || c.includes('titulo') || c.includes('cargo'));

  const registros = linhas.slice(1).map((l) => parseLinhaCsv(l, delimitador));
  return { colunaEmpresa, colunaTitulo, registros };
}

const buscarPorId = db.prepare('SELECT * FROM vagas WHERE id = ?');
const inserirVaga = db.prepare(`
  INSERT OR IGNORE INTO vagas (empresa_nome, titulo) VALUES (@empresa_nome, @titulo)
`);
const atualizarValidacao = db.prepare(`
  UPDATE vagas SET
    status = @status,
    site = @site,
    contato_email = @contato_email,
    pesquisa_emails = @pesquisa_emails,
    pesquisa_erro = @pesquisa_erro,
    pesquisa_atualizado_em = CURRENT_TIMESTAMP
  WHERE id = @id
`);
const atualizarStatus = db.prepare('UPDATE vagas SET status = ? WHERE id = ?');
const registrarEnvio = db.prepare(`
  UPDATE vagas SET
    status = 'enviada',
    destinatario_email_enviado = @destinatario_email_enviado,
    conteudo_enviado = @conteudo_enviado,
    data_envio = CURRENT_TIMESTAMP
  WHERE id = @id
`);
const buscarVagaAssunto = db.prepare('SELECT conteudo FROM vaga_email_assunto WHERE id = 1');
const buscarVagaTexto = db.prepare('SELECT conteudo FROM vaga_email_texto WHERE id = 1');
const buscarCurriculoMeta = db.prepare('SELECT * FROM curriculo WHERE id = 1');

router.post('/importar', upload.single('relatorio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Envie o arquivo no campo "relatorio".' });
  }

  const { colunaEmpresa, colunaTitulo, registros } = parseRelatorioCsv(req.file.buffer.toString('utf8'));
  if (colunaEmpresa === -1 || colunaTitulo === -1) {
    return res.status(400).json({
      error: 'Não foi possível identificar as colunas de empresa e vaga no cabeçalho do CSV.',
    });
  }

  let inseridas = 0;
  let ignoradas = 0;
  let duplicadas = 0;
  for (const registro of registros) {
    const empresaNome = registro[colunaEmpresa]?.trim();
    const titulo = registro[colunaTitulo]?.trim();
    if (!empresaNome || !titulo) {
      ignoradas += 1;
      continue;
    }
    const info = inserirVaga.run({ empresa_nome: empresaNome, titulo });
    if (info.changes > 0) inseridas += 1;
    else duplicadas += 1;
  }

  res.status(201).json({ inseridas, ignoradas, duplicadas, total: registros.length });
});

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { status, q } = req.query;

  const condicoes = [];
  const params = {};
  if (status) {
    condicoes.push('status = @status');
    params.status = status;
  }
  if (q) {
    condicoes.push('(empresa_nome LIKE @q OR titulo LIKE @q)');
    params.q = `%${q}%`;
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM vagas ${where}`).get(params);
  const data = db.prepare(`
    SELECT * FROM vagas ${where}
    ORDER BY data_importacao DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  data.forEach((row) => {
    row.pesquisa_emails = row.pesquisa_emails ? JSON.parse(row.pesquisa_emails) : [];
  });

  res.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

// Núcleo da validação, usado tanto pela rota individual quanto pela em
// massa: busca site oficial + e-mail de contato/vagas da empresa.
async function validarUmaVaga(vaga) {
  const resultado = await validarVagaComMistral({ empresaNome: vaga.empresa_nome });

  if (resultado.tipo === 'invalida') {
    atualizarValidacao.run({
      id: vaga.id,
      status: 'invalida',
      site: null,
      contato_email: null,
      pesquisa_emails: null,
      pesquisa_erro: resultado.motivo,
    });
    return { tipo: 'invalida', motivo: resultado.motivo };
  }

  atualizarValidacao.run({
    id: vaga.id,
    status: 'validada',
    site: resultado.site,
    contato_email: resultado.email,
    pesquisa_emails: JSON.stringify([resultado.email]),
    pesquisa_erro: null,
  });
  return { tipo: 'validada', site: resultado.site, email: resultado.email };
}

router.post('/:id/validar', async (req, res) => {
  const { id } = req.params;
  const vaga = buscarPorId.get(id);
  if (!vaga) {
    return res.status(404).json({ error: 'Vaga não encontrada.' });
  }

  const resultado = await validarUmaVaga(vaga);
  if (resultado.tipo === 'invalida') {
    return res.status(422).json({ validada: false, motivo: resultado.motivo });
  }
  res.json({ validada: true, site: resultado.site, email: resultado.email });
});

// Mesma concorrência conservadora do confirmar-em-massa de empresas.js: o
// pipeline de validação faz várias chamadas de IA + fetches por vaga.
const CONCORRENCIA_MASSA = 2;
const TAMANHO_LOTE = 100;
const listarPendentes = db.prepare(`
  SELECT * FROM vagas WHERE status IN ('pendente', 'invalida') LIMIT ${TAMANHO_LOTE}
`);
let massaEmExecucao = false;
let massaProgresso = null;
let massaPararSolicitado = false;

async function processarValidacaoEmMassa(vagas) {
  let indice = 0;

  async function worker() {
    while (indice < vagas.length) {
      if (massaPararSolicitado) break;
      const vaga = vagas[indice];
      indice += 1;
      try {
        const resultado = await validarUmaVaga(vaga);
        if (resultado.tipo === 'validada') massaProgresso.validadas += 1;
        else massaProgresso.invalidas += 1;
      } catch (erro) {
        console.error(`Erro ao validar vaga ${vaga.id} em massa:`, erro);
        massaProgresso.invalidas += 1;
      }
      massaProgresso.processadas += 1;
    }
  }

  await Promise.all(Array.from({ length: CONCORRENCIA_MASSA }, worker));
}

router.post('/validar-em-massa', (req, res) => {
  if (massaEmExecucao) {
    return res.status(409).json({ error: 'Já existe uma validação em massa em andamento.' });
  }

  const pendentes = listarPendentes.all();
  if (pendentes.length === 0) {
    return res.status(200).json({ status: 'nada_a_fazer', total: 0 });
  }

  massaEmExecucao = true;
  massaPararSolicitado = false;
  massaProgresso = { total: pendentes.length, processadas: 0, validadas: 0, invalidas: 0, interrompida: false };
  res.status(202).json({ status: 'iniciado', total: pendentes.length });

  processarValidacaoEmMassa(pendentes).finally(() => {
    massaProgresso.interrompida = massaPararSolicitado;
    massaEmExecucao = false;
    massaPararSolicitado = false;
  });
});

router.get('/validar-em-massa/status', (req, res) => {
  res.json({ em_execucao: massaEmExecucao, parando: massaPararSolicitado, ...massaProgresso });
});

router.post('/validar-em-massa/parar', (req, res) => {
  if (!massaEmExecucao) {
    return res.status(409).json({ error: 'Nenhuma validação em massa em andamento.' });
  }
  massaPararSolicitado = true;
  res.json({ status: 'parando' });
});

router.post('/:id/descartar', (req, res) => {
  const { id } = req.params;
  const vaga = buscarPorId.get(id);
  if (!vaga) {
    return res.status(404).json({ error: 'Vaga não encontrada.' });
  }
  atualizarStatus.run('descartada', id);
  res.json({ id: Number(id), status: 'descartada' });
});

function buscarTemplateVaga() {
  const assunto = buscarVagaAssunto.get();
  const texto = buscarVagaTexto.get();
  if (!assunto?.conteudo) return { erro: 'Nenhum título de email de vaga cadastrado. Cadastre em Configurações.' };
  if (!texto?.conteudo) return { erro: 'Nenhum texto de email de vaga cadastrado. Cadastre em Configurações.' };
  return { assunto: assunto.conteudo, texto: texto.conteudo };
}

router.get('/:id/preview-email', (req, res) => {
  const { id } = req.params;
  const vaga = buscarPorId.get(id);
  if (!vaga) {
    return res.status(404).json({ error: 'Vaga não encontrada.' });
  }

  const template = buscarTemplateVaga();
  if (template.erro) {
    return res.status(400).json({ error: template.erro });
  }

  const personalizado = personalizarEmailVaga({
    assunto: template.assunto,
    corpo: template.texto,
    nomeEmpresa: vaga.empresa_nome,
    tituloVaga: vaga.titulo,
  });
  res.json(personalizado);
});

router.post('/:id/enviar-email', async (req, res) => {
  const { id } = req.params;
  const vaga = buscarPorId.get(id);
  if (!vaga) {
    return res.status(404).json({ error: 'Vaga não encontrada.' });
  }
  if (!vaga.contato_email) {
    return res.status(400).json({ error: 'Vaga ainda não tem e-mail validado.' });
  }

  const template = buscarTemplateVaga();
  if (template.erro) {
    return res.status(400).json({ error: template.erro });
  }

  const curriculoMeta = buscarCurriculoMeta.get();
  if (!curriculoMeta) {
    return res.status(400).json({ error: 'Nenhum currículo em PDF cadastrado. Envie um currículo em Configurações antes de enviar.' });
  }

  const personalizado = personalizarEmailVaga({
    assunto: template.assunto,
    corpo: template.texto,
    nomeEmpresa: vaga.empresa_nome,
    tituloVaga: vaga.titulo,
  });

  try {
    await enviarEmailComCv({
      destinatario: vaga.contato_email,
      assunto: personalizado.assunto,
      corpo: personalizado.corpo,
      nomeArquivoCv: curriculoMeta.nome_arquivo,
    });
  } catch (erro) {
    return res.status(400).json({ error: erro.message });
  }

  registrarEnvio.run({
    id,
    destinatario_email_enviado: vaga.contato_email,
    conteudo_enviado: personalizado.corpo,
  });

  res.json({ enviada: true });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Apenas arquivos .csv são aceitos.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
