const axios = require('axios');
const { contagemAtual, incrementarUso, marcarEsgotado, proximaMeiaNoiteLocal } = require('./usoApi');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const FONTE_USO = 'gemini';
const MODELO_PADRAO = 'gemini-flash-latest';

function limiteDiario() {
  const v = Number(process.env.GEMINI_DAILY_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : null;
}

class CredenciaisGeminiAusentesError extends Error {
  constructor(faltando) {
    super(`Credenciais do Gemini ausentes: ${faltando.join(', ')}.`);
    this.name = 'CredenciaisGeminiAusentesError';
    this.faltando = faltando;
  }
}

class GeminiQuotaExcedidaError extends Error {
  constructor(motivo, resetEm) {
    super(`Limite diário do Gemini atingido (${motivo}). Tenta de novo às ${resetEm.toLocaleTimeString('pt-BR')}.`);
    this.name = 'GeminiQuotaExcedidaError';
    this.recurso = 'gemini';
    this.resetEm = resetEm;
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

  // Verifica ANTES de chamar: se o contador local já bateu no limite
  // configurado (GEMINI_DAILY_LIMIT), nem tenta — evita repetir a mesma
  // chamada fadada a um 429 do Google a cada "Confirmar".
  const limite = limiteDiario();
  if (limite && contagemAtual(FONTE_USO) >= limite) {
    throw new GeminiQuotaExcedidaError('contador local', proximaMeiaNoiteLocal());
  }

  // Conta a tentativa (não só sucesso): mesmo uma chamada que volta 429 já
  // consumiu quota do lado da Google, então precisa entrar na contagem local
  // exibida no dashboard.
  incrementarUso(FONTE_USO);

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
      // A quota real da Google é compartilhada com qualquer outro uso da
      // mesma chave — pode estourar mesmo com o contador local baixo. Trava
      // o contador local no limite pra não insistir de novo hoje.
      marcarEsgotado(FONTE_USO, limite);
      throw new GeminiQuotaExcedidaError(mensagemDeErroGemini(erro), proximaMeiaNoiteLocal());
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
