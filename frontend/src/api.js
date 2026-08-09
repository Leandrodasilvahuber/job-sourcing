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

export function confirmarEmpresa(id, dados) {
  return requisitar(`${BASE}/empresas/nao-checadas/${id}/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}

export function descartarEmpresa(id) {
  return requisitar(`${BASE}/empresas/nao-checadas/${id}/descartar`, { method: 'POST' });
}

export function enviarPrints(arquivos) {
  const formData = new FormData();
  for (const arquivo of arquivos) formData.append('prints', arquivo);
  return requisitar(`${BASE}/busca`, { method: 'POST', body: formData });
}

// Não usa requisitar(): 409 e 429 são respostas esperadas com corpo útil
// (motivo do bloqueio), não erros genéricos a serem descartados.
export async function rodarCrawler() {
  const response = await fetch(`${BASE}/crawler/run`, { method: 'POST' });
  const corpo = await response.json().catch(() => ({}));
  // httpStatus por último e com nome próprio: o corpo da resposta também
  // tem um campo "status" (ex: "iniciado") que não pode sobrescrever o
  // código HTTP real usado para decidir o que mostrar na tela.
  return { ...corpo, httpStatus: response.status };
}

export function statusCrawler() {
  return requisitar(`${BASE}/crawler/status`);
}
