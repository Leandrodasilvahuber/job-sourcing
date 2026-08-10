const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { pesquisarEmpresa } = require('../services/pesquisaEmpresa');

const buscarNaoCheckadaPorId = db.prepare(`
  SELECT * FROM empresas_nao_checadas WHERE id = ?
`);
const inserirConfirmada = db.prepare(`
  INSERT INTO empresas_confirmadas
    (empresa_nao_checada_id, nome, site, contato_email, contato_outro, setor, localizacao, observacoes)
  VALUES
    (@empresa_nao_checada_id, @nome, @site, @contato_email, @contato_outro, @setor, @localizacao, @observacoes)
`);
const atualizarStatusNaoCheckada = db.prepare(`
  UPDATE empresas_nao_checadas SET status = ? WHERE id = ?
`);
const atualizarPesquisaConfirmada = db.prepare(`
  UPDATE empresas_confirmadas
  SET pesquisa_status = @pesquisa_status,
      pesquisa_markdown = @pesquisa_markdown,
      pesquisa_existe = @pesquisa_existe,
      pesquisa_emails = @pesquisa_emails,
      pesquisa_erro = @pesquisa_erro,
      pesquisa_atualizado_em = CURRENT_TIMESTAMP,
      contato_email = COALESCE(contato_email, @contato_email_auto)
  WHERE id = @id
`);
const buscarConfirmadaPorId = db.prepare(`
  SELECT * FROM empresas_confirmadas WHERE id = ?
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
      SELECT empresa_nao_checada_id, pesquisa_status, pesquisa_existe, pesquisa_emails, pesquisa_erro
      FROM empresas_confirmadas WHERE empresa_nao_checada_id IN (${placeholders})
    `).all(...idsConfirmadas);
    const porId = new Map(pesquisas.map((p) => [p.empresa_nao_checada_id, p]));
    data.forEach((row) => {
      const p = porId.get(row.id);
      row.pesquisa_status = p?.pesquisa_status ?? null;
      row.pesquisa_existe = p?.pesquisa_existe == null ? null : !!p.pesquisa_existe;
      row.pesquisa_emails = p?.pesquisa_emails ? JSON.parse(p.pesquisa_emails) : [];
      row.pesquisa_erro = p?.pesquisa_erro ?? null;
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

  const info = inserirConfirmada.run({
    empresa_nao_checada_id: empresa.id,
    nome: nomeFinal,
    site: siteFinal,
    contato_email: contato_email ?? null,
    contato_outro: contato_outro ?? null,
    setor: setor ?? null,
    localizacao: localizacao ?? null,
    observacoes: observacoes ?? null,
  });

  atualizarStatusNaoCheckada.run('confirmada', id);

  const idConfirmada = info.lastInsertRowid;

  // Enriquecimento via Gemini roda de forma bloqueante (decisão de produto:
  // aceitável levar dezenas de segundos), mas nunca desfaz a confirmação —
  // falha aqui vira pesquisa_status='erro', não um 500.
  try {
    const resultado = await pesquisarEmpresa({ nome: nomeFinal, site: siteFinal });
    atualizarPesquisaConfirmada.run({
      id: idConfirmada,
      pesquisa_status: 'concluida',
      pesquisa_markdown: resultado.markdown,
      pesquisa_existe: resultado.existe ? 1 : 0,
      pesquisa_emails: JSON.stringify(resultado.emails),
      pesquisa_erro: null,
      contato_email_auto: resultado.emails[0] ?? null,
    });
  } catch (erro) {
    atualizarPesquisaConfirmada.run({
      id: idConfirmada,
      pesquisa_status: 'erro',
      pesquisa_markdown: null,
      pesquisa_existe: null,
      pesquisa_emails: null,
      pesquisa_erro: erro.message,
      contato_email_auto: null,
    });
  }

  const confirmada = buscarConfirmadaPorId.get(idConfirmada);
  res.status(201).json({
    id: idConfirmada,
    pesquisa: {
      status: confirmada.pesquisa_status,
      existe: confirmada.pesquisa_existe === null ? null : !!confirmada.pesquisa_existe,
      emails: confirmada.pesquisa_emails ? JSON.parse(confirmada.pesquisa_emails) : [],
      erro: confirmada.pesquisa_erro,
    },
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
