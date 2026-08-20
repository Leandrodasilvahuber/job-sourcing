const express = require('express');
const router = express.Router();
const prompts = require('../services/prompts');

router.get('/', (req, res) => {
  res.json(prompts.listar());
});

router.post('/restaurar-tudo', (req, res) => {
  res.json(prompts.restaurarTodosPadrao());
});

router.post('/:chave/restaurar', (req, res) => {
  try {
    res.json(prompts.restaurarPadrao(req.params.chave));
  } catch (erro) {
    res.status(404).json({ error: erro.message });
  }
});

router.post('/:chave', (req, res) => {
  const { conteudo } = req.body;
  if (!conteudo || !conteudo.trim()) {
    return res.status(400).json({ error: 'Campo "conteudo" é obrigatório.' });
  }
  try {
    res.status(201).json(prompts.salvar(req.params.chave, conteudo));
  } catch (erro) {
    res.status(404).json({ error: erro.message });
  }
});

module.exports = router;
