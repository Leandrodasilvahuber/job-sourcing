require('dotenv').config();
const { runGithubCrawl, garantirLimiteDisponivel, RateLimitExceededError } = require('../src/crawlers/githubCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../src/services/coletores');

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    console.warn('Aviso: GITHUB_TOKEN não definido — rate limit será de 60 req/h.');
  }

  try {
    await garantirLimiteDisponivel();
  } catch (erro) {
    if (erro instanceof RateLimitExceededError) {
      console.error(`Limite excedido (${erro.recurso}). Reseta às ${erro.resetEm.toISOString()}.`);
      process.exit(1);
    }
    throw erro;
  }

  const resultado = await runGithubCrawl(['Brazil', 'Portugal'], {
    onCompany: (empresa) => {
      const info = salvarEmpresaColetada(empresa);
      console.log(`[${empresa.pais}] ${info.changes > 0 ? 'nova' : 'já existia'}: ${empresa.nome} (${empresa.fonte_id})`);
      return info;
    },
    jaColetada: empresaJaColetada,
  });

  if (resultado.limiteExcedido) {
    console.warn(`\nColeta interrompida por limite excedido. Reseta às ${resultado.resetEm.toISOString()}.`);
  }
  console.log(`\nCrawl concluído. ${resultado.novas} novas, ${resultado.puladas} já existentes, ${resultado.processadas} processadas.`);
  process.exit(0);
}

main().catch((erro) => {
  console.error('Erro fatal no crawler:', erro);
  process.exit(1);
});
