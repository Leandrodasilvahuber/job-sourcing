const { gerarConteudo } = require('./gemini');
const { buscar: buscarGoogle } = require('../crawlers/googleCseCrawler');

// O grounding nativo do Gemini (tools: google_search) cobra por busca mesmo
// dentro da "cota gratuita" e exige faturamento habilitado no projeto — como
// este projeto não tem conta de faturamento vinculada, toda chamada com essa
// tool falha com 429 imediato. Em vez disso, reaproveitamos o widget gratuito
// do Google CSE (mesmo usado pelo crawler) pra buscar contexto real da web e
// repassar pro Gemini sintetizar.
async function buscarContextoWeb({ nome, site }) {
  const query = `${nome} ${site || ''}`.trim();
  const resultados = await buscarGoogle(query);
  return resultados.slice(0, 5).map((r) => ({
    titulo: r.title,
    url: r.link,
    trecho: r.snippet || '',
  }));
}

function formatarContexto(resultados) {
  if (resultados.length === 0) return '(nenhum resultado encontrado na busca)';
  return resultados
    .map((r, i) => `${i + 1}. ${r.titulo}\n   URL: ${r.url}\n   ${r.trecho}`)
    .join('\n\n');
}

function montarPromptPesquisa({ nome, site, contexto }) {
  return `
Você é um assistente de pesquisa. Abaixo estão resultados de uma busca no Google sobre a empresa a seguir. Use APENAS essas informações (não invente dados que não estejam nos resultados) para produzir um relatório em markdown.

Nome da empresa: ${nome}
Site informado: ${site || '(não informado)'}

Resultados da busca:
${contexto}

Inclua no relatório, quando encontrar nos resultados acima:
- Confirmação de que a empresa existe (site oficial, perfis em redes sociais/LinkedIn, notícias, registros públicos).
- Ramo de atuação e localização (cidade/país).
- Endereços de e-mail de contato (ex: contato@, rh@, jobs@, careers@) mencionados nos resultados.
- Outros canais de contato relevantes (telefone, formulário, redes sociais).
- Qualquer sinal de que a empresa pode não existir, estar inativa, ou ser uma fraude/spam.
- Se os resultados forem insuficientes ou não relacionados à empresa, diga isso explicitamente em vez de supor.

Formate a resposta como um relatório em markdown com seções claras (## Existência, ## Sobre, ## Contatos, ## Observações). Seja objetivo e cite as URLs dos resultados usados.
`.trim();
}

function montarPromptAnalise(markdown) {
  return `
Você receberá um relatório de pesquisa em markdown sobre uma empresa. Analise o relatório e responda APENAS com um objeto JSON (sem texto adicional, sem blocos de código markdown) no formato do schema fornecido.

Regras:
- "existe": true se o relatório traz evidências razoáveis de que a empresa é real e opera (site oficial, presença online consistente, notícias); false se não há evidências suficientes ou há sinais de fraude/inexistência.
- "emails": lista de todos os endereços de e-mail de contato mencionados no relatório (sem duplicatas, em minúsculas). Lista vazia se nenhum for encontrado.
- "observacoes": um resumo curto (1-3 frases) explicando a conclusão sobre existência e, se aplicável, ressalvas.

Relatório:
"""
${markdown}
"""
`.trim();
}

const SCHEMA_ANALISE = {
  type: 'OBJECT',
  properties: {
    existe: { type: 'BOOLEAN' },
    emails: { type: 'ARRAY', items: { type: 'STRING' } },
    observacoes: { type: 'STRING' },
  },
  required: ['existe', 'emails', 'observacoes'],
};

// O Gemini às vezes envolve o JSON em ```json mesmo com responseMimeType
// setado — remove o fence antes de parsear.
function parseJsonDefensivo(texto) {
  let limpo = texto.trim();
  const fence = limpo.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) limpo = fence[1].trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    throw new Error(`Resposta da etapa de análise do Gemini não é JSON válido: ${e.message}`);
  }
}

async function pesquisarStage1({ nome, site }) {
  const resultados = await buscarContextoWeb({ nome, site });
  const contexto = formatarContexto(resultados);
  const { texto } = await gerarConteudo({
    contents: [{ role: 'user', parts: [{ text: montarPromptPesquisa({ nome, site, contexto }) }] }],
  });
  return texto;
}

async function pesquisarStage2(markdown) {
  const { texto } = await gerarConteudo({
    contents: [{ role: 'user', parts: [{ text: montarPromptAnalise(markdown) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_ANALISE },
  });
  return parseJsonDefensivo(texto);
}

async function pesquisarEmpresa({ nome, site }) {
  const markdown = await pesquisarStage1({ nome, site });
  const analise = await pesquisarStage2(markdown);

  return {
    markdown,
    existe: !!analise.existe,
    emails: Array.isArray(analise.emails) ? analise.emails.filter(Boolean) : [],
    observacoes: analise.observacoes || null,
  };
}

module.exports = { pesquisarEmpresa };
