const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { contagemAtual, proximaMeiaNoiteLocal } = require('../services/usoApi');
const { getRateLimitStatus } = require('../crawlers/githubCrawler');
const {
  FONTE_USO: FONTE_MISTRAL,
  limiteDiario: limiteDiarioMistral,
  tokensUsadosHoje: tokensMistralHoje,
  tetoTokens: tetoTokensMistral,
} = require('../services/mistral');

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

  // Não filtra por país: empresas confirmadas não têm coluna "pais" própria
  // (só "localizacao", texto livre), e nem toda confirmada vem de uma
  // empresa_nao_checada (ex: cadastro manual) pra herdar o país de lá.
  const { total: cvsEnviados } = db.prepare(`
    SELECT COUNT(DISTINCT empresa_id) AS total FROM envios WHERE canal = 'cv'
  `).get();

  res.json({ total, novasHoje, porStatus, porFonte, cvsEnviados });
});

router.get('/uso-apis', async (req, res) => {
  let github;
  try {
    const resources = await getRateLimitStatus();
    github = {
      core: {
        usado: resources.core.limit - resources.core.remaining,
        limite: resources.core.limit,
        reset_em: new Date(resources.core.reset * 1000),
      },
      search: {
        usado: resources.search.limit - resources.search.remaining,
        limite: resources.search.limit,
        reset_em: new Date(resources.search.reset * 1000),
      },
    };
  } catch (erro) {
    github = { erro: 'Falha ao consultar o rate limit do GitHub.' };
  }

  const mistral = {
    usado: contagemAtual(FONTE_MISTRAL),
    limite: limiteDiarioMistral(),
    reset_em: proximaMeiaNoiteLocal(),
    tokens_usados: tokensMistralHoje(),
    tokens_teto: tetoTokensMistral(),
  };

  res.json({ github, mistral });
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
