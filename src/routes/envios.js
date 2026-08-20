const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { enviarEmailComCv } = require('../services/emailSender');
const { personalizarEmail } = require('../services/personalizarEmail');

const buscarEmpresaConfirmada = db.prepare(`
  SELECT * FROM empresas_confirmadas WHERE id = ?
`);
const inserirEnvio = db.prepare(`
  INSERT INTO envios (empresa_id, canal, conteudo_enviado, status)
  VALUES (@empresa_id, @canal, @conteudo_enviado, @status)
`);
const buscarAssunto = db.prepare('SELECT conteudo FROM email_assunto WHERE id = 1');
const buscarTexto = db.prepare('SELECT conteudo FROM email_texto WHERE id = 1');
const buscarCurriculoMeta = db.prepare('SELECT * FROM curriculo WHERE id = 1');
const inserirEnvioCv = db.prepare(`
  INSERT INTO envios (empresa_id, canal, destinatario_email, conteudo_enviado, status)
  VALUES (@empresa_id, 'cv', @destinatario_email, @conteudo_enviado, 'enviado')
`);
const listarEnvios = db.prepare(`
  SELECT * FROM envios ORDER BY data_envio DESC
`);
const buscarEnvioPorId = db.prepare(`
  SELECT * FROM envios WHERE id = ?
`);
const atualizarResposta = db.prepare(`
  UPDATE envios SET resposta = ?, status = ?, data_resposta = CURRENT_TIMESTAMP WHERE id = ?
`);
// Processa em lotes de TAMANHO_LOTE em vez de todas de uma vez — mesmo
// espírito do listarPendentes em empresas.js: quem já foi processado sai da
// condição (passa a ter envio registrado), então o próximo "Enviar em
// massa" pega o lote seguinte sozinho.
const TAMANHO_LOTE = 100;
// Empresas confirmadas que ainda não têm nenhum envio de CV registrado.
const listarConfirmadasSemCv = db.prepare(`
  SELECT * FROM empresas_confirmadas ec
  WHERE NOT EXISTS (SELECT 1 FROM envios e WHERE e.empresa_id = ec.id AND e.canal = 'cv')
  LIMIT ${TAMANHO_LOTE}
`);

