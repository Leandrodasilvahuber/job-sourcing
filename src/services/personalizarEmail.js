// Troca de texto determinística — não usa LLM aqui de propósito: o
// template de e-mail (título/corpo) é fixo e revisado pelo usuário, e não
// pode mudar em nada além da referência à empresa. Uma reescrita via LLM
// corre o risco de alterar tom/frases mesmo quando instruída a não fazer
// isso; substituição de texto simples garante que o resto fica idêntico.
const PLACEHOLDER_EMPRESA_REGEX = /\[nome da empresa\]/gi;

function personalizarEmail({ assunto, corpo, nomeEmpresa }) {
  if (!nomeEmpresa) return { assunto, corpo };

  const corpoPersonalizado = PLACEHOLDER_EMPRESA_REGEX.test(corpo)
    ? corpo.replace(PLACEHOLDER_EMPRESA_REGEX, nomeEmpresa)
    : corpo;

  const jaMencionaEmpresa = assunto.toLowerCase().includes(nomeEmpresa.toLowerCase());
  const assuntoPersonalizado = jaMencionaEmpresa ? assunto : `${assunto} — ${nomeEmpresa}`;

  return { assunto: assuntoPersonalizado, corpo: corpoPersonalizado };
}

const PLACEHOLDER_VAGA_REGEX = /\[vaga\]/gi;

// Mesma ideia de personalizarEmail(), mas pro template de e-mail de vagas:
// além de `[nome da empresa]`, também troca `[vaga]` pelo título da vaga
// importada do relatório.
function personalizarEmailVaga({ assunto, corpo, nomeEmpresa, tituloVaga }) {
  let corpoPersonalizado = corpo;
  if (nomeEmpresa) corpoPersonalizado = corpoPersonalizado.replace(PLACEHOLDER_EMPRESA_REGEX, nomeEmpresa);
  if (tituloVaga) corpoPersonalizado = corpoPersonalizado.replace(PLACEHOLDER_VAGA_REGEX, tituloVaga);

  let assuntoPersonalizado = assunto;
  if (tituloVaga) assuntoPersonalizado = assuntoPersonalizado.replace(PLACEHOLDER_VAGA_REGEX, tituloVaga);
  if (nomeEmpresa) {
    const jaMencionaEmpresa = assuntoPersonalizado.toLowerCase().includes(nomeEmpresa.toLowerCase());
    if (!jaMencionaEmpresa) assuntoPersonalizado = `${assuntoPersonalizado} — ${nomeEmpresa}`;
  }

  return { assunto: assuntoPersonalizado, corpo: corpoPersonalizado };
}

module.exports = { personalizarEmail, personalizarEmailVaga };
