const express = require('express');
const router = express.Router();
const db = require('../db/database');

const buscar = db.prepare('SELECT * FROM vaga_email_texto WHERE id = 1');
const salvar = db.prepare(`
  INSERT INTO vaga_email_texto (id, conteudo, atualizado_em)
  VALUES (1, @conteudo, CURRENT_TIMESTAMP)
  ON CONFLICT (id) DO UPDATE SET
    conteudo = excluded.conteudo,
    atualizado_em = excluded.atualizado_em
`);

router.get('/', (req, res) => {
  res.json(buscar.get() ?? null);
});

router.post('/', (req, res) => {
  const { conteudo } = req.body;
  if (!conteudo || !conteudo.trim()) {
    return res.status(400).json({ error: 'Campo "conteudo" é obrigatório.' });
  }

  salvar.run({ conteudo });
  res.status(201).json(buscar.get());
});

module.exports = router;
