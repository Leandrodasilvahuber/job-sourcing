export function formatarReset(resetEm) {
  if (!resetEm) return '';
  try {
    return new Date(resetEm).toLocaleTimeString('pt-BR');
  } catch {
    return resetEm;
  }
}

export function formatarDataHora(valor) {
  if (!valor) return '—';
  try {
    return new Date(`${valor.replace(' ', 'T')}Z`).toLocaleString('pt-BR');
  } catch {
    return valor;
  }
}
