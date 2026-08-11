import { useState } from 'react';

function formatarData(data) {
  if (!data) return '—';
  return new Date(data.replace(' ', 'T')).toLocaleDateString('pt-BR');
}

export function TabelaConfirmadas({ empresas, carregando, erro, onEnviarCv, enviandoIds }) {
  const [descricaoAberta, setDescricaoAberta] = useState(null);

  if (erro) {
    return <p className="mensagem-erro">Erro ao carregar empresas confirmadas: {erro}</p>;
  }

  if (!carregando && empresas.length === 0) {
    return <p className="mensagem-vazia">Nenhuma empresa confirmada ainda.</p>;
  }

  return (
    <div className="tabela-wrapper">
      <table className="tabela-empresas tabela-confirmadas">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Localização</th>
            <th>Site</th>
            <th>E-mail</th>
            <th>Telefone</th>
            <th>Confirmada em</th>
            <th>CV</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((empresa) => (
            <tr key={empresa.id} className={carregando ? 'linha-carregando' : ''}>
              <td className="col-nome">{empresa.nome ?? '—'}</td>
              <td>{empresa.localizacao ?? '—'}</td>
              <td>
                {empresa.site ? (
                  <a href={empresa.site} target="_blank" rel="noreferrer">{empresa.site}</a>
                ) : '—'}
              </td>
              <td>{empresa.contato_email ?? '—'}</td>
              <td>{empresa.contato_outro ?? '—'}</td>
              <td>{formatarData(empresa.data_confirmacao)}</td>
              <td>
                {empresa.cv_enviado ? (
                  <span className="badge badge-confirmada">Enviado</span>
                ) : (
                  <span className="badge badge-pendente">Pendente</span>
                )}
              </td>
              <td className="col-acoes">
                <button
                  type="button"
                  className="btn-confirmar"
                  disabled={empresa.cv_enviado || enviandoIds?.has(empresa.id)}
                  onClick={() => onEnviarCv(empresa)}
                >
                  {enviandoIds?.has(empresa.id)
                    ? 'Enviando…'
                    : empresa.cv_enviado ? 'CV enviado' : 'Enviar CV'}
                </button>
                <button
                  type="button"
                  className="btn-ler-descricao"
                  onClick={() => setDescricaoAberta(empresa)}
                >
                  Ler descrição
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {descricaoAberta && (
        <div className="modal-fundo" onClick={() => setDescricaoAberta(null)}>
          <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabecalho">
              <h3>{descricaoAberta.nome}</h3>
              <button type="button" className="modal-fechar" onClick={() => setDescricaoAberta(null)}>×</button>
            </div>
            {descricaoAberta.pesquisa_stack?.length > 0 && (
              <p><strong>Stack:</strong> {descricaoAberta.pesquisa_stack.join(', ')}</p>
            )}
            {descricaoAberta.pesquisa_emails?.length > 0 && (
              <p><strong>E-mails:</strong> {descricaoAberta.pesquisa_emails.join(', ')}</p>
            )}
            <p className="modal-descricao">
              {descricaoAberta.pesquisa_resumo || descricaoAberta.observacoes || 'Nenhuma descrição disponível.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
