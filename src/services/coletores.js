/**
 * Normaliza um resultado bruto de busca para o formato de
 * `empresas_nao_checadas`, preservando o dado bruto original mesmo
 * quando incompleto.
 */
function normalizarResultado(resultadoBruto) {
  return {
    nome: resultadoBruto.nome ?? null,
    site: resultadoBruto.site ?? null,
    fonte: resultadoBruto.fonte ?? null,
    dados_brutos: JSON.stringify(resultadoBruto),
    motivo_duvida: resultadoBruto.motivo_duvida ?? null,
  };
}

module.exports = { normalizarResultado };
