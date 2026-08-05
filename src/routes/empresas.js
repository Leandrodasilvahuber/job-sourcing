const express = require('express');
const router = express.Router();
const db = require('../db/database');

const listarNaoCheckadas = db.prepare(`
  SELECT * FROM empresas_nao_checadas WHERE status = 'pendente' ORDER BY data_coleta DESC
`);
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
  res.json(listarNaoCheckadas.all());
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
