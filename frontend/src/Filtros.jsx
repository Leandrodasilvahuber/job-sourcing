export function Filtros({ filtros, onChange, fontes }) {
  function atualizar(campo, valor) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="filtros">
      <input
        type="search"
        placeholder="Buscar por nome, localização ou descrição…"
        value={filtros.q}
        onChange={(e) => atualizar('q', e.target.value)}
        className="filtro-busca"
      />

      <select value={filtros.status} onChange={(e) => atualizar('status', e.target.value)}>
        <option value="">Todos os status</option>
        <option value="pendente">Pendente</option>
        <option value="descartada">Descartada</option>
      </select>

      <select value={filtros.fonte} onChange={(e) => atualizar('fonte', e.target.value)}>
        <option value="">Todas as fontes</option>
        {fontes.map((fonte) => (
          <option key={fonte} value={fonte}>{fonte}</option>
        ))}
      </select>

      <select value={String(filtros.pageSize)} onChange={(e) => atualizar('pageSize', Number(e.target.value))}>
        {[10, 20, 50, 100].map((tamanho) => (
          <option key={tamanho} value={tamanho}>{tamanho} por página</option>
        ))}
      </select>
    </div>
  );
}
