const axios = require('axios');

// Crawler de descoberta de empresas via DuckDuckGo Lite (HTML puro, sem
// chave, sem navegador headless) — substitui o antigo googleCseCrawler.js
// nesse papel: aquele dependia do widget do Google CSE (Puppeteer, sujeito a
// reCAPTCHA) E do Gemini pra estruturar o texto renderizado em JSON. Aqui o
// HTML de resultado já é regular o suficiente pra extrair título/link/trecho
// direto com regex, sem precisar de LLM nenhum nesse passo.
const FONTE_USO = 'duckduckgo';
const PAGINAS_POR_QUERY_PADRAO = 10;
const DELAY_MIN_MS = 1000;
const DELAY_MAX_MS = 2500;

function paginasPorQuery() {
  const v = Number(process.env.DUCKDUCKGO_PAGINAS_POR_QUERY);
  return Number.isFinite(v) && v > 0 ? v : PAGINAS_POR_QUERY_PADRAO;
}

// Delay curto entre páginas — bem mais leve que o do widget do Google (não
// tem navegador nem reCAPTCHA aqui), mas ainda assim espaça as chamadas pra
// não parecer tráfego automatizado batendo sem pausa.
function aguardarAleatorio(minMs = DELAY_MIN_MS, maxMs = DELAY_MAX_MS) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

function decodificarEntidades(texto) {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extrairItens(html) {
  const itens = [];
  // Cada resultado no HTML do Lite é uma sequência de <tr>: um com o link
  // (class result-link) e um com o snippet (class result-snippet) — casamos
  // os dois por proximidade no texto. O domínio não vem do span 'link-text'
  // (às vezes mostra a URL com caminho, não só o domínio) — extraímos direto
  // do href com o construtor URL, que é sempre confiável.
  const BLOCO_REGEX = /<a rel="nofollow" href="([^"]+)" class='result-link'>(.*?)<\/a>[\s\S]*?class='result-snippet'>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = BLOCO_REGEX.exec(html))) {
    const link = m[1].trim();
    const title = decodificarEntidades(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const snippet = decodificarEntidades(m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    let displayLink = null;
    try {
      displayLink = new URL(link).hostname;
    } catch {
      // href inválido — ignora esse item
    }
    if (link && displayLink) itens.push({ title, link, snippet, displayLink });
  }
  return itens;
}

// Extrai os campos ocultos do formulário "Next Page" (se existir) — são
// necessários pra pedir a página seguinte (o token `vqd` amarra a paginação
// à busca original, não dá pra só incrementar `s` sozinho).
function extrairProximaPagina(html) {
  const formMatch = html.match(/<form class="next_form"[\s\S]*?<\/form>/);
  if (!formMatch) return null;

  const form = formMatch[0];
  const campos = {};
  const CAMPO_REGEX = /<input type="hidden" name="([^"]+)" value="([^"]*)"/g;
  let m;
  while ((m = CAMPO_REGEX.exec(form))) {
    campos[m[1]] = m[2];
  }
  return Object.keys(campos).length > 0 ? campos : null;
}

async function requisitarPagina(campos) {
  const resposta = await axios.post(
    'https://lite.duckduckgo.com/lite/',
    new URLSearchParams(campos).toString(),
    {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; api-busca-empregos/1.0; +validacao-empresa)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  return String(resposta.data);
}

// Busca uma query, paginando via os campos ocultos do "Next Page" até
// `maxPaginas` ou até a busca não ter mais próxima página / não trazer
// resultado novo nenhum.
async function buscarComPaginacao(query, maxPaginas = paginasPorQuery()) {
  const itens = [];
  let campos = { q: query };

  for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
    if (pagina > 1) await aguardarAleatorio();

    const html = await requisitarPagina(campos);
    const itensDaPagina = extrairItens(html);
    if (itensDaPagina.length === 0) break;
    itens.push(...itensDaPagina);

    const proxima = extrairProximaPagina(html);
    if (!proxima) break;
    campos = proxima;
  }

  return itens;
}

const QUERIES = [
  { texto: '"desenvolvimento de software" empresa site:.br', pais: 'BR' },
  { texto: '"software house" site:.br', pais: 'BR' },
  { texto: '"fábrica de software" site:.br', pais: 'BR' },
  { texto: 'empresas de software Brasil', pais: 'BR' },
  { texto: '"empresa de tecnologia" desenvolvimento site:.br', pais: 'BR' },
  { texto: '"consultoria de TI" desenvolvimento de sistemas Brasil', pais: 'BR' },
  { texto: '"desenvolvimento de sistemas" empresa site:.br', pais: 'BR' },
  { texto: 'startup de tecnologia programação Brasil', pais: 'BR' },
  { texto: '"empresa de programação" Brasil', pais: 'BR' },
  { texto: '"dev house" OR "outsourcing de TI" Brasil', pais: 'BR' },
  { texto: 'agência de desenvolvimento de aplicativos e sistemas Brasil', pais: 'BR' },
  { texto: '"desenvolvimento de software" empresa site:.pt', pais: 'PT' },
  { texto: '"software house" Portugal', pais: 'PT' },
  { texto: '"fábrica de software" Portugal', pais: 'PT' },
  { texto: '"empresa de tecnologia" desenvolvimento site:.pt', pais: 'PT' },
  { texto: '"consultoria de TI" desenvolvimento de sistemas Portugal', pais: 'PT' },
  { texto: 'startup de tecnologia programação Portugal', pais: 'PT' },
];

/**
 * Orquestra a coleta: uma chamada a `buscarComPaginacao()` por query, cada
 * uma já paginando internamente até `paginasPorQuery()` páginas. O delay
 * aleatório aqui é entre queries (a paginação já tem o seu próprio).
 */
async function runDuckDuckGoCrawl(queries = QUERIES, { onCompany, jaColetada, deveParar } = {}) {
  const resultado = { processadas: 0, novas: 0, puladas: 0, limiteExcedido: false, resetEm: null, interrompida: false };

  for (const [indice, { texto, pais }] of queries.entries()) {
    if (deveParar && deveParar()) {
      resultado.interrompida = true;
      return resultado;
    }
    if (indice > 0) await aguardarAleatorio();

    let items;
    try {
      items = await buscarComPaginacao(texto);
    } catch (erro) {
      console.error(`Erro ao buscar "${texto}": ${erro.message}`);
      continue;
    }

    for (const item of items) {
      if (deveParar && deveParar()) {
        resultado.interrompida = true;
        return resultado;
      }
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
        motivo_duvida: 'Resultado de busca no DuckDuckGo — nome e site precisam de revisão manual.',
        pais,
      };
      resultado.processadas += 1;
      if (onCompany) {
        const info = await onCompany(empresa);
        if (info && info.changes > 0) resultado.novas += 1;
      }
    }
  }

  return resultado;
}

module.exports = {
  buscarComPaginacao,
  runDuckDuckGoCrawl,
  QUERIES,
  FONTE_USO,
  paginasPorQuery,
};
