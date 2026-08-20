import { useEffect, useState } from 'react';
import { buscarResumoDashboard, listarPaises, buscarUsoApis } from './api';
import { formatarReset } from './format';

const ROTULO_FONTE = {
  github: 'GitHub',
  google_custom_search: 'Google',
  print: 'Upload de print',
};

function rotularFonte(fonte) {
  return ROTULO_FONTE[fonte] || fonte;
}

export function Dashboard({ recarregarToken }) {
  const [pais, setPais] = useState('');
  const [paises, setPaises] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(null);
  const [usoApis, setUsoApis] = useState(null);

  useEffect(() => {
    listarPaises().then(setPaises).catch(() => setPaises([]));
  }, [recarregarToken]);

  useEffect(() => {
    buscarUsoApis().then(setUsoApis).catch(() => setUsoApis(null));
  }, [recarregarToken]);

  useEffect(() => {
    let cancelado = false;
    setErro(null);

    buscarResumoDashboard(pais || undefined)
      .then((resumoDados) => {
        if (!cancelado) setResumo(resumoDados);
      })
      .catch((e) => {
        if (!cancelado) setErro(e.message);
      });

    return () => { cancelado = true; };
  }, [pais, recarregarToken]);

  const totalPorStatus = (status) =>
    resumo?.porStatus?.find((s) => s.status === status)?.total ?? 0;

  return (
    <>
      <section className="card">
      <div className="dashboard-cabecalho">
        <h2>Dashboard</h2>
        <label className="dashboard-filtro-pais">
          País
          <select value={pais} onChange={(e) => setPais(e.target.value)}>
            <option value="">Todos</option>
            {paises.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      {erro && <p className="mensagem-erro">{erro}</p>}

      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-valor">{resumo?.total ?? '—'}</span>
          <span className="stat-rotulo">Total de registros</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{resumo?.novasHoje ?? '—'}</span>
          <span className="stat-rotulo">Cadastros hoje</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{totalPorStatus('pendente')}</span>
          <span className="stat-rotulo">Pendentes</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{totalPorStatus('confirmada')}</span>
          <span className="stat-rotulo">Confirmadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{totalPorStatus('descartada')}</span>
          <span className="stat-rotulo">Descartadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{totalPorStatus('invalida')}</span>
          <span className="stat-rotulo">Rejeitadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-valor">{resumo?.cvsEnviados ?? '—'}</span>
          <span className="stat-rotulo">CVs enviados</span>
        </div>
      </div>

      {resumo?.porFonte?.length > 0 && (
        <div className="dashboard-por-fonte">
          {resumo.porFonte.map((f) => (
            <span key={f.fonte} className="badge badge-fonte">
              {rotularFonte(f.fonte)}: {f.total}
            </span>
          ))}
        </div>
      )}

      <h3>Uso das APIs</h3>
      {usoApis ? (
        <div className="dashboard-stats">
          {usoApis.github.erro ? (
            <div className="stat-card">
              <span className="stat-valor">—</span>
              <span className="stat-rotulo">GitHub: {usoApis.github.erro}</span>
            </div>
          ) : (
            <>
              <div className="stat-card">
                <span className="stat-valor">{usoApis.github.core.usado} / {usoApis.github.core.limite}</span>
                <span className="stat-rotulo">GitHub (core) — reseta {formatarReset(usoApis.github.core.reset_em)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-valor">{usoApis.github.search.usado} / {usoApis.github.search.limite}</span>
                <span className="stat-rotulo">GitHub (busca) — reseta {formatarReset(usoApis.github.search.reset_em)}</span>
              </div>
            </>
          )}
          <div className="stat-card">
            <span className="stat-valor">
              {usoApis.mistral.usado}{usoApis.mistral.limite ? ` / ${usoApis.mistral.limite}` : ''}
            </span>
            <span className="stat-rotulo">Mistral (confirmação) — chamadas hoje</span>
            <span className="stat-rotulo">
              {usoApis.mistral.tokens_usados.toLocaleString('pt-BR')} / {usoApis.mistral.tokens_teto.toLocaleString('pt-BR')} tokens
            </span>
            <div
              className="barra-progresso"
              role="progressbar"
              aria-valuenow={Math.min(100, Math.round((usoApis.mistral.tokens_usados / usoApis.mistral.tokens_teto) * 100))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="barra-progresso-preenchimento"
                style={{ width: `${Math.min(100, Math.round((usoApis.mistral.tokens_usados / usoApis.mistral.tokens_teto) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="mensagem-vazia">Carregando…</p>
      )}
      </section>
    </>
  );
}
