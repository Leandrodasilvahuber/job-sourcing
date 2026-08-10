const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { pesquisarEmpresa } = require('../services/pesquisaEmpresa');
const { GeminiQuotaExcedidaError, CredenciaisGeminiAusentesError } = require('../services/gemini');

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

  const { nome, site, contato_email, contato_outro, setor, localizacao, observacoes } = req.body;
  const nomeFinal = nome ?? empresa.nome;
  const siteFinal = site ?? empresa.site;

  // A pesquisa roda ANTES de qualquer persistência: só confirmamos se ela
  // indicar que vale a pena guardar a empresa (é de software + tem contato).
  // Falha técnica (Gemini/crawler fora do ar, quota) é um caso distinto de
  // "não atende os requisitos de negócio" — nenhum dos dois mexe no banco,
  // o registro continua pendente e pode ser confirmado de novo depois.
  let resultado;
  try {
    resultado = await pesquisarEmpresa({ nome: nomeFinal, site: siteFinal });
  } catch (erro) {
    if (erro instanceof GeminiQuotaExcedidaError) {
      return res.status(429).json({
        error: 'Limite excedido',
        recurso: erro.recurso,
        reset_em: erro.resetEm,
      });
    }
    if (erro instanceof CredenciaisGeminiAusentesError) {
      return res.status(400).json({ error: erro.message, faltando: erro.faltando });
    }
    return res.status(502).json({ error: `Falha ao pesquisar a empresa: ${erro.message}` });
  }

  const motivos = [];
  if (!resultado.ehEmpresaSoftware) motivos.push('não parece ser uma empresa de software');
  if (resultado.emails.length === 0) motivos.push('nenhum e-mail de contato encontrado');

  if (motivos.length > 0) {
    return res.status(422).json({
      confirmada: false,
      motivo: motivos.join('; '),
      pesquisa: {
        existe: resultado.existe,
        ehEmpresaSoftware: resultado.ehEmpresaSoftware,
        stack: resultado.stack,
        resumo: resultado.resumo,
        emails: resultado.emails,
        observacoes: resultado.observacoes,
      },
    });
  }

  const info = inserirConfirmada.run({
    empresa_nao_checada_id: empresa.id,
    nome: nomeFinal,
    site: siteFinal,
    contato_email: contato_email ?? resultado.emails[0] ?? null,
    contato_outro: contato_outro ?? null,
    setor: setor ?? null,
    localizacao: localizacao ?? null,
    observacoes: observacoes ?? null,
    pesquisa_status: 'concluida',
    pesquisa_markdown: resultado.markdown,
    pesquisa_existe: resultado.existe ? 1 : 0,
    pesquisa_eh_software: resultado.ehEmpresaSoftware ? 1 : 0,
    pesquisa_stack: JSON.stringify(resultado.stack),
    pesquisa_resumo: resultado.resumo,
    pesquisa_emails: JSON.stringify(resultado.emails),
    pesquisa_erro: null,
  });

  atualizarStatusNaoCheckada.run('confirmada', id);

  res.status(201).json({
    confirmada: true,
    id: info.lastInsertRowid,
    pesquisa: {
      status: 'concluida',
      existe: resultado.existe,
      ehEmpresaSoftware: resultado.ehEmpresaSoftware,
      stack: resultado.stack,
      resumo: resultado.resumo,
      emails: resultado.emails,
      erro: null,
    },
  });
});

router.get('/confirmadas', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { q } = req.query;

  const condicoes = [];
  const params = {};

  if (q) {
    condicoes.push('(nome LIKE @q OR localizacao LIKE @q OR pesquisa_resumo LIKE @q)');
    params.q = `%${q}%`;
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
