export function EscolherEmailModal({ empresa, candidatos, onEscolher, onEnviarTodos, onFechar }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecalho">
          <h3>Para qual email enviar?</h3>
          <button type="button" className="modal-fechar" onClick={onFechar}>×</button>
        </div>
        <p>{empresa.nome} tem mais de um email encontrado. Escolha o destinatário:</p>
        <ul className="lista-escolha-email">
          {candidatos.map((email) => (
            <li key={email}>
              <button type="button" className="btn-confirmar" onClick={() => onEscolher(email)}>
                {email}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-enviar-todos" onClick={onEnviarTodos}>
          Enviar para todos ({candidatos.length})
        </button>
      </div>
    </div>
  );
}
