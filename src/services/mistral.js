const axios = require('axios');
const { contagemAtual, incrementarUso, incrementarUsoEm, marcarEsgotado, proximaMeiaNoiteLocal } = require('./usoApi');

// 2026-09-07: passou a falar com o proxy LiteLLM local em vez da API do Mistral
// direto. As chaves, o rate limit por minuto e o fallback entre contas (essa
// conta Mistral -> segunda conta Mistral -> Gemini -> Groq) ficam centralizados
// no config.yaml do proxy, junto com Kanbu, OpenClaude e Orquestrador -- não
// depende mais de uma MISTRAL_API_KEY própria deste app.
const API_BASE = process.env.LLM_BASE_URL || 'http://127.0.0.1:4000/v1';
const MODELO_LITELLM = process.env.LLM_MODEL_MISTRAL || 'openclaude-mistral';
const FONTE_USO = 'mistral';
const FONTE_TOKENS = 'mistral_tokens';
const MODELO_PADRAO = MODELO_LITELLM;
// Visto no header x-ratelimit-limit-tokens-minute de uma resposta real da
// conta em uso (250000). É um limite por minuto, não diário — usamos como
// referência só pra dar um teto à barra de progresso do dashboard, não pra
// bloquear chamada nenhuma (quem já protege contra 429 é reservarVaga()).
const TOKENS_LIMITE_PADRAO = 250000;

function limiteDiario() {
  const v = Number(process.env.MISTRAL_DAILY_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Metade do limite real de tokens da conta — usado como teto "de margem de
// segurança" na barra de progresso do dashboard, a pedido explícito: a barra
// fica cheia (100%) ao usar metade da capacidade real, não a capacidade
// inteira.
function tetoTokens() {
  const v = Number(process.env.MISTRAL_TOKENS_LIMIT);
  const limite = Number.isFinite(v) && v > 0 ? v : TOKENS_LIMITE_PADRAO;
  return Math.floor(limite / 2);
}

function tokensUsadosHoje() {
  return contagemAtual(FONTE_TOKENS);
}

class CredenciaisMistralAusentesError extends Error {
  constructor(faltando) {
    super(`Credenciais do Mistral ausentes: ${faltando.join(', ')}.`);
    this.name = 'CredenciaisMistralAusentesError';
    this.faltando = faltando;
  }
}

class MistralQuotaExcedidaError extends Error {
  constructor(motivo, resetEm) {
    super(`Limite de requisições do Mistral atingido (${motivo}).`);
    this.name = 'MistralQuotaExcedidaError';
    this.recurso = 'mistral';
    this.resetEm = resetEm;
  }
}

class MistralRespostaInvalidaError extends Error {
  constructor(motivo) {
    super(`Resposta inválida do Mistral: ${motivo}.`);
    this.name = 'MistralRespostaInvalidaError';
  }
}

function modelo() {
  return MODELO_PADRAO;
}

function apiKeyOuFalhar() {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new CredenciaisMistralAusentesError(['LLM_API_KEY']);
  return key;
}

// Extrai a mensagem real da API em vez do status HTTP genérico, no mesmo
// espírito de mensagemDeErroGemini() em gemini.js.
function mensagemDeErroMistral(erro) {
  const dadosErro = erro.response?.data;
  if (dadosErro) {
    const partes = [`HTTP ${erro.response.status}`];
    const msg = dadosErro.message || dadosErro.error?.message || dadosErro.detail;
    if (msg) partes.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
    return partes.join(' — ');
  }
  return erro.message;
}

function ehErroDeQuotaMistral(erro) {
  return erro.response?.status === 429;
}

// 2026-09-07: desde a migração pro proxy LiteLLM local, o limite real por
// conta é 50 req/min (rpm nos aliases openclaude-mistral/-2 do config.yaml
// do proxy) — os 4/min antigos eram do header x-ratelimit-limit-req-minute
// de quando o app chamava a API do Mistral direto, sem proxy. Mantido como
// fila (e não removido) porque o pipeline de pesquisaEmpresa.js (até 5
// chamadas por empresa) ainda pode estourar o limite em rajada, mesmo com
// chamadas concorrentes (ex: confirmação em massa).
const LIMITE_REQ_MINUTO = Number(process.env.MISTRAL_REQ_POR_MINUTO) || 50;
const JANELA_MS = 60_000;
const historicoChamadas = [];
let filaEspera = Promise.resolve();

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reservarVaga() {
  const proxima = filaEspera.then(async () => {
    for (;;) {
      const agora = Date.now();
      while (historicoChamadas.length && agora - historicoChamadas[0] > JANELA_MS) {
        historicoChamadas.shift();
      }
      if (historicoChamadas.length < LIMITE_REQ_MINUTO) {
        historicoChamadas.push(agora);
        return;
      }
      await aguardar(JANELA_MS - (agora - historicoChamadas[0]) + 250);
    }
  });
  filaEspera = proxima.catch(() => {});
  return proxima;
}

// Chamada de baixo nível ao chat completions do Mistral. `responseFormat`
// segue o mesmo formato da API da OpenAI/Mistral: { type: 'json_object' }
// pra forçar saída JSON (os prompts do pesquisaEmpresa.js pedem o schema no
// próprio texto, já que o Mistral não tem um responseSchema tipado como o
// Gemini).
async function chatCompletion({ messages, tools, toolChoice, responseFormat }) {
  const key = apiKeyOuFalhar();

  const limite = limiteDiario();
  if (limite && contagemAtual(FONTE_USO) >= limite) {
    throw new MistralQuotaExcedidaError('contador local', proximaMeiaNoiteLocal());
  }

  incrementarUso(FONTE_USO);
  await reservarVaga();

  let resposta;
  try {
    resposta = await axios.post(
      `${API_BASE}/chat/completions`,
      {
        model: modelo(),
        messages,
        ...(tools ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      },
      {
        // >90s: o proxy LiteLLM (router_settings.timeout: 90 no config.yaml)
        // as vezes trava na conta primaria do Mistral (tier gratuito, hang
        // intermitente conhecido) e só resolve via fallback (mistral-2 ->
        // gemini -> groq) dentro desses 90s. Um timeout aqui menor que isso
        // (era 60000) mata a chamada bem na hora em que o fallback ia dar certo.
        timeout: 100000,
        headers: { Authorization: `Bearer ${key}` },
      },
    );
  } catch (erro) {
    if (ehErroDeQuotaMistral(erro)) {
      marcarEsgotado(FONTE_USO, limite);
      throw new MistralQuotaExcedidaError(mensagemDeErroMistral(erro), proximaMeiaNoiteLocal());
    }
    throw new Error(mensagemDeErroMistral(erro));
  }

  const totalTokens = resposta.data?.usage?.total_tokens;
  if (Number.isFinite(totalTokens)) incrementarUsoEm(FONTE_TOKENS, totalTokens);

  const mensagem = resposta.data?.choices?.[0]?.message;
  if (!mensagem) {
    throw new MistralRespostaInvalidaError(resposta.data?.choices?.[0]?.finish_reason || 'resposta vazia');
  }

  return { mensagem, texto: mensagem.content };
}

module.exports = {
  chatCompletion,
  FONTE_USO,
  limiteDiario,
  tokensUsadosHoje,
  tetoTokens,
  CredenciaisMistralAusentesError,
  MistralQuotaExcedidaError,
  MistralRespostaInvalidaError,
};
