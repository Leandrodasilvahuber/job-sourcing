const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { confirmarComMistral } = require('../services/pesquisaEmpresa');

const buscarNaoCheckadaPorId = db.prepare(`
  SELECT * FROM empresas_nao_checadas WHERE id = ?
`);
const inserirConfirmada = db.prepare(`
  INSERT INTO empresas_confirmadas
    (empresa_nao_checada_id, nome, site, contato_email, contato_outro, setor, localizacao, observacoes,
     pesquisa_status, pesquisa_markdown, pesquisa_existe, pesquisa_eh_software, pesquisa_stack,
     pesquisa_resumo, pesquisa_emails, pesquisa_erro, pesquisa_atualizado_em)
  VALUES
    (@empresa_nao_checada_id, @nome, @site, @contato_email, @contato_outro, @setor, @localizacao, @observacoes,
     @pesquisa_status, @pesquisa_markdown, @pesquisa_existe, @pesquisa_eh_software, @pesquisa_stack,
     @pesquisa_resumo, @pesquisa_emails, @pesquisa_erro, CURRENT_TIMESTAMP)
`);
const atualizarStatusNaoCheckada = db.prepare(`
  UPDATE empresas_nao_checadas SET status = ? WHERE id = ?
`);
// Processa em lotes de TAMANHO_LOTE em vez da fila inteira de uma vez — com
// o pipeline de Mistral levando até dezenas de segundos por empresa, uma
// fila de milhares processaria por dias sem checkpoint nenhum; em lotes de
// 100 dá pra acompanhar o progresso e a próxima "Confirmar em massa" pega o
// lote seguinte automaticamente (quem já foi processado sai do status
// 'pendente', então não repete).
const TAMANHO_LOTE = 100;
const listarPendentes = db.prepare(`
  SELECT * FROM empresas_nao_checadas WHERE status = 'pendente' LIMIT ${TAMANHO_LOTE}
`);

// Núcleo do fluxo de confirmação, usado tanto pela rota individual quanto
// pela confirmação em massa: roda o pipeline de 5 passos do Mistral
// (src/services/pesquisaEmpresa.js) — busca a URL do site (se não tiver),
// abre o site, procura e-mail de vagas (cai pra e-mail de contato geral se
// não achar) e extrai nome + descrição da empresa. E-mail, nome e descrição
// são todos obrigatórios: falta de qualquer um vira 'invalida'.
async function confirmarUmaEmpresa(empresa) {
  const resultado = await confirmarComMistral(empresa);

  if (resultado.tipo === 'invalida') {
    atualizarStatusNaoCheckada.run('invalida', empresa.id);
    return { tipo: 'invalida', motivo: resultado.motivo };
  }

  const info = inserirConfirmada.run({
    empresa_nao_checada_id: empresa.id,
    nome: resultado.nome,
    site: resultado.site,
    contato_email: resultado.email,
    contato_outro: null,
    setor: null,
    localizacao: empresa.localizacao,
    observacoes: null,
    pesquisa_status: 'concluida',
    pesquisa_markdown: null,
    pesquisa_existe: 1,
    pesquisa_eh_software: null,
    pesquisa_stack: null,
    pesquisa_resumo: resultado.descricao,
    pesquisa_emails: JSON.stringify([resultado.email]),
    pesquisa_erro: null,
  });

  atualizarStatusNaoCheckada.run('confirmada', empresa.id);

  return { tipo: 'confirmada', id: info.lastInsertRowid, emails: [resultado.email] };
}

