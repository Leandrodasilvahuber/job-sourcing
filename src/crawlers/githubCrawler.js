const axios = require('axios');

const API_BASE = 'https://api.github.com';

class RateLimitExceededError extends Error {
  constructor(recurso, resetEm) {
    super(`Limite de requisições do GitHub (${recurso}) excedido. Reseta às ${resetEm.toISOString()}.`);
    this.name = 'RateLimitExceededError';
    this.recurso = recurso;
    this.resetEm = resetEm;
  }
}

function headers() {
  const h = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

// Não conta contra o limite de requisições (endpoint isento).
async function getRateLimitStatus() {
  const response = await axios.get(`${API_BASE}/rate_limit`, { headers: headers() });
  return response.data.resources;
}

// Verifica ANTES de iniciar a coleta se ainda há quota — se não houver,
// recusa a execução em vez de deixar o crawler estourar o limite no meio do caminho.
async function garantirLimiteDisponivel() {
  const resources = await getRateLimitStatus();
  for (const recurso of ['search', 'core']) {
    const dados = resources[recurso];
    if (dados.remaining <= 0) {
      throw new RateLimitExceededError(recurso, new Date(dados.reset * 1000));
    }
  }
  return resources;
}

// Interrompe a coleta assim que o limite chega a zero, em vez de deixar a
// próxima chamada estourar com 403 do GitHub.
function checarRestante(response) {
  const restante = Number(response.headers['x-ratelimit-remaining']);
  if (Number.isFinite(restante) && restante <= 0) {
    const recurso = response.headers['x-ratelimit-resource'] || 'github';
    const resetEm = new Date(Number(response.headers['x-ratelimit-reset']) * 1000);
    throw new RateLimitExceededError(recurso, resetEm);
  }
}

async function searchOrgsByLocation(location, page = 1) {
  const response = await axios.get(`${API_BASE}/search/users`, {
    headers: headers(),
    params: {
      q: `type:org location:${location}`,
      per_page: 100,
      page,
    },
  });

  checarRestante(response);
  return response.data.items;
}

async function getOrgDetails(login) {
  const response = await axios.get(`${API_BASE}/orgs/${login}`, { headers: headers() });
  checarRestante(response);
  return response.data;
}

async function searchAllOrgsByLocation(location) {
  const orgs = [];
  for (let page = 1; page <= 10; page += 1) {
    const items = await searchOrgsByLocation(location, page);
    if (items.length === 0) break;
    orgs.push(...items);
    if (items.length < 100) break;
  }
  return orgs;
}

const PAISES = {
  Brazil: 'BR',
  Portugal: 'PT',
};

/**
 * Orquestra a coleta. `jaColetada(login)` permite pular orgs que já estão
 * na base sem gastar quota buscando os detalhes de novo. Interrompe
 * imediatamente (sem lançar) se o limite de requisições se esgotar no meio
 * do processo, preservando o que já foi coletado até ali.
 */
async function runGithubCrawl(locations = Object.keys(PAISES), { onCompany, jaColetada } = {}) {
  await garantirLimiteDisponivel();

  const resultado = { processadas: 0, novas: 0, puladas: 0, limiteExcedido: false, resetEm: null };

  for (const location of locations) {
    let orgs;
    try {
      orgs = await searchAllOrgsByLocation(location);
    } catch (erro) {
      if (erro instanceof RateLimitExceededError) {
        resultado.limiteExcedido = true;
        resultado.resetEm = erro.resetEm;
        return resultado;
      }
      console.error(`Erro ao buscar orgs em "${location}":`, erro.message);
      continue;
    }

    for (const org of orgs) {
      if (jaColetada && jaColetada('github', org.login)) {
        resultado.puladas += 1;
        continue;
      }

      try {
        const detalhes = await getOrgDetails(org.login);
        const empresa = {
          nome: detalhes.name || detalhes.login,
          site: detalhes.blog || null,
          fonte: 'github',
          fonte_id: detalhes.login,
          descricao: detalhes.description || detalhes.bio || null,
          localizacao: detalhes.location || location,
          dados_brutos: JSON.stringify(detalhes),
          motivo_duvida: detalhes.blog ? null : 'Organização sem site cadastrado no GitHub — revisar manualmente.',
          pais: PAISES[location] || null,
        };
        resultado.processadas += 1;
        if (onCompany) {
          const info = await onCompany(empresa);
          if (info && info.changes > 0) resultado.novas += 1;
        }
      } catch (erro) {
        if (erro instanceof RateLimitExceededError) {
          resultado.limiteExcedido = true;
          resultado.resetEm = erro.resetEm;
          return resultado;
        }
        console.error(`Erro ao buscar detalhes da org "${org.login}":`, erro.message);
      }
    }
  }

  return resultado;
}

module.exports = {
  searchOrgsByLocation,
  searchAllOrgsByLocation,
  getOrgDetails,
  getRateLimitStatus,
  garantirLimiteDisponivel,
  runGithubCrawl,
  RateLimitExceededError,
};
