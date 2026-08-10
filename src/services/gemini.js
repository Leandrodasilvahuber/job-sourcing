const axios = require('axios');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODELO_PADRAO = 'gemini-flash-latest';

class CredenciaisGeminiAusentesError extends Error {
  constructor(faltando) {
    super(`Credenciais do Gemini ausentes: ${faltando.join(', ')}.`);
    this.name = 'CredenciaisGeminiAusentesError';
    this.faltando = faltando;
  }
}

class GeminiQuotaExcedidaError extends Error {
  constructor(motivo) {
    super(`Quota da API do Gemini excedida (${motivo}).`);
    this.name = 'GeminiQuotaExcedidaError';
  }
}

class GeminiRespostaInvalidaError extends Error {
  constructor(motivo) {
    super(`Resposta inválida do Gemini: ${motivo}.`);
    this.name = 'GeminiRespostaInvalidaError';
  }
}

function modelo() {
  return process.env.GEMINI_MODEL || MODELO_PADRAO;
}

function apiKeyOuFalhar() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new CredenciaisGeminiAusentesError(['GEMINI_API_KEY']);
  return key;
}

// Extrai a mensagem real da API em vez do status HTTP genérico, no mesmo
// espírito de mensagemDeErroGoogle() no googleCrawler.js.
function mensagemDeErroGemini(erro) {
  const dadosErro = erro.response?.data?.error;
  if (dadosErro) {
    const partes = [`HTTP ${erro.response.status}`];
    if (dadosErro.status) partes.push(dadosErro.status);
    partes.push(dadosErro.message || erro.message);
    return partes.join(' — ');
  }
  return erro.message;
}

function ehErroDeQuotaGemini(erro) {
  return erro.response?.status === 429;
}

async function gerarConteudo({ contents, tools, generationConfig }) {
  const key = apiKeyOuFalhar();

  let resposta;
  try {
    resposta = await axios.post(
      `${API_BASE}/models/${modelo()}:generateContent?key=${key}`,
      {
        contents,
        ...(tools ? { tools } : {}),
        ...(generationConfig ? { generationConfig } : {}),
      },
      { timeout: 60000 },
    );
  } catch (erro) {
    if (ehErroDeQuotaGemini(erro)) {
      throw new GeminiQuotaExcedidaError(mensagemDeErroGemini(erro));
    }
    throw new Error(mensagemDeErroGemini(erro));
  }

  const candidato = resposta.data?.candidates?.[0];
  const texto = candidato?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  if (!texto) {
    throw new GeminiRespostaInvalidaError(candidato?.finishReason || 'resposta vazia');
  }

  return { texto, groundingMetadata: candidato?.groundingMetadata };
}

module.exports = {
  gerarConteudo,
  CredenciaisGeminiAusentesError,
  GeminiQuotaExcedidaError,
  GeminiRespostaInvalidaError,
};
