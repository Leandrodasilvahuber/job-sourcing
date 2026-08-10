const { gerarConteudo } = require('./gemini');
const { buscar: buscarGoogle } = require('../crawlers/googleCseCrawler');

// O grounding nativo do Gemini (tools: google_search) cobra por busca mesmo
// dentro da "cota gratuita" e exige faturamento habilitado no projeto — como
// este projeto não tem conta de faturamento vinculada, toda chamada com essa
// tool falha com 429 imediato. Em vez disso, reaproveitamos o widget gratuito
// do Google CSE (mesmo usado pelo crawler) pra buscar contexto real da web e
// repassar pro Gemini sintetizar.
//
// Limitação conhecida: só usamos título/link/trecho dos resultados de busca,
// sem navegar até a página real do site — empresas com pouca presença
// indexada podem ser incorretamente avaliadas como "não é software" ou sem
// stack. É por isso que a decisão de negócio em empresas.js é "fica
// pendente" em vez de "descarta": dá pra tentar de novo depois.
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
- Se a empresa atua no ramo de software (desenvolvimento, produto digital, consultoria de TI) — isso é essencial pra decisão que será tomada depois, então seja explícito mesmo quando os indícios forem fracos ou ausentes.
- Ramo de atuação, público-alvo e localização (cidade/país).
- Um resumo do que a empresa faz: produtos/serviços, diferenciais, mercado em que atua.
- Stack de tecnologia / ferramentas mencionadas (linguagens, frameworks, cloud, etc.), se houver menção nos resultados.
- Endereços de e-mail de contato mencionados nos resultados — procure especialmente em páginas de "fale conosco" ou "trabalhe conosco", mas considere qualquer e-mail de contato relevante (ex: contato@, rh@, jobs@, careers@, contact@, hello@), não só desses dois tipos de página.
- Outros canais de contato relevantes (telefone, formulário, redes sociais).
- Qualquer sinal de que a empresa pode não existir, estar inativa, ou ser uma fraude/spam.
- Se os resultados forem insuficientes ou não relacionados à empresa, diga isso explicitamente em vez de supor.

Formate a resposta como um relatório em markdown com seções claras (## Existência, ## Empresa de Software?, ## Sobre, ## Stack, ## Contatos, ## Observações). Seja objetivo e cite as URLs dos resultados usados.
`.trim();
}

function montarPromptAnalise(markdown) {
  return `
Você receberá um relatório de pesquisa em markdown sobre uma empresa. Analise o relatório e responda APENAS com um objeto JSON (sem texto adicional, sem blocos de código markdown) no formato do schema fornecido.

Regras:
- "existe": true se o relatório traz evidências razoáveis de que a empresa é real e opera (site oficial, presença online consistente, notícias); false se não há evidências suficientes ou há sinais de fraude/inexistência.
- "eh_empresa_software": true somente se o relatório indica claramente que a empresa desenvolve software, presta serviços de TI/consultoria tecnológica, ou tem produto digital como núcleo do negócio. Em caso de dúvida ou informação insuficiente, responda false.
- "stack": lista de tecnologias/ferramentas mencionadas no relatório (linguagens, frameworks, bancos de dados, cloud, etc.). Lista vazia se nada for mencionado.
- "resumo": um parágrafo curto (2-4 frases) descrevendo o que a empresa faz, público-alvo e diferenciais, com base apenas no relatório. Se não houver informação suficiente, diga isso em vez de inventar.
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
    eh_empresa_software: { type: 'BOOLEAN' },
    stack: { type: 'ARRAY', items: { type: 'STRING' } },
    resumo: { type: 'STRING' },
    emails: { type: 'ARRAY', items: { type: 'STRING' } },
    observacoes: { type: 'STRING' },
  },
  required: ['existe', 'eh_empresa_software', 'stack', 'resumo', 'emails', 'observacoes'],
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
    ehEmpresaSoftware: !!analise.eh_empresa_software,
    stack: Array.isArray(analise.stack) ? analise.stack.filter(Boolean) : [],
    resumo: analise.resumo || null,
    emails: Array.isArray(analise.emails) ? analise.emails.filter(Boolean) : [],
    observacoes: analise.observacoes || null,
  };
}

module.exports = { pesquisarEmpresa };
