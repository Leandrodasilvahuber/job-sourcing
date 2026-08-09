const express = require('express');
const router = express.Router();
const db = require('../db/database');

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

router.post('/nao-checadas/:id/confirmar', (req, res) => {
  const { id } = req.params;
  const empresa = buscarNaoCheckadaPorId.get(id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa não encontrada.' });
  }

  const { nome, site, contato_email, contato_outro, setor, localizacao, observacoes } = req.body;

  const info = inserirConfirmada.run({
    empresa_nao_checada_id: empresa.id,
    nome: nome ?? empresa.nome,
    site: site ?? empresa.site,
    contato_email: contato_email ?? null,
    contato_outro: contato_outro ?? null,
    setor: setor ?? null,
    localizacao: localizacao ?? null,
    observacoes: observacoes ?? null,
  });

  atualizarStatusNaoCheckada.run('confirmada', id);

  res.status(201).json({ id: info.lastInsertRowid });
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
