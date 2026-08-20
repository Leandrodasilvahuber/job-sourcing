const db = require('../db/database');

const buscarPrompt = db.prepare('SELECT * FROM prompts WHERE chave = ?');
const salvarPrompt = db.prepare(`
  INSERT INTO prompts (chave, conteudo, atualizado_em)
  VALUES (@chave, @conteudo, CURRENT_TIMESTAMP)
  ON CONFLICT (chave) DO UPDATE SET
    conteudo = excluded.conteudo,
    atualizado_em = excluded.atualizado_em
`);
const removerPrompt = db.prepare('DELETE FROM prompts WHERE chave = ?');

// Prompts usados por pesquisaEmpresa.js na confirmação em massa (via
// Mistral). Cada um tem um texto padrão (o mesmo que já estava hardcoded
// antes desta feature) e pode ser sobrescrito pelo usuário via UI — o
// registro em `prompts` some quando ele restaura o padrão, então
// `montarPrompt` sempre cai de volta pro texto em código.
const DEFINICOES = {
  escolher_site_oficial: {
    label: 'Escolher site oficial',
    descricao: 'Escolhe, entre os resultados de busca, qual é o site oficial da empresa.',
    placeholders: ['nome', 'localizacao_sufixo', 'lista_candidatos'],
    padrao: `Resultados de busca pra encontrar o site oficial da empresa "{{nome}}"{{localizacao_sufixo}}:
{{lista_candidatos}}

Qual desses resultados é o site oficial da empresa? Responda APENAS um objeto JSON no formato: {"url": "https://..."} usando exatamente uma das URLs listadas acima, ou {"url": null} se nenhuma parecer ser o site oficial. Não precisa validar profundamente, o primeiro resultado plausível já serve.`,
  },
  mapear_paginas_relevantes: {
    label: 'Mapear páginas relevantes',
    descricao: 'Identifica, entre os links da home, a página de vagas e a de contato.',
    placeholders: ['url_base', 'lista_links', 'home_texto'],
    padrao: `Site: {{url_base}}

Links encontrados na página inicial:
{{lista_links}}

Texto visível da página inicial:
"""
{{home_texto}}
"""

A partir dos links acima, identifique:
- "url_vagas": a URL da página de "trabalhe conosco", carreiras ou vagas, se existir entre os links.
- "url_contato": a URL da página de contato, se existir entre os links.

Use somente URLs que estão na lista de links acima — nunca invente uma URL. Responda APENAS um objeto JSON no formato: {"url_vagas": "https://..." ou null, "url_contato": "https://..." ou null}.`,
  },
  extrair_email: {
    label: 'Extrair e-mail de contato',
    descricao: 'Encontra um e-mail de contato no texto de uma página (de vagas ou de contato).',
    placeholders: ['rotulo_sufixo', 'texto'],
    padrao: `Texto de uma página{{rotulo_sufixo}} de uma empresa:
"""
{{texto}}
"""

Encontre um e-mail de contato nessa página. Responda APENAS um objeto JSON no formato: {"email": "contato@empresa.com"} — ou {"email": null} se não houver nenhum e-mail de contato real no texto (ignore e-mails de exemplo/placeholder).`,
  },
  descricao_da_empresa: {
    label: 'Nome e descrição da empresa',
    descricao: 'Identifica o nome oficial da empresa e um resumo curto do que ela faz.',
    placeholders: ['home_texto'],
    padrao: `Texto da página inicial de uma empresa:
"""
{{home_texto}}
"""

Identifique o nome oficial da empresa e um resumo curto (1-2 frases) do que ela faz. Responda APENAS um objeto JSON no formato: {"nome": "...", "descricao": "..."} — use null em qualquer um dos dois campos se não conseguir identificar a partir do texto.`,
  },
};

function paraApi(chave) {
  const def = DEFINICOES[chave];
  const registro = buscarPrompt.get(chave);
  return {
    chave,
    label: def.label,
    descricao: def.descricao,
    placeholders: def.placeholders,
    padrao: def.padrao,
    conteudo: registro?.conteudo ?? def.padrao,
    personalizado: !!registro,
    atualizado_em: registro?.atualizado_em ?? null,
  };
}

function listar() {
  return Object.keys(DEFINICOES).map(paraApi);
}

function salvar(chave, conteudo) {
  if (!DEFINICOES[chave]) throw new Error(`Prompt desconhecido: ${chave}`);
  salvarPrompt.run({ chave, conteudo });
  return paraApi(chave);
}

function restaurarPadrao(chave) {
  if (!DEFINICOES[chave]) throw new Error(`Prompt desconhecido: ${chave}`);
  removerPrompt.run(chave);
  return paraApi(chave);
}

function restaurarTodosPadrao() {
  for (const chave of Object.keys(DEFINICOES)) removerPrompt.run(chave);
  return listar();
}

// Monta o prompt final substituindo cada {{placeholder}} pelo valor
// correspondente em `valores`. Usa o template customizado salvo no banco,
// se existir, senão o padrão de DEFINICOES.
function montarPrompt(chave, valores) {
  const def = DEFINICOES[chave];
  if (!def) throw new Error(`Prompt desconhecido: ${chave}`);
  const registro = buscarPrompt.get(chave);
  let template = registro?.conteudo ?? def.padrao;
  for (const [placeholder, valor] of Object.entries(valores)) {
    template = template.split(`{{${placeholder}}}`).join(valor ?? '');
  }
  return template;
}

module.exports = { listar, salvar, restaurarPadrao, restaurarTodosPadrao, montarPrompt };
