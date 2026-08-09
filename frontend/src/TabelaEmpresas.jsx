function formatarData(data) {
  if (!data) return '—';
  return new Date(data.replace(' ', 'T')).toLocaleDateString('pt-BR');
}

export function TabelaEmpresas({ empresas, carregando, erro, onConfirmar, onDescartar }) {
  if (erro) {
    return <p className="mensagem-erro">Erro ao carregar empresas: {erro}</p>;
  }

  if (!carregando && empresas.length === 0) {
    return <p className="mensagem-vazia">Nenhuma empresa encontrada para os filtros atuais.</p>;
  }

  return (
    <div className="tabela-wrapper">
      <table className="tabela-empresas">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Fonte</th>
            <th>Localização</th>
            <th>Site</th>
            <th>Status</th>
            <th>Coletado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((empresa) => (
            <tr key={empresa.id} className={carregando ? 'linha-carregando' : ''}>
              <td className="col-nome" title={empresa.descricao ?? ''}>{empresa.nome ?? '—'}</td>
              <td>{empresa.fonte}</td>
              <td>{empresa.localizacao ?? '—'}</td>
              <td>
                {empresa.site ? (
                  <a href={empresa.site} target="_blank" rel="noreferrer">{empresa.site}</a>
                ) : '—'}
              </td>
              <td>
                <span className={`badge badge-${empresa.status}`}>{empresa.status}</span>
              </td>
              <td>{formatarData(empresa.data_coleta)}</td>
              <td className="col-acoes">
                {empresa.status === 'pendente' && (
                  <>
                    <button type="button" className="btn-confirmar" onClick={() => onConfirmar(empresa)}>
                      Confirmar
                    </button>
                    <button type="button" className="btn-descartar" onClick={() => onDescartar(empresa)}>
                      Descartar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
