/**
 * Heurística simples para separar nome, localização e descrição a partir
 * do texto bruto extraído por OCR de um print de vaga/empresa. O texto
 * bruto completo é sempre preservado à parte (ver dados_brutos), então
 * erros aqui não perdem informação — só afetam os campos de destaque.
 */
const PADRAO_LOCALIZACAO = /\b(remoto|home\s*office|h[ií]brido|presencial)\b|\b[A-ZÀ-Ú]{2}\b\s*[-–]\s*brasil|,\s*[A-ZÀ-Ú]{2}\b/i;

function extrairCamposDePrint(textoBruto) {
  const linhas = (textoBruto || '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);

  if (linhas.length === 0) {
    return {
      nome: null,
      localizacao: null,
      descricao: null,
      motivo_duvida: 'OCR não retornou texto legível para este print.',
    };
  }

  const linhaLocalizacao = linhas.find((linha) => PADRAO_LOCALIZACAO.test(linha));

  return {
    nome: linhas[0],
    localizacao: linhaLocalizacao ?? null,
    descricao: linhas.join(' '),
    motivo_duvida: linhaLocalizacao
      ? null
      : 'Localização não identificada automaticamente a partir do print — revisar manualmente.',
  };
}

module.exports = { extrairCamposDePrint };
