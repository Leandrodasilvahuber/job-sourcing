function formatarData(data) {
  if (!data) return '—';
  return new Date(data.replace(' ', 'T')).toLocaleDateString('pt-BR');
}

export function TabelaEmpresas({ empresas, carregando, erro, onConfirmar, onDescartar, confirmandoIds }) {
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
            <th>Pesquisa</th>
            <th>E-mails</th>
            <th>Stack</th>
            <th>Existe?</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((empresa) => (
            <tr key={empresa.id} className={carregando ? 'linha-carregando' : ''}>
              <td className="col-nome" title={empresa.pesquisa_resumo || empresa.descricao || ''}>{empresa.nome ?? '—'}</td>
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
              <td>
                {empresa.pesquisa_status ? (
                  <>
                    <span className={`badge badge-pesquisa-${empresa.pesquisa_status}`}>{empresa.pesquisa_status}</span>
                    {empresa.pesquisa_status === 'erro' && (
                      <span className="pesquisa-erro-detalhe" title={empresa.pesquisa_erro}> ⚠</span>
                    )}
                  </>
                ) : '—'}
              </td>
              <td>{empresa.pesquisa_emails?.length ? empresa.pesquisa_emails.join(', ') : '—'}</td>
              <td className="col-stack" title={empresa.pesquisa_stack?.length ? empresa.pesquisa_stack.join(', ') : ''}>
                {empresa.pesquisa_stack?.length ? empresa.pesquisa_stack.join(', ') : '—'}
              </td>
              <td>
                {empresa.pesquisa_existe === null || empresa.pesquisa_existe === undefined
                  ? '—'
                  : (empresa.pesquisa_existe ? 'Sim' : 'Não')}
              </td>
              <td className="col-acoes">
                {empresa.status === 'pendente' && (
                  <>
                    <button
                      type="button"
                      className="btn-confirmar"
                      disabled={confirmandoIds?.has(empresa.id)}
                      onClick={() => onConfirmar(empresa)}
                    >
                      {confirmandoIds?.has(empresa.id) ? 'Confirmando…' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      className="btn-descartar"
                      disabled={confirmandoIds?.has(empresa.id)}
                      onClick={() => onDescartar(empresa)}
                    >
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
