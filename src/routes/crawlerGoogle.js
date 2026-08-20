const express = require('express');
const router = express.Router();
const { runDuckDuckGoCrawl } = require('../crawlers/duckduckgoCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../services/coletores');
const { iniciarExecucao, concluirExecucao } = require('../services/execucoes');

let emExecucao = false;
let pararSolicitado = false;

router.post('/run', (req, res) => {
  if (emExecucao) {
    return res.status(409).json({ error: 'Já existe uma coleta em andamento.' });
  }

  emExecucao = true;
  pararSolicitado = false;
  res.status(202).json({ status: 'iniciado' });

  const execucaoId = iniciarExecucao('duckduckgo');

  runDuckDuckGoCrawl(undefined, {
    onCompany: (empresa) => salvarEmpresaColetada(empresa),
    jaColetada: empresaJaColetada,
    deveParar: () => pararSolicitado,
  })
    .then((resultado) => {
      console.log(`Coleta (DuckDuckGo) finalizada: ${resultado.novas} novas, ${resultado.puladas} já existentes, ${resultado.processadas} processadas.`);
      concluirExecucao(execucaoId, {
        status: resultado.interrompida ? 'interrompida' : 'concluida',
        processadas: resultado.processadas,
        novas: resultado.novas,
        puladas: resultado.puladas,
      });
    })
    .catch((erro) => {
      console.error('Erro no crawler do DuckDuckGo:', erro);
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
