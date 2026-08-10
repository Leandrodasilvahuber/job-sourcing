const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/resumo', (req, res) => {
  const { pais } = req.query;
  const where = pais ? 'WHERE pais = @pais' : '';
  const params = pais ? { pais } : {};

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM empresas_nao_checadas ${where}`).get(params);

  const porStatus = db.prepare(`
    SELECT status, COUNT(*) AS total FROM empresas_nao_checadas ${where} GROUP BY status
  `).all(params);

  const porFonte = db.prepare(`
    SELECT fonte, COUNT(*) AS total FROM empresas_nao_checadas ${where} GROUP BY fonte ORDER BY total DESC
  `).all(params);

  const condicaoHoje = pais ? 'WHERE pais = @pais AND date(data_coleta) = date(\'now\')' : "WHERE date(data_coleta) = date('now')";
  const { total: novasHoje } = db.prepare(`
    SELECT COUNT(*) AS total FROM empresas_nao_checadas ${condicaoHoje}
  `).get(params);

  res.json({ total, novasHoje, porStatus, porFonte });
});

router.get('/paises', (req, res) => {
  const paises = db.prepare(`
    SELECT DISTINCT pais FROM empresas_nao_checadas WHERE pais IS NOT NULL AND pais != '' ORDER BY pais
  `).all();
  res.json(paises.map((p) => p.pais));
});

router.get('/execucoes', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { fonte } = req.query;

  const where = fonte ? 'WHERE fonte = @fonte' : '';
  const params = fonte ? { fonte } : {};

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM execucoes_coleta ${where}`).get(params);
  const data = db.prepare(`
    SELECT * FROM execucoes_coleta ${where}
    ORDER BY iniciado_em DESC
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

module.exports = router;
