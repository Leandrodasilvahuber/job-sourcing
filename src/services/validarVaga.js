const { buscarUrlSite, buscarPagina, mapearPaginasRelevantes, emailDeVagas, emailDeContato } = require('./pesquisaEmpresa');

// Validação de uma vaga importada de relatório: só precisa achar o site
// oficial e um e-mail de contato/vagas da empresa — ao contrário da
// confirmação de empresas_nao_checadas (confirmarComMistral em
// pesquisaEmpresa.js), não exige nome/descrição, porque esses já vieram do
// relatório e não fazem parte do critério de validade aqui.
async function validarVagaComMistral({ empresaNome }) {
  const url = await buscarUrlSite(empresaNome, null);
  if (!url) {
    return { tipo: 'invalida', motivo: 'Não foi possível encontrar o site oficial da empresa.' };
  }

  let home;
  try {
    home = await buscarPagina(url);
  } catch (erro) {
    return { tipo: 'invalida', motivo: `Falha ao acessar o site: ${erro.message}` };
  }

  const { urlVagas, urlContato } = await mapearPaginasRelevantes(url, home.texto, home.links);

  let email = null;
  if (urlVagas) {
    try {
      const paginaVagas = await buscarPagina(urlVagas);
      email = await emailDeVagas(paginaVagas.texto);
    } catch (erro) {
      console.error(`Falha ao acessar página de vagas "${urlVagas}": ${erro.message}`);
    }
  }

  if (!email) {
    let textoContato = home.texto;
    if (urlContato) {
      try {
        const paginaContato = await buscarPagina(urlContato);
        textoContato = paginaContato.texto;
      } catch (erro) {
        console.error(`Falha ao acessar página de contato "${urlContato}": ${erro.message}`);
      }
    }
    email = await emailDeContato(textoContato);
  }

  if (!email) {
    return { tipo: 'invalida', motivo: 'Nenhum e-mail de contato encontrado no site.' };
  }

  return { tipo: 'validada', site: url, email };
}

module.exports = { validarVagaComMistral };
