const axios = require('axios');
const { contagemAtual, incrementarUso, proximaMeiaNoiteLocal } = require('../services/usoApi');

const API_BASE = 'https://www.googleapis.com/customsearch/v1';
const FONTE_USO = 'google_cse';
const LIMITE_DIARIO_PADRAO = 100;

function limiteDiario() {
  const v = Number(process.env.GOOGLE_CSE_DAILY_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : LIMITE_DIARIO_PADRAO;
}

class QuotaExcedidaError extends Error {
  constructor(motivo, resetEm) {
    super(`Quota diária da Google Custom Search excedida (${motivo}). Reseta às ${resetEm.toISOString()}.`);
    this.name = 'QuotaExcedidaError';
    this.recurso = 'google_cse';
    this.resetEm = resetEm;
  }
}

class CredenciaisAusentesError extends Error {
  constructor(faltando) {
    super(`Credenciais da Google Custom Search ausentes: ${faltando.join(', ')}.`);
    this.name = 'CredenciaisAusentesError';
    this.faltando = faltando;
  }
}

function credenciaisFaltando() {
  const faltando = [];
  if (!process.env.GOOGLE_API_KEY) faltando.push('GOOGLE_API_KEY');
  if (!process.env.GOOGLE_CSE_ID) faltando.push('GOOGLE_CSE_ID');
  return faltando;
}

// Verifica ANTES de iniciar a coleta se ainda há quota local — se não houver,
// recusa a execução em vez de deixar o crawler estourar 403 no meio do caminho.
// Síncrona: diferente do GitHub, não precisa de rede pra saber a quota (só lê
// o contador local), já que a API do Google não expõe quota restante.
function garantirLimiteDisponivel() {
  const faltando = credenciaisFaltando();
  if (faltando.length > 0) throw new CredenciaisAusentesError(faltando);

  const usado = contagemAtual(FONTE_USO);
  if (usado >= limiteDiario()) {
    throw new QuotaExcedidaError('contador local', proximaMeiaNoiteLocal());
  }
}

function checarAntesDeChamar() {
  if (contagemAtual(FONTE_USO) >= limiteDiario()) {
    throw new QuotaExcedidaError('contador local', proximaMeiaNoiteLocal());
  }
}

function ehErroDeQuotaGoogle(erro) {
  const motivo = erro.response?.data?.error?.errors?.[0]?.reason;
  return erro.response?.status === 403 &&
    (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded' || motivo === 'rateLimitExceeded');
}

// Extrai a mensagem real da API (ex: "This project does not have access to
// Custom Search JSON API") em vez de só o status HTTP genérico, já que erros
// 403 podem ter causas bem diferentes de quota (API desabilitada, CSE ID
// inválido, chave sem permissão, etc).
function mensagemDeErroGoogle(erro) {
  const dadosErro = erro.response?.data?.error;
  if (dadosErro) {
    const motivo = dadosErro.errors?.[0]?.reason;
    const partes = [`HTTP ${erro.response.status}`];
    if (motivo) partes.push(motivo);
    partes.push(dadosErro.message || erro.message);
    return partes.join(' — ');
  }
  return erro.message;
}

async function buscar(query, pagina = 1) {
  checarAntesDeChamar();
  const start = (pagina - 1) * 10 + 1; // API do Google é 1-indexed, 10 resultados/página
  try {
    const response = await axios.get(API_BASE, {
      params: {
        key: process.env.GOOGLE_API_KEY,
        cx: process.env.GOOGLE_CSE_ID,
        q: query,
        start,
        num: 10,
      },
    });
    incrementarUso(FONTE_USO);
    return response.data.items || [];
  } catch (erro) {
    if (ehErroDeQuotaGoogle(erro)) {
      throw new QuotaExcedidaError('resposta da Google', proximaMeiaNoiteLocal());
    }
    throw erro;
  }
}

// Lista pequena e editável, no mesmo espírito do PAISES do githubCrawler.
// 1 página (10 resultados) por query por padrão, pra conservar a quota
// diária escassa (~6 queries = ~60/100 por execução completa).
const QUERIES = [
  { texto: '"desenvolvimento de software" empresa site:.br', pais: 'BR' },
  { texto: '"software house" site:.br', pais: 'BR' },
  { texto: '"fábrica de software" site:.br', pais: 'BR' },
  { texto: '"desenvolvimento de software" empresa site:.pt', pais: 'PT' },
  { texto: '"software house" Portugal', pais: 'PT' },
  { texto: '"fábrica de software" Portugal', pais: 'PT' },
];
const PAGINAS_POR_QUERY = 1;

/**
 * Orquestra a coleta. Diferente do GitHub, cada busca já retorna os dados
 * completos do item (não há uma segunda chamada de "detalhes" pra economizar
 * pulando com `jaColetada` — aqui ele só evita reinserir/reprocessar, não
 * economiza quota, já que o item já veio na própria busca).
 */
async function runGoogleCrawl(queries = QUERIES, { onCompany, jaColetada } = {}) {
  garantirLimiteDisponivel();

  const resultado = { processadas: 0, novas: 0, puladas: 0, limiteExcedido: false, resetEm: null };

  for (const { texto, pais } of queries) {
    for (let pagina = 1; pagina <= PAGINAS_POR_QUERY; pagina += 1) {
      let items;
      try {
        items = await buscar(texto, pagina);
      } catch (erro) {
        if (erro instanceof QuotaExcedidaError) {
          resultado.limiteExcedido = true;
          resultado.resetEm = erro.resetEm;
          return resultado;
        }
        console.error(`Erro ao buscar "${texto}" (página ${pagina}): ${mensagemDeErroGoogle(erro)}`);
        break;
      }

      if (items.length === 0) break;

      for (const item of items) {
        const dominio = item.displayLink || null;
        if (!dominio) continue;

        if (jaColetada && jaColetada(FONTE_USO, dominio)) {
          resultado.puladas += 1;
          continue;
        }

        const empresa = {
          nome: item.title || dominio,
          site: item.link || `https://${dominio}`,
          fonte: FONTE_USO,
          fonte_id: dominio,
          descricao: item.snippet || null,
          localizacao: pais,
          dados_brutos: JSON.stringify(item),
          motivo_duvida: 'Resultado de busca no Google — nome e site precisam de revisão manual.',
          pais,
        };
        resultado.processadas += 1;
        if (onCompany) {
          const info = await onCompany(empresa);
          if (info && info.changes > 0) resultado.novas += 1;
        }
      }
    }
  }

  return resultado;
}

module.exports = {
  buscar,
  garantirLimiteDisponivel,
  runGoogleCrawl,
  QuotaExcedidaError,
  CredenciaisAusentesError,
  QUERIES,
  FONTE_USO,
};
