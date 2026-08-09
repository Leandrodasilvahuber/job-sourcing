const express = require('express');
const router = express.Router();
const { runGithubCrawl, garantirLimiteDisponivel, RateLimitExceededError } = require('../crawlers/githubCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../services/coletores');

let emExecucao = false;

router.post('/run', async (req, res) => {
  if (emExecucao) {
    return res.status(409).json({ error: 'Já existe uma coleta em andamento.' });
  }

  try {
    await garantirLimiteDisponivel();
  } catch (erro) {
    if (erro instanceof RateLimitExceededError) {
      return res.status(429).json({
        error: 'Limite excedido',
        recurso: erro.recurso,
        reset_em: erro.resetEm,
      });
    }
    return res.status(502).json({ error: 'Falha ao consultar o rate limit do GitHub.' });
  }

  emExecucao = true;
  res.status(202).json({ status: 'iniciado' });

  runGithubCrawl(['Brazil', 'Portugal'], {
    onCompany: (empresa) => salvarEmpresaColetada(empresa),
    jaColetada: empresaJaColetada,
  })
    .then((resultado) => {
      if (resultado.limiteExcedido) {
        console.warn(`Coleta interrompida por limite excedido. Reset em ${resultado.resetEm}.`);
      }
      console.log(`Coleta finalizada: ${resultado.novas} novas, ${resultado.puladas} já existentes, ${resultado.processadas} processadas.`);
    })
    .catch((erro) => console.error('Erro no crawler do GitHub:', erro))
    .finally(() => {
      emExecucao = false;
    });
});

router.get('/status', (req, res) => {
  res.json({ em_execucao: emExecucao });
});

module.exports = router;
