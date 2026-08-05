const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { buscarEmpresas } = require('../services/webSearch');
const { normalizarResultado } = require('../services/coletores');

const insertEmpresaNaoChecada = db.prepare(`
  INSERT OR IGNORE INTO empresas_nao_checadas (nome, site, fonte, dados_brutos, motivo_duvida)
  VALUES (@nome, @site, @fonte, @dados_brutos, @motivo_duvida)
`);

router.post('/', async (req, res) => {
  const { termo } = req.body;
  if (!termo) {
    return res.status(400).json({ error: 'Campo "termo" é obrigatório.' });
  }

  const resultadosBrutos = await buscarEmpresas(termo);
  const inseridos = resultadosBrutos.map((resultadoBruto) => {
    const registro = normalizarResultado(resultadoBruto);
    const info = insertEmpresaNaoChecada.run(registro);
    return { id: info.lastInsertRowid, ...registro };
  });

  res.status(201).json({ termo, inseridos });
});

module.exports = router;
