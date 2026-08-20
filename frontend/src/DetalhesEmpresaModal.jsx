function formatarData(data) {
  if (!data) return '—';
  return new Date(data.replace(' ', 'T')).toLocaleString('pt-BR');
}

function formatarDadosBrutos(dadosBrutos) {
  if (!dadosBrutos) return null;
  try {
    return JSON.stringify(JSON.parse(dadosBrutos), null, 2);
  } catch {
    return dadosBrutos;
  }
}

export function DetalhesEmpresaModal({ empresa, onConfirmar, onDescartar, onFechar, confirmando }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cabecalho">
          <h3>{empresa.nome ?? '—'}</h3>
          <button type="button" className="modal-fechar" onClick={onFechar}>×</button>
        </div>

        <dl className="detalhes-empresa">
          <dt>Fonte</dt>
          <dd>{empresa.fonte ?? '—'}{empresa.fonte_id ? ` (${empresa.fonte_id})` : ''}</dd>

          <dt>Localização</dt>
          <dd>{empresa.localizacao ?? '—'}</dd>

          <dt>País</dt>
          <dd>{empresa.pais ?? '—'}</dd>

          <dt>Site</dt>
          <dd>
            {empresa.site ? (
              <a href={empresa.site} target="_blank" rel="noreferrer">{empresa.site}</a>
            ) : '—'}
          </dd>

          <dt>Coletado em</dt>
          <dd>{formatarData(empresa.data_coleta)}</dd>

          <dt>Descrição</dt>
          <dd className="modal-descricao">{empresa.descricao || '—'}</dd>

          {empresa.motivo_duvida && (
            <>
              <dt>Motivo de dúvida</dt>
              <dd className="modal-descricao modal-motivo-duvida">{empresa.motivo_duvida}</dd>
            </>
          )}
        </dl>

        {formatarDadosBrutos(empresa.dados_brutos) && (
          <details className="detalhes-dados-brutos">
            <summary>Dados brutos coletados</summary>
            <pre>{formatarDadosBrutos(empresa.dados_brutos)}</pre>
          </details>
        )}

        <div className="modal-acoes">
          <button
            type="button"
            className="btn-confirmar"
            disabled={confirmando}
            onClick={() => onConfirmar(empresa)}
          >
            {confirmando ? 'Confirmando…' : 'Confirmar'}
          </button>
          <button type="button" className="btn-descartar" disabled={confirmando} onClick={() => onDescartar(empresa)}>
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