function candidatosEmail(empresa) {
  const brutos = [empresa.contato_email, ...JSON.parse(empresa.pesquisa_emails || '[]')];
  return [...new Set(brutos.filter((e) => e && e.trim()))];
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Núcleo do envio de CV pra um destinatário — usado tanto pela rota
// individual quanto pelo envio em massa. Assunto/texto/currículo são
// buscados fora daqui (uma vez só) por quem chama em loop.
async function enviarCvParaDestinatario(empresa, destinatarioEmail, { assunto, texto, curriculoMeta }) {
  await enviarEmailComCv({
    destinatario: destinatarioEmail.trim(),
    assunto,
    corpo: texto,
    nomeArquivoCv: curriculoMeta.nome_arquivo,
  });
  return inserirEnvioCv.run({
    empresa_id: empresa.id,
    destinatario_email: destinatarioEmail.trim(),
    conteudo_enviado: texto,
  });
}

router.post('/', (req, res) => {
  const { empresa_id, canal, conteudo_enviado, status } = req.body;

  if (!empresa_id) {
    return res.status(400).json({ error: 'Campo "empresa_id" é obrigatório.' });
  }

  const empresa = buscarEmpresaConfirmada.get(empresa_id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa confirmada não encontrada.' });
  }

  const info = inserirEnvio.run({
    empresa_id,
    canal: canal ?? null,
    conteudo_enviado: conteudo_enviado ?? null,
    status: status ?? 'enviado',
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/', (req, res) => {
  res.json(listarEnvios.all());
});

router.post('/cv', async (req, res) => {
  const { empresa_id, destinatario_email } = req.body;

  if (!empresa_id) {
    return res.status(400).json({ error: 'Campo "empresa_id" é obrigatório.' });
  }
  if (!destinatario_email || !destinatario_email.trim()) {
    return res.status(400).json({ error: 'Campo "destinatario_email" é obrigatório.' });
  }

  const empresa = buscarEmpresaConfirmada.get(empresa_id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa confirmada não encontrada.' });
  }

  const assunto = buscarAssunto.get();
  if (!assunto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum título de email cadastrado. Cadastre o título no dashboard antes de enviar.' });
  }

  const texto = buscarTexto.get();
  if (!texto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum texto de email cadastrado. Cadastre o texto no dashboard antes de enviar.' });
  }

  const curriculoMeta = buscarCurriculoMeta.get();
  if (!curriculoMeta) {
    return res.status(400).json({ error: 'Nenhum currículo em PDF cadastrado. Envie um currículo no dashboard antes de enviar.' });
  }

  const personalizado = await personalizarEmail({
    assunto: assunto.conteudo,
    corpo: texto.conteudo,
    nomeEmpresa: empresa.nome,
  });

  let info;
  try {
    info = await enviarCvParaDestinatario(empresa, destinatario_email, {
      assunto: personalizado.assunto,
      texto: personalizado.corpo,
      curriculoMeta,
    });
  } catch (erro) {
    return res.status(400).json({ error: erro.message });
  }

  res.status(201).json({ id: info.lastInsertRowid });
});

// Mesma personalização usada no envio de verdade (personalizarEmail), mas só
// pra pré-visualizar — não manda e-mail nem grava nada em `envios`.
router.get('/cv/preview/:empresaId', async (req, res) => {
  const { empresaId } = req.params;

  const empresa = buscarEmpresaConfirmada.get(empresaId);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa confirmada não encontrada.' });
  }

  const assunto = buscarAssunto.get();
  if (!assunto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum título de email cadastrado. Cadastre o título no dashboard antes de enviar.' });
  }

  const texto = buscarTexto.get();
  if (!texto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum texto de email cadastrado. Cadastre o texto no dashboard antes de enviar.' });
  }

  const personalizado = await personalizarEmail({
    assunto: assunto.conteudo,
    corpo: texto.conteudo,
    nomeEmpresa: empresa.nome,
  });

  res.json(personalizado);
});

const ATRASO_ENTRE_ENVIOS_MS = 500;
let envioMassaEmExecucao = false;
let envioMassaProgresso = null;
let envioMassaPararSolicitado = false;

async function processarEnvioEmMassa(empresas, { assunto, texto, curriculoMeta }) {
  for (const empresa of empresas) {
    if (envioMassaPararSolicitado) break;
    // Personaliza uma vez por empresa (não por e-mail) — uma mesma empresa
    // pode ter vários candidatos de e-mail, e o texto personalizado é o
    // mesmo pra todos eles.
    const personalizado = await personalizarEmail({ assunto, corpo: texto, nomeEmpresa: empresa.nome });

    const candidatos = candidatosEmail(empresa);
    for (const email of candidatos) {
      if (envioMassaPararSolicitado) break;
      try {
        await enviarCvParaDestinatario(empresa, email, {
          assunto: personalizado.assunto,
          texto: personalizado.corpo,
          curriculoMeta,
        });
        envioMassaProgresso.emailsEnviados += 1;
      } catch (erro) {
        console.error(`Erro ao enviar CV pra "${email}" (empresa ${empresa.id}):`, erro.message);
        envioMassaProgresso.erros += 1;
      }
      await esperar(ATRASO_ENTRE_ENVIOS_MS);
    }
    envioMassaProgresso.processadas += 1;
  }
}

router.post('/cv/em-massa', (req, res) => {
  if (envioMassaEmExecucao) {
    return res.status(409).json({ error: 'Já existe um envio em massa em andamento.' });
  }

  const assunto = buscarAssunto.get();
  if (!assunto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum título de email cadastrado. Cadastre o título no dashboard antes de enviar.' });
  }
  const texto = buscarTexto.get();
  if (!texto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum texto de email cadastrado. Cadastre o texto no dashboard antes de enviar.' });
  }
  const curriculoMeta = buscarCurriculoMeta.get();
  if (!curriculoMeta) {
    return res.status(400).json({ error: 'Nenhum currículo em PDF cadastrado. Envie um currículo no dashboard antes de enviar.' });
  }

  const empresas = listarConfirmadasSemCv.all().filter((e) => candidatosEmail(e).length > 0);
  if (empresas.length === 0) {
    return res.status(200).json({ status: 'nada_a_fazer', total: 0 });
  }

  envioMassaEmExecucao = true;
  envioMassaPararSolicitado = false;
  envioMassaProgresso = { total: empresas.length, processadas: 0, emailsEnviados: 0, erros: 0, interrompida: false };
  res.status(202).json({ status: 'iniciado', total: empresas.length });

  processarEnvioEmMassa(empresas, { assunto: assunto.conteudo, texto: texto.conteudo, curriculoMeta })
    .finally(() => {
      envioMassaProgresso.interrompida = envioMassaPararSolicitado;
      envioMassaEmExecucao = false;
      envioMassaPararSolicitado = false;
    });
});

router.get('/cv/em-massa/status', (req, res) => {
  res.json({ em_execucao: envioMassaEmExecucao, parando: envioMassaPararSolicitado, ...envioMassaProgresso });
});

router.post('/cv/em-massa/parar', (req, res) => {
  if (!envioMassaEmExecucao) {
    return res.status(409).json({ error: 'Nenhum envio em massa em andamento.' });
  }
  envioMassaPararSolicitado = true;
  res.json({ status: 'parando' });
});

router.patch('/:id/resposta', (req, res) => {
  const { id } = req.params;
  const envio = buscarEnvioPorId.get(id);
  if (!envio) {
    return res.status(404).json({ error: 'Envio não encontrado.' });
  }

  const { resposta, status } = req.body;
  atualizarResposta.run(resposta ?? null, status ?? 'respondido', id);

  res.json(buscarEnvioPorId.get(id));
});

module.exports = router;