router.get('/nao-checadas', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { status, fonte, q } = req.query;

  const condicoes = [];
  const params = {};

  if (status) {
    condicoes.push('status = @status');
    params.status = status;
  }
  if (fonte) {
    condicoes.push('fonte = @fonte');
    params.fonte = fonte;
  }
  if (q) {
    condicoes.push('(nome LIKE @q OR localizacao LIKE @q OR descricao LIKE @q)');
    params.q = `%${q}%`;
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM empresas_nao_checadas ${where}`).get(params);
  const data = db.prepare(`
    SELECT * FROM empresas_nao_checadas ${where}
    ORDER BY data_coleta DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  const idsConfirmadas = data.filter((r) => r.status === 'confirmada').map((r) => r.id);
  if (idsConfirmadas.length > 0) {
    const placeholders = idsConfirmadas.map(() => '?').join(',');
    const pesquisas = db.prepare(`
      SELECT empresa_nao_checada_id, pesquisa_status, pesquisa_existe, pesquisa_emails, pesquisa_erro,
             pesquisa_resumo, pesquisa_stack, pesquisa_eh_software
      FROM empresas_confirmadas WHERE empresa_nao_checada_id IN (${placeholders})
    `).all(...idsConfirmadas);
    const porId = new Map(pesquisas.map((p) => [p.empresa_nao_checada_id, p]));
    data.forEach((row) => {
      const p = porId.get(row.id);
      row.pesquisa_status = p?.pesquisa_status ?? null;
      row.pesquisa_existe = p?.pesquisa_existe == null ? null : !!p.pesquisa_existe;
      row.pesquisa_emails = p?.pesquisa_emails ? JSON.parse(p.pesquisa_emails) : [];
      row.pesquisa_erro = p?.pesquisa_erro ?? null;
      row.pesquisa_resumo = p?.pesquisa_resumo ?? null;
      row.pesquisa_stack = p?.pesquisa_stack ? JSON.parse(p.pesquisa_stack) : [];
      row.pesquisa_eh_software = p?.pesquisa_eh_software == null ? null : !!p.pesquisa_eh_software;
    });
  }

  res.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.get('/nao-checadas/fontes', (req, res) => {
  const fontes = db.prepare('SELECT DISTINCT fonte FROM empresas_nao_checadas ORDER BY fonte').all();
  res.json(fontes.map((f) => f.fonte));
});

router.post('/nao-checadas/:id/confirmar', async (req, res) => {
  const { id } = req.params;
  const empresa = buscarNaoCheckadaPorId.get(id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa não encontrada.' });
  }

  const resultado = await confirmarUmaEmpresa(empresa);

  if (resultado.tipo === 'invalida') {
    return res.status(422).json({ confirmada: false, motivo: resultado.motivo });
  }

  res.status(201).json({ confirmada: true, id: resultado.id, emails: resultado.emails });
});

// O pipeline de confirmação agora faz até 5 chamadas de IA (Mistral) + até 3
// fetches por empresa — bem mais pesado que o GET simples de antes, então a
// concorrência precisa ser bem mais conservadora pra não estourar rate limit.
const CONCORRENCIA_MASSA = 2;
let massaEmExecucao = false;
let massaProgresso = null;
let massaPararSolicitado = false;

async function processarEmMassa(empresas) {
  let indice = 0;

  async function worker() {
    while (indice < empresas.length) {
      if (massaPararSolicitado) break;
      const empresa = empresas[indice];
      indice += 1;
      try {
        const resultado = await confirmarUmaEmpresa(empresa);
        if (resultado.tipo === 'confirmada') massaProgresso.confirmadas += 1;
        else massaProgresso.invalidas += 1;
      } catch (erro) {
        console.error(`Erro ao confirmar empresa ${empresa.id} em massa:`, erro);
        massaProgresso.invalidas += 1;
      }
      massaProgresso.processadas += 1;
    }
  }

  await Promise.all(Array.from({ length: CONCORRENCIA_MASSA }, worker));
}

router.post('/nao-checadas/confirmar-em-massa', (req, res) => {
  if (massaEmExecucao) {
    return res.status(409).json({ error: 'Já existe uma confirmação em massa em andamento.' });
  }

  const pendentes = listarPendentes.all();
  if (pendentes.length === 0) {
    return res.status(200).json({ status: 'nada_a_fazer', total: 0 });
  }

  massaEmExecucao = true;
  massaPararSolicitado = false;
  massaProgresso = { total: pendentes.length, processadas: 0, confirmadas: 0, invalidas: 0, interrompida: false };
  res.status(202).json({ status: 'iniciado', total: pendentes.length });

  processarEmMassa(pendentes).finally(() => {
    massaProgresso.interrompida = massaPararSolicitado;
    massaEmExecucao = false;
    massaPararSolicitado = false;
  });
});

router.get('/nao-checadas/confirmar-em-massa/status', (req, res) => {
  res.json({ em_execucao: massaEmExecucao, parando: massaPararSolicitado, ...massaProgresso });
});

router.post('/nao-checadas/confirmar-em-massa/parar', (req, res) => {
  if (!massaEmExecucao) {
    return res.status(409).json({ error: 'Nenhuma confirmação em massa em andamento.' });
  }
  massaPararSolicitado = true;
  res.json({ status: 'parando' });
});

router.get('/confirmadas', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { q, enviado } = req.query;

  const condicoes = [];
  const params = {};

  if (q) {
    condicoes.push('(nome LIKE @q OR localizacao LIKE @q OR pesquisa_resumo LIKE @q)');
    params.q = `%${q}%`;
  }
  // Filtro por já ter recebido envio de CV precisa entrar no WHERE (não dá
  // pra calcular depois da paginação, senão a página vem incompleta).
  if (enviado === 'true') {
    condicoes.push("EXISTS (SELECT 1 FROM envios e WHERE e.empresa_id = empresas_confirmadas.id AND e.canal = 'cv')");
  } else if (enviado === 'false') {
    condicoes.push("NOT EXISTS (SELECT 1 FROM envios e WHERE e.empresa_id = empresas_confirmadas.id AND e.canal = 'cv')");
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM empresas_confirmadas ${where}`).get(params);
  const data = db.prepare(`
    SELECT * FROM empresas_confirmadas ${where}
    ORDER BY data_confirmacao DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  const idsEmpresas = data.map((r) => r.id);
  if (idsEmpresas.length > 0) {
    const placeholders = idsEmpresas.map(() => '?').join(',');
    const envios = db.prepare(`
      SELECT empresa_id, canal, status, data_envio
      FROM envios WHERE empresa_id IN (${placeholders}) AND canal = 'cv'
      ORDER BY data_envio DESC
    `).all(...idsEmpresas);
    const porEmpresa = new Map();
    envios.forEach((e) => {
      if (!porEmpresa.has(e.empresa_id)) porEmpresa.set(e.empresa_id, e);
    });
    data.forEach((row) => {
      const envio = porEmpresa.get(row.id);
      row.cv_enviado = !!envio;
      row.cv_enviado_em = envio?.data_envio ?? null;
    });
  }

  data.forEach((row) => {
    row.pesquisa_stack = row.pesquisa_stack ? JSON.parse(row.pesquisa_stack) : [];
    row.pesquisa_emails = row.pesquisa_emails ? JSON.parse(row.pesquisa_emails) : [];
    if (row.cv_enviado === undefined) row.cv_enviado = false;
  });

  res.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.post('/nao-checadas/:id/descartar', (req, res) => {
  const { id } = req.params;
  const empresa = buscarNaoCheckadaPorId.get(id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa não encontrada.' });
  }

  atualizarStatusNaoCheckada.run('descartada', id);
  res.json({ id: Number(id), status: 'descartada' });
});

module.exports = router;
