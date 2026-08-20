const axios = require('axios');
const { chatCompletion } = require('../services/mistral');

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

function montarPromptNomeEmpresa(descricao) {
  return `
A descrição de uma organização do GitHub está abaixo. Tente identificar o nome da empresa por trás dessa organização (não o nome de um produto, projeto ou sigla genérica).

Descrição:
"""
${descricao}
"""

Responda APENAS um objeto JSON no formato: {"nome": "..."} — ou {"nome": null} se o texto não mencionar nenhuma empresa.
`.trim();
}

// Orgs sem o campo "name" preenchido no GitHub caem no login (ex: "acme-corp-br")
// como nome de exibição — quase nunca é o nome real da empresa. Antes desse
// fallback, tenta extrair o nome a partir da descrição da org via Mistral. Erros
// aqui (sem credenciais, quota, resposta inválida) não devem derrubar a coleta
// inteira: apenas volta a usar o login, como antes.
async function tentarExtrairNomeDaDescricao(descricao) {
  if (!descricao || !descricao.trim()) return null;

  try {
    const { texto } = await chatCompletion({
      messages: [{ role: 'user', content: montarPromptNomeEmpresa(descricao) }],
      responseFormat: { type: 'json_object' },
    });
    const dados = JSON.parse(texto);
    const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
    return nome || null;
  } catch (erro) {
    console.error(`Erro ao tentar extrair nome da empresa a partir da descrição: ${erro.message}`);
    return null;
  }
}

/**
 * Orquestra a coleta. `jaColetada(login)` permite pular orgs que já estão
 * na base sem gastar quota buscando os detalhes de novo. Interrompe
 * imediatamente (sem lançar) se o limite de requisições se esgotar no meio
 * do processo, preservando o que já foi coletado até ali.
 */
async function runGithubCrawl(locations = Object.keys(PAISES), { onCompany, jaColetada, deveParar } = {}) {
  await garantirLimiteDisponivel();

  const resultado = { processadas: 0, novas: 0, puladas: 0, limiteExcedido: false, resetEm: null, interrompida: false };

  for (const location of locations) {
    if (deveParar && deveParar()) {
      resultado.interrompida = true;
      return resultado;
    }

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
      if (deveParar && deveParar()) {
        resultado.interrompida = true;
        return resultado;
      }
      if (jaColetada && jaColetada('github', org.login)) {
        resultado.puladas += 1;
        continue;
      }

      try {
        const detalhes = await getOrgDetails(org.login);
        const descricao = detalhes.description || detalhes.bio || null;

        let nome = detalhes.name;
        let nomeExtraidoDaDescricao = false;
        if (!nome) {
          nome = await tentarExtrairNomeDaDescricao(descricao);
          nomeExtraidoDaDescricao = !!nome;
        }
        nome = nome || detalhes.login;

        const motivos = [];
        if (!detalhes.blog) motivos.push('Organização sem site cadastrado no GitHub — revisar manualmente.');
        if (nomeExtraidoDaDescricao) motivos.push('Nome extraído automaticamente da descrição da organização — revisar manualmente.');

        const empresa = {
          nome,
          site: detalhes.blog || null,
          fonte: 'github',
          fonte_id: detalhes.login,
          descricao,
          localizacao: detalhes.location || location,
          dados_brutos: JSON.stringify(detalhes),
          motivo_duvida: motivos.length > 0 ? motivos.join(' ') : null,
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
  tentarExtrairNomeDaDescricao,
  runGithubCrawl,
  RateLimitExceededError,
};
