const BASE = '';

async function requisitar(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const corpo = await response.json().catch(() => ({}));
    throw new Error(corpo.error || `Erro ${response.status}`);
  }
  return response.json();
}

export function listarEmpresas({ page, pageSize, status, fonte, q }) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('pageSize', pageSize);
  if (status) params.set('status', status);
  if (fonte) params.set('fonte', fonte);
  if (q) params.set('q', q);
  return requisitar(`${BASE}/empresas/nao-checadas?${params.toString()}`);
}

export function listarFontes() {
  return requisitar(`${BASE}/empresas/nao-checadas/fontes`);
}

// Não usa requisitar() porque 422 aqui não é um erro de infra — é a decisão
// de negócio "não atende aos requisitos pra confirmar" (não é software / sem
// contato encontrado), e a UI precisa distinguir isso de uma falha real.
export async function confirmarEmpresa(id, dados) {
  const response = await fetch(`${BASE}/empresas/nao-checadas/${id}/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  const corpo = await response.json().catch(() => ({}));
  if (response.status === 422) {
    return { confirmada: false, motivo: corpo.motivo };
  }
  if (!response.ok) {
    throw new Error(corpo.error || `Erro ${response.status}`);
  }
  return corpo;
}

// Não usa requisitar(): 409 (já em execução) é uma resposta esperada com
// corpo útil, não um erro genérico a ser descartado.
export async function confirmarEmMassa() {
  const response = await fetch(`${BASE}/empresas/nao-checadas/confirmar-em-massa`, { method: 'POST' });
  const corpo = await response.json().catch(() => ({}));
  return { ...corpo, httpStatus: response.status };
}

export function statusConfirmarEmMassa() {
  return requisitar(`${BASE}/empresas/nao-checadas/confirmar-em-massa/status`);
}

export function descartarEmpresa(id) {
  return requisitar(`${BASE}/empresas/nao-checadas/${id}/descartar`, { method: 'POST' });
}

export function listarEmpresasConfirmadas({ page, pageSize, q }) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('pageSize', pageSize);
  if (q) params.set('q', q);
  return requisitar(`${BASE}/empresas/confirmadas?${params.toString()}`);
}

export function enviarCv(empresaId, destinatarioEmail) {
  return requisitar(`${BASE}/envios/cv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa_id: empresaId, destinatario_email: destinatarioEmail }),
  });
}

// Não usa requisitar(): 409 (já em execução) é uma resposta esperada com
// corpo útil, não um erro genérico a ser descartado.
export async function enviarCvEmMassa() {
  const response = await fetch(`${BASE}/envios/cv/em-massa`, { method: 'POST' });
  const corpo = await response.json().catch(() => ({}));
  return { ...corpo, httpStatus: response.status };
}

export function statusEnviarCvEmMassa() {
  return requisitar(`${BASE}/envios/cv/em-massa/status`);
}

export function enviarPrints(arquivos) {
  const formData = new FormData();
  for (const arquivo of arquivos) formData.append('prints', arquivo);
  return requisitar(`${BASE}/busca`, { method: 'POST', body: formData });
}

// Fábrica de cliente pra cada crawler (GitHub, Google, ...), todos com a
// mesma forma de rota: POST <base>/run e GET <base>/status.
function criarClienteCrawler(basePath) {
  // Não usa requisitar(): 400/409/429 são respostas esperadas com corpo útil
  // (motivo do bloqueio), não erros genéricos a serem descartados.
  async function rodar() {
    const response = await fetch(`${BASE}${basePath}/run`, { method: 'POST' });
    const corpo = await response.json().catch(() => ({}));
    // httpStatus por último e com nome próprio: o corpo da resposta também
    // tem um campo "status" (ex: "iniciado") que não pode sobrescrever o
    // código HTTP real usado para decidir o que mostrar na tela.
    return { ...corpo, httpStatus: response.status };
  }

  function status() {
    return requisitar(`${BASE}${basePath}/status`);
  }

  return { rodar, status };
}

export const clienteCrawlerGithub = criarClienteCrawler('/crawler');
export const clienteCrawlerGoogle = criarClienteCrawler('/crawler/google');

export function buscarResumoDashboard(pais) {
  const params = new URLSearchParams();
  if (pais) params.set('pais', pais);
  const query = params.toString();
  return requisitar(`${BASE}/dashboard/resumo${query ? `?${query}` : ''}`);
}

export function listarPaises() {
  return requisitar(`${BASE}/dashboard/paises`);
}

export function listarExecucoes({ page = 1, pageSize = 10 } = {}) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('pageSize', pageSize);
  return requisitar(`${BASE}/dashboard/execucoes?${params.toString()}`);
}

export function buscarUsoApis() {
  return requisitar(`${BASE}/dashboard/uso-apis`);
}

export function buscarCurriculo() {
  return requisitar(`${BASE}/curriculo`);
}

export function enviarCurriculo(arquivo) {
  const formData = new FormData();
  formData.append('curriculo', arquivo);
  return requisitar(`${BASE}/curriculo`, { method: 'POST', body: formData });
}

export function buscarEmailTexto() {
  return requisitar(`${BASE}/email-texto`);
}

export function salvarEmailTexto(conteudo) {
  return requisitar(`${BASE}/email-texto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conteudo }),
  });
}

export function buscarEmailAssunto() {
  return requisitar(`${BASE}/email-assunto`);
}

export function salvarEmailAssunto(conteudo) {
  return requisitar(`${BASE}/email-assunto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conteudo }),
  });
}
