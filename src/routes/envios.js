const express = require('express');
const router = express.Router();
const db = require('../db/database');

const buscarEmpresaConfirmada = db.prepare(`
  SELECT * FROM empresas_confirmadas WHERE id = ?
`);
const inserirEnvio = db.prepare(`
  INSERT INTO envios (empresa_id, canal, conteudo_enviado, status)
  VALUES (@empresa_id, @canal, @conteudo_enviado, @status)
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
