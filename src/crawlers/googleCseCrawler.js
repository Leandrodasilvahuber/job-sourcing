const http = require('http');
const { obterBrowser } = require('../services/browserManager');
const { gerarConteudo } = require('../services/gemini');
const { contagemAtual, incrementarUso, proximaMeiaNoiteLocal } = require('../services/usoApi');

const FONTE_USO = 'google_cse_gemini';
const LIMITE_DIARIO_PADRAO = 100;

function limiteDiario() {
  const v = Number(process.env.GOOGLE_CSE_DAILY_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : LIMITE_DIARIO_PADRAO;
}

class QuotaExcedidaError extends Error {
  constructor(motivo, resetEm) {
    super(`Limite diário de buscas via Google CSE atingido (${motivo}). Reseta às ${resetEm.toISOString()}.`);
    this.name = 'QuotaExcedidaError';
    this.recurso = 'google_cse';
    this.resetEm = resetEm;
  }
}

class CredenciaisAusentesError extends Error {
  constructor(faltando) {
    super(`Credenciais ausentes: ${faltando.join(', ')}.`);
    this.name = 'CredenciaisAusentesError';
    this.faltando = faltando;
  }
}

function credenciaisFaltando() {
  const faltando = [];
  if (!process.env.GOOGLE_CSE_ID) faltando.push('GOOGLE_CSE_ID');
  if (!process.env.GEMINI_API_KEY) faltando.push('GEMINI_API_KEY');
  return faltando;
}

// Verifica ANTES de iniciar a coleta se ainda há limite local — se não houver,
// recusa a execução em vez de deixar o crawler abrir um browser à toa.
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

// O widget do Google CSE (cse.js) precisa ser carregado a partir de uma
// origem HTTP real — via page.setContent() (about:blank) o script interno do
// Google quebra tentando ler propriedades de document.location. Por isso
// subimos um servidor HTTP local mínimo, só pra servir essa página estática.
let servidorPromise = null;

function paginaWidgetHtml() {
  const cx = process.env.GOOGLE_CSE_ID;
  return `<!DOCTYPE html><html><head>
<script>
  window.__gcse = {
    parsetags: 'explicit',
    initializationCallback: function () { window.__gcseReady = true; },
    searchCallbacks: {
      web: {
        starting: function () { window.__buscaConcluida = false; },
        rendered: function () { window.__buscaConcluida = true; }
      }
    }
  };
</script>
<script async src="https://cse.google.com/cse.js?cx=${cx}"></script>
</head><body>
<div id="resultados"></div>
</body></html>`;
}

function obterServidorWidget() {
  if (!servidorPromise) {
    servidorPromise = new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(paginaWidgetHtml());
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve({ server, url: `http://127.0.0.1:${port}/` });
      });
    });
  }
  return servidorPromise;
}

// Dispara a busca no widget e aguarda o texto renderizado dos resultados.
// Não há endpoint JSON aqui — o widget renderiza de forma assíncrona no DOM,
// então o sinal de "pronto" é o callback searchCallbacks.web.rendered.
async function capturarTextoBusca(query) {
  const { url } = await obterServidorWidget();
  const browser = await obterBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForFunction(() => window.__gcseReady === true, { timeout: 15000 });

    await page.evaluate(() => {
      google.search.cse.element.render({ div: 'resultados', tag: 'searchresults-only', gname: 'crawler' });
    });
    // O render() precisa de um instante pra registrar o elemento antes do execute().
    await new Promise((r) => setTimeout(r, 1000));

    await page.evaluate((q) => {
      google.search.cse.element.getElement('crawler').execute(q);
    }, query);

    await page.waitForFunction(() => window.__buscaConcluida === true, { timeout: 20000 });

    return await page.evaluate(() => document.querySelector('#resultados')?.innerText || '');
  } finally {
    await page.close();
  }
}

const SCHEMA_ITENS = {
  type: 'OBJECT',
  properties: {
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          link: { type: 'STRING' },
          snippet: { type: 'STRING' },
          displayLink: { type: 'STRING' },
        },
        required: ['title', 'link', 'displayLink'],
      },
    },
  },
  required: ['itens'],
};

function montarPromptEstruturacao(textoBruto, query) {
  return `
Abaixo está o texto renderizado por um widget de busca do Google para a query "${query}". Extraia cada resultado de busca listado e devolva APENAS um objeto JSON (sem texto adicional) no formato do schema fornecido.

Regras:
- "title": título do resultado.
- "link": URL completa do resultado (use "https://" + displayLink se só houver o domínio visível, sem caminho).
- "displayLink": domínio do resultado (ex: "exemplo.com.br").
- "snippet": o trecho/descrição do resultado, se houver.
- Ignore elementos que não são resultados de busca (contagem de resultados, "Ordenar por", paginação, texto de rodapé "Pesquisar ... no Google").
- Se não houver nenhum resultado, devolva "itens": [].

Texto:
"""
${textoBruto}
"""
`.trim();
}

async function estruturarComGemini(textoBruto, query) {
  if (!textoBruto.trim()) return [];
  const { texto } = await gerarConteudo({
    contents: [{ role: 'user', parts: [{ text: montarPromptEstruturacao(textoBruto, query) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_ITENS },
  });
  const dados = JSON.parse(texto);
  return Array.isArray(dados.itens) ? dados.itens : [];
}

async function buscar(query) {
  checarAntesDeChamar();
  const textoBruto = await capturarTextoBusca(query);
  const itens = await estruturarComGemini(textoBruto, query);
  incrementarUso(FONTE_USO);
  return itens;
}

// Lista pequena e editável, no mesmo espírito do PAISES do githubCrawler.
const QUERIES = [
  { texto: '"desenvolvimento de software" empresa site:.br', pais: 'BR' },
  { texto: '"software house" site:.br', pais: 'BR' },
  { texto: '"fábrica de software" site:.br', pais: 'BR' },
  { texto: '"desenvolvimento de software" empresa site:.pt', pais: 'PT' },
  { texto: '"software house" Portugal', pais: 'PT' },
  { texto: '"fábrica de software" Portugal', pais: 'PT' },
];

/**
 * Orquestra a coleta. Uma busca por query (o widget não expõe paginação
 * programática de forma simples, então PAGINAS_POR_QUERY não existe mais —
 * cada query já retorna todos os itens renderizados na primeira "página").
 */
async function runGoogleCrawl(queries = QUERIES, { onCompany, jaColetada } = {}) {
  garantirLimiteDisponivel();

  const resultado = { processadas: 0, novas: 0, puladas: 0, limiteExcedido: false, resetEm: null };

  for (const { texto, pais } of queries) {
    let items;
    try {
      items = await buscar(texto);
    } catch (erro) {
      if (erro instanceof QuotaExcedidaError) {
        resultado.limiteExcedido = true;
        resultado.resetEm = erro.resetEm;
        return resultado;
      }
      console.error(`Erro ao buscar "${texto}": ${erro.message}`);
      continue;
    }

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
  limiteDiario,
};
