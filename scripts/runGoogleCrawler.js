require('dotenv').config();
const { runGoogleCrawl, garantirLimiteDisponivel, QuotaExcedidaError, CredenciaisAusentesError } = require('../src/crawlers/googleCseCrawler');
const { salvarEmpresaColetada, empresaJaColetada } = require('../src/services/coletores');

async function main() {
  try {
    garantirLimiteDisponivel();
  } catch (erro) {
    if (erro instanceof CredenciaisAusentesError) {
      console.error(erro.message);
      process.exit(1);
    }
    if (erro instanceof QuotaExcedidaError) {
      console.error(`Quota excedida (${erro.recurso}). Reseta às ${erro.resetEm.toISOString()}.`);
      process.exit(1);
    }
    throw erro;
  }

  const resultado = await runGoogleCrawl(undefined, {
    onCompany: (empresa) => {
      const info = salvarEmpresaColetada(empresa);
      console.log(`[${empresa.localizacao}] ${info.changes > 0 ? 'nova' : 'já existia'}: ${empresa.nome} (${empresa.fonte_id})`);
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
  console.error('Erro fatal no crawler do Google:', erro);
  process.exit(1);
});
