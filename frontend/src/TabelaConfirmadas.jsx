import { useState } from 'react';
import { visualizarEmail } from './api';

function formatarData(data) {
  if (!data) return '—';
  return new Date(data.replace(' ', 'T')).toLocaleDateString('pt-BR');
}

export function TabelaConfirmadas({ empresas, carregando, erro, onEnviarCv, enviandoIds }) {
  const [descricaoAberta, setDescricaoAberta] = useState(null);
  const [previewEmpresa, setPreviewEmpresa] = useState(null);
  const [previewDados, setPreviewDados] = useState(null);
  const [previewErro, setPreviewErro] = useState(null);
  const [previewCarregando, setPreviewCarregando] = useState(false);

  async function handleVisualizarEmail(empresa) {
    setPreviewEmpresa(empresa);
    setPreviewDados(null);
    setPreviewErro(null);
    setPreviewCarregando(true);
    try {
      const dados = await visualizarEmail(empresa.id);
      setPreviewDados(dados);
    } catch (e) {
      setPreviewErro(e.message);
    } finally {
      setPreviewCarregando(false);
    }
  }

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
              <td className="col-nome" data-label="Nome">{empresa.nome ?? '—'}</td>
              <td data-label="Localização">{empresa.localizacao ?? '—'}</td>
              <td data-label="Site">
                {empresa.site ? (
                  <a href={empresa.site} target="_blank" rel="noreferrer">{empresa.site}</a>
                ) : '—'}
              </td>
              <td data-label="E-mail">{empresa.contato_email ?? '—'}</td>
              <td data-label="Telefone">{empresa.contato_outro ?? '—'}</td>
              <td data-label="Confirmada em">{formatarData(empresa.data_confirmacao)}</td>
              <td data-label="CV">
                {empresa.cv_enviado ? (
                  <span className="badge badge-confirmada">Enviado</span>
                ) : (
                  <span className="badge badge-pendente">Pendente</span>
                )}
              </td>
              <td className="col-acoes" data-label="Ações">
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
                  className="btn-visualizar-email"
                  onClick={() => handleVisualizarEmail(empresa)}
                >
                  Visualizar email
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

      {previewEmpresa && (
        <div className="modal-fundo" onClick={() => setPreviewEmpresa(null)}>
          <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabecalho">
              <h3>E-mail para {previewEmpresa.nome}</h3>
              <button type="button" className="modal-fechar" onClick={() => setPreviewEmpresa(null)}>×</button>
            </div>
            {previewCarregando && <p className="mensagem-vazia">Personalizando com o Mistral…</p>}
            {previewErro && <p className="mensagem-erro">Erro ao gerar pré-visualização: {previewErro}</p>}
            {previewDados && (
              <>
                <p><strong>Título:</strong> {previewDados.assunto}</p>
                <p className="modal-descricao">{previewDados.corpo}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
