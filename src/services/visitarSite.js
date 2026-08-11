const axios = require('axios');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Regex solta em texto livre pega muito falso positivo (UUID em URL de
// imagem, hash de asset, preço, timestamp — tudo isso tem grupos de dígitos
// separados por traço parecidos com telefone). "tel:" em href é um sinal
// semântico explícito, sem essa ambiguidade.
const TEL_HREF_REGEX = /href\s*=\s*["']tel:([^"']+)["']/gi;

// Domínios de exemplo/placeholder comuns em atributos placeholder de
// formulários (ex: <input placeholder="seuemail@exemplo.com">) — não são
// contato real, então descartamos pra não gerar falso positivo.
const DOMINIOS_PLACEHOLDER = new Set([
  'exemplo.com', 'example.com', 'domain.com', 'yourdomain.com',
  'email.com', 'test.com', 'seudominio.com', 'seuemail.com',
]);

// Páginas reais às vezes embutem megabytes de dado (base64 de imagem/fonte
// inline, JSON de estado da aplicação, etc.) direto no HTML — nada disso
// contém contato, mas rodar regex sobre tudo isso é caro. Cortamos antes.
const LIMITE_HTML = 500_000;

function recortar(html) {
  return html.length > LIMITE_HTML ? html.slice(0, LIMITE_HTML) : html;
}

function extrairEmails(html) {
  const encontrados = recortar(html).match(EMAIL_REGEX) || [];
  const unicos = [...new Set(encontrados.map((e) => e.toLowerCase()))];
  return unicos.filter((e) => !DOMINIOS_PLACEHOLDER.has(e.split('@')[1]));
}

function extrairTelefones(html) {
  const recorte = recortar(html);
  const numeros = [...recorte.matchAll(TEL_HREF_REGEX)].map((m) =>
    decodeURIComponent(m[1]).replace(/[^\d+]/g, ''));
  const unicos = [...new Set(numeros)].filter((n) => n.replace(/\D/g, '').length >= 8);
  return unicos.slice(0, 5);
}

// Busca leve (HTTP, sem navegador) pela página do site informado, pra achar
// e-mail e telefone de contato. Erro de rede/HTTP (timeout, DNS, TLS,
// 404/500, conteúdo não-HTML) PROPAGA — a rota que chama isso decide o que
// fazer (hoje: qualquer erro vira 'invalida').
async function visitarSite(url) {
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
  return {
    emails: extrairEmails(html),
    telefones: extrairTelefones(html),
  };
}

module.exports = { visitarSite };
