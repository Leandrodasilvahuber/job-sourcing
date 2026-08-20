const axios = require('axios');
const { chatCompletion } = require('./mistral');
const { montarPrompt } = require('./prompts');

// Mesmo espírito de recortar()/LIMITE_HTML em visitarSite.js: página real
// pode trazer megabytes de HTML (imagem/fonte em base64, JSON de estado)
// que não tem contato nenhum — cortamos antes de gastar token com isso.
const LIMITE_TEXTO = 12000;
const MAX_LINKS = 60;

function limparJson(texto) {
  // Alguns modelos devolvem o JSON dentro de um bloco ```json ... ``` mesmo
  // pedindo só o objeto — remove a cerca antes de fazer JSON.parse.
  return texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function parseRespostaJson(texto) {
  try {
    return JSON.parse(limparJson(texto));
  } catch {
    return null;
  }
}

// Busca leve (HTTP, sem navegador) da página — mesma base de segurança que
// visitarSite.js usava (timeout, maxRedirects, checagem de content-type),
// mas devolvendo texto visível pro Mistral analisar em vez de rodar regex
// aqui. Também extrai os links da página (href + texto do link) porque o
// passo de mapeamento de páginas precisa apontar URLs reais, não inventadas.
async function buscarPagina(url) {
  const resposta = await axios.get(url, {
    timeout: 10000,
    maxRedirects: 5,
    validateStatus: null,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; api-busca-empregos/1.0; +validacao-empresa)',
    },
  });

  if (resposta.status < 200 || resposta.status >= 300) {
    throw new Error(`HTTP ${resposta.status}`);
  }

  const contentType = resposta.headers?.['content-type'] || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Conteúdo não é HTML (${contentType || 'sem content-type'})`);
  }

  const html = String(resposta.data);

  const links = [];
  const LINK_REGEX = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = LINK_REGEX.exec(html)) && links.length < MAX_LINKS) {
    const href = m[1].trim();
    const textoLink = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    try {
      links.push({ texto: textoLink.slice(0, 80), href: new URL(href, url).toString() });
    } catch {
      // href inválido/relativo estranho — ignora
    }
  }

  const textoVisivel = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITE_TEXTO);

  return { url, texto: textoVisivel, links };
}

// Passo 1 — só roda quando a empresa não tem site cadastrado (ou quando a
// fonte não é confiável, ver FONTES_SITE_NAO_CONFIAVEL mais abaixo). A conta
// de Mistral em uso não tem a tool `web_search` habilitada (a API devolve
// "WebSearchTool connector is not supported"), e usar o widget do Google CSE
// aqui traria uma segunda dependência de cota (ele usa o Gemini por baixo
// pra estruturar os resultados — e a cota diária do Gemini é facilmente
// esgotada). Por isso quem pesquisa de fato é uma busca simples e sem chave
// (DuckDuckGo Lite) — o Mistral só escolhe, entre os resultados reais, qual
// é o site oficial.
async function buscarCandidatosDuckDuckGo(query) {
  const resposta = await axios.post(
    'https://lite.duckduckgo.com/lite/',
    new URLSearchParams({ q: query }).toString(),
    {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; api-busca-empregos/1.0; +validacao-empresa)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const html = String(resposta.data);
  const candidatos = [];
  const RESULTADO_REGEX = /<a rel="nofollow" href="([^"]+)" class='result-link'>(.*?)<\/a>/gis;
  let m;
  while ((m = RESULTADO_REGEX.exec(html)) && candidatos.length < 8) {
    const url = m[1].trim();
    const titulo = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (url) candidatos.push({ titulo, url });
  }
  return candidatos;
}

async function buscarUrlSite(nome, localizacao) {
  let candidatos;
  try {
    candidatos = await buscarCandidatosDuckDuckGo(`${nome} site oficial${localizacao ? ` ${localizacao}` : ''}`);
  } catch (erro) {
    console.error(`Erro ao buscar candidatos de site pra "${nome}": ${erro.message}`);
    return null;
  }
  if (candidatos.length === 0) return null;

  const listaCandidatos = candidatos.map((c, i) => `${i + 1}. ${c.titulo} -> ${c.url}`).join('\n');
  const prompt = montarPrompt('escolher_site_oficial', {
    nome,
    localizacao_sufixo: localizacao ? ` (localizada em ${localizacao})` : '',
    lista_candidatos: listaCandidatos,
  });

  try {
    const { texto } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
    });
    const dados = texto ? parseRespostaJson(texto) : null;
    const url = dados?.url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch (erro) {
    console.error(`Erro ao escolher URL do site de "${nome}": ${erro.message}`);
    return null;
  }
}

// Passo 2 — mapeia, a partir da home já buscada, a URL da página de
// "trabalhe conosco"/vagas e a de contato, se existirem entre os links reais
// da página (evita o modelo inventar uma URL).
async function mapearPaginasRelevantes(urlBase, homeTexto, links) {
  const listaLinks = links.map((l) => `- ${l.texto || '(sem texto)'} -> ${l.href}`).join('\n');
  const prompt = montarPrompt('mapear_paginas_relevantes', {
    url_base: urlBase,
    lista_links: listaLinks || '(nenhum link encontrado)',
    home_texto: homeTexto,
  });

  try {
    const { texto } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
    });
    const dados = texto ? parseRespostaJson(texto) : null;
    return {
      urlVagas: typeof dados?.url_vagas === 'string' && dados.url_vagas.trim() ? dados.url_vagas.trim() : null,
      urlContato: typeof dados?.url_contato === 'string' && dados.url_contato.trim() ? dados.url_contato.trim() : null,
    };
  } catch (erro) {
    console.error(`Erro ao mapear páginas relevantes de "${urlBase}": ${erro.message}`);
    return { urlVagas: null, urlContato: null };
  }
}

async function extrairEmailDoTexto(rotulo, texto) {
  const prompt = montarPrompt('extrair_email', {
    rotulo_sufixo: rotulo ? ` de ${rotulo}` : '',
    texto,
  });

  try {
    const { texto: resposta } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
    });
    const dados = resposta ? parseRespostaJson(resposta) : null;
    const email = dados?.email;
    return typeof email === 'string' && email.trim() ? email.trim() : null;
  } catch (erro) {
    console.error(`Erro ao extrair e-mail (${rotulo}): ${erro.message}`);
    return null;
  }
}

// Passo 3 — e-mail de recrutamento/vagas, prioritário.
function emailDeVagas(textoPaginaVagas) {
  return extrairEmailDoTexto('vagas/trabalhe conosco', textoPaginaVagas);
}

// Passo 4 — fallback: e-mail de contato geral.
function emailDeContato(textoPaginaContato) {
  return extrairEmailDoTexto('contato', textoPaginaContato);
}

// Passo 5 — nome oficial + resumo do que a empresa faz.
async function descricaoEDaEmpresa(homeTexto) {
  const prompt = montarPrompt('descricao_da_empresa', { home_texto: homeTexto });

  try {
    const { texto } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
    });
    const dados = texto ? parseRespostaJson(texto) : null;
    const nome = dados?.nome;
    const descricao = dados?.descricao;
    return {
      nome: typeof nome === 'string' && nome.trim() ? nome.trim() : null,
      descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
    };
  } catch (erro) {
    console.error(`Erro ao extrair nome/descrição da empresa: ${erro.message}`);
    return { nome: null, descricao: null };
  }
}

// O "site" que vem do crawler do Google CSE é só um link de resultado de
// busca (a própria empresa já nasce com motivo_duvida avisando "nome e site
// precisam de revisão manual") — não tem a confiabilidade do "blog" de uma
// org do GitHub. Prints nunca têm site nenhum (busca.js sempre grava
// `site: null`). Pra essas duas fontes, o nome é o único dado confiável, e é
// a partir dele que o Mistral tem que buscar a URL de novo — mesmo que já
// exista algo salvo em `site`.
const FONTES_SITE_NAO_CONFIAVEL = new Set(['duckduckgo', 'google_cse_gemini', 'print']);

// Orquestra os 5 passos. Critério de validade: e-mail + nome + descrição
// têm que ter sido encontrados — falta de qualquer um vira 'invalida', no
// mesmo formato que confirmarUmaEmpresa (empresas.js) já usa.
async function confirmarComMistral(empresa) {
  const siteConfiavel = empresa.site && !FONTES_SITE_NAO_CONFIAVEL.has(empresa.fonte);

  let url = siteConfiavel ? empresa.site : null;
  if (!url && empresa.nome) {
    url = await buscarUrlSite(empresa.nome, empresa.localizacao);
  }
  // Sem achar nada na busca, mas com um site (não confiável) salvo, ainda
  // vale tentar esse — melhor que desistir de cara.
  if (!url) url = empresa.site || null;

  if (!url) {
    return { tipo: 'invalida', motivo: 'Não foi possível encontrar o site oficial da empresa.' };
  }

  let home;
  try {
    home = await buscarPagina(url);
  } catch (erro) {
    return { tipo: 'invalida', motivo: `Falha ao acessar o site: ${erro.message}` };
  }

  const { urlVagas, urlContato } = await mapearPaginasRelevantes(url, home.texto, home.links);

  let email = null;
  if (urlVagas) {
    try {
      const paginaVagas = await buscarPagina(urlVagas);
      email = await emailDeVagas(paginaVagas.texto);
    } catch (erro) {
      console.error(`Falha ao acessar página de vagas "${urlVagas}": ${erro.message}`);
    }
  }

  if (!email) {
    let textoContato = home.texto;
    if (urlContato) {
      try {
        const paginaContato = await buscarPagina(urlContato);
        textoContato = paginaContato.texto;
      } catch (erro) {
        console.error(`Falha ao acessar página de contato "${urlContato}": ${erro.message}`);
      }
    }
    email = await emailDeContato(textoContato);
  }

  if (!email) {
    return { tipo: 'invalida', motivo: 'Nenhum e-mail de contato encontrado no site.' };
  }

  const { nome, descricao } = await descricaoEDaEmpresa(home.texto);
  if (!nome || !descricao) {
    return { tipo: 'invalida', motivo: 'Não foi possível identificar o nome/descrição da empresa no site.' };
  }

  return { tipo: 'confirmada', nome, site: url, email, descricao };
}

module.exports = {
  buscarPagina,
  buscarUrlSite,
  mapearPaginasRelevantes,
  emailDeVagas,
  emailDeContato,
  descricaoEDaEmpresa,
  confirmarComMistral,
};
