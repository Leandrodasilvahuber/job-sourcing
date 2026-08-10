const express = require('express');
const router = express.Router();
const {
  runGoogleCrawl,
  garantirLimiteDisponivel,
  QuotaExcedidaError,
  CredenciaisAusentesError,
} = require('../crawlers/googleCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../services/coletores');
const { iniciarExecucao, concluirExecucao } = require('../services/execucoes');

let emExecucao = false;

router.post('/run', (req, res) => {
  if (emExecucao) {
    return res.status(409).json({ error: 'Já existe uma coleta em andamento.' });
  }

  try {
    garantirLimiteDisponivel();
  } catch (erro) {
    if (erro instanceof CredenciaisAusentesError) {
      return res.status(400).json({ error: erro.message, faltando: erro.faltando });
    }
    if (erro instanceof QuotaExcedidaError) {
      return res.status(429).json({
        error: 'Limite excedido',
        recurso: erro.recurso,
        reset_em: erro.resetEm,
      });
    }
    return res.status(502).json({ error: 'Falha ao verificar a quota da Google Custom Search.' });
  }

  emExecucao = true;
  res.status(202).json({ status: 'iniciado' });

  const execucaoId = iniciarExecucao('google');

  runGoogleCrawl(undefined, {
    onCompany: (empresa) => salvarEmpresaColetada(empresa),
    jaColetada: empresaJaColetada,
  })
    .then((resultado) => {
      if (resultado.limiteExcedido) {
        console.warn(`Coleta (Google) interrompida por limite excedido. Reset em ${resultado.resetEm}.`);
      }
      console.log(`Coleta (Google) finalizada: ${resultado.novas} novas, ${resultado.puladas} já existentes, ${resultado.processadas} processadas.`);
      concluirExecucao(execucaoId, {
        status: resultado.limiteExcedido ? 'limite_excedido' : 'concluida',
        processadas: resultado.processadas,
        novas: resultado.novas,
        puladas: resultado.puladas,
      });
    })
    .catch((erro) => {
      console.error('Erro no crawler do Google:', erro);
      concluirExecucao(execucaoId, { status: 'erro', erro: erro.message });
    })
    .finally(() => {
      emExecucao = false;
    });
});

router.get('/status', (req, res) => {
  res.json({ em_execucao: emExecucao });
});

module.exports = router;
