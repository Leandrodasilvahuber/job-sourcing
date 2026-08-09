export function Paginacao({ page, totalPages, total, onChange }) {
  if (total === 0) return null;

  return (
    <div className="paginacao">
      <span className="paginacao-info">
        Página {page} de {totalPages} — {total} empresa(s)
      </span>
      <div className="paginacao-botoes">
        <button type="button" disabled={page <= 1} onClick={() => onChange(1)}>«</button>
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Anterior</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Próxima ›</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(totalPages)}>»</button>
      </div>
    </div>
  );
}
