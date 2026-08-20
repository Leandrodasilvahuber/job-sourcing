const express = require('express');
const router = express.Router();
const { runGithubCrawl, garantirLimiteDisponivel, RateLimitExceededError } = require('../crawlers/githubCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../services/coletores');
const { iniciarExecucao, concluirExecucao } = require('../services/execucoes');

let emExecucao = false;
let pararSolicitado = false;

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
  pararSolicitado = false;
  res.status(202).json({ status: 'iniciado' });

  const execucaoId = iniciarExecucao('github');

  runGithubCrawl(['Brazil', 'Portugal'], {
    onCompany: (empresa) => salvarEmpresaColetada(empresa),
    jaColetada: empresaJaColetada,
    deveParar: () => pararSolicitado,
  })
    .then((resultado) => {
      if (resultado.limiteExcedido) {
        console.warn(`Coleta interrompida por limite excedido. Reset em ${resultado.resetEm}.`);
      }
      console.log(`Coleta finalizada: ${resultado.novas} novas, ${resultado.puladas} já existentes, ${resultado.processadas} processadas.`);
      concluirExecucao(execucaoId, {
        status: resultado.limiteExcedido ? 'limite_excedido' : resultado.interrompida ? 'interrompida' : 'concluida',
        processadas: resultado.processadas,
        novas: resultado.novas,
        puladas: resultado.puladas,
      });
    })
    .catch((erro) => {
      console.error('Erro no crawler do GitHub:', erro);
      concluirExecucao(execucaoId, { status: 'erro', erro: erro.message });
    })
    .finally(() => {
      emExecucao = false;
      pararSolicitado = false;
    });
});

router.get('/status', (req, res) => {
  res.json({ em_execucao: emExecucao, parando: pararSolicitado });
});

router.post('/parar', (req, res) => {
  if (!emExecucao) {
    return res.status(409).json({ error: 'Nenhuma coleta em andamento.' });
  }
  pararSolicitado = true;
  res.json({ status: 'parando' });
});

module.exports = router;
