/**
 * Stub de busca web. Não faz nenhuma requisição real, nem automatiza
 * login/scraping do LinkedIn ou de qualquer outra fonte.
 *
 * Para plugar uma integração real (API de busca, IA, etc.), substitua
 * a implementação de `buscarEmpresas` mantendo a mesma assinatura de
 * retorno: um array de resultados brutos por fonte.
 */
async function buscarEmpresas(termo) {
  return [
    {
      fonte: 'stub',
      nome: null,
      site: null,
      motivo_duvida: 'Busca web ainda não implementada — resultado de exemplo.',
      termo_buscado: termo,
    },
  ];
}

module.exports = { buscarEmpresas };
