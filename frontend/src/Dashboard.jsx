import { useEffect, useState } from 'react';
import { buscarResumoDashboard, listarPaises, listarExecucoes, buscarUsoApis } from './api';
import { formatarDataHora, formatarReset } from './format';
import { UploadCurriculo } from './UploadCurriculo';
import { EmailTexto } from './EmailTexto';
import { ConfirmarEmMassaPanel } from './ConfirmarEmMassaPanel';
import { EnviarCvEmMassaPanel } from './EnviarCvEmMassaPanel';

const ROTULO_STATUS_EXECUCAO = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  limite_excedido: 'Limite excedido',
  erro: 'Erro',
};

const ROTULO_FONTE = {
  github: 'GitHub',
  google_custom_search: 'Google',
  print: 'Upload de print',
};

function rotularFonte(fonte) {
  return ROTULO_FONTE[fonte] || fonte;
}

export function Dashboard({ recarregarToken, onConcluido }) {
  const [pais, setPais] = useState('');
  const [paises, setPaises] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [execucoes, setExecucoes] = useState({ data: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
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
    setCarregando(true);
    setErro(null);

    Promise.all([
      buscarResumoDashboard(pais || undefined),
      listarExecucoes({ page, pageSize: 10 }),
    ])
      .then(([resumoDados, execucoesDados]) => {
        if (cancelado) return;
        setResumo(resumoDados);
        setExecucoes(execucoesDados);
      })
      .catch((e) => {
        if (!cancelado) setErro(e.message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => { cancelado = true; };
  }, [pais, page, recarregarToken]);

  const totalPorStatus = (status) =>
    resumo?.porStatus?.find((s) => s.status === status)?.total ?? 0;

  return (
    <>
      <UploadCurriculo />
      <EmailTexto />
      <ConfirmarEmMassaPanel onConcluido={onConcluido} />
      <EnviarCvEmMassaPanel onConcluido={onConcluido} />
      <section className="card">
      <div className="dashboard-cabecalho">
        <h2>Dashboard</h2>
        <label className="dashboard-filtro-pais">
          País
          <select value={pais} onChange={(e) => { setPage(1); setPais(e.target.value); }}>
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
              {usoApis.google_cse.usado}{usoApis.google_cse.limite ? ` / ${usoApis.google_cse.limite}` : ''}
            </span>
            <span className="stat-rotulo">Google (busca) — reseta {formatarReset(usoApis.google_cse.reset_em)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-valor">
              {usoApis.gemini.usado}{usoApis.gemini.limite ? ` / ${usoApis.gemini.limite}` : ''}
            </span>
            <span className="stat-rotulo">Gemini — reseta {formatarReset(usoApis.gemini.reset_em)}</span>
          </div>
        </div>
      ) : (
        <p className="mensagem-vazia">Carregando…</p>
      )}

      <h3>Histórico de execuções</h3>
      {carregando && execucoes.data.length === 0 ? (
        <p className="mensagem-vazia">Carregando…</p>
      ) : execucoes.data.length === 0 ? (
        <p className="mensagem-vazia">Nenhuma execução registrada ainda.</p>
      ) : (
        <div className="tabela-wrapper">
          <table className="tabela-execucoes">
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Início</th>
                <th>Status</th>
                <th>Processadas</th>
                <th>Novas</th>
                <th>Já existentes</th>
              </tr>
            </thead>
            <tbody>
              {execucoes.data.map((e) => (
                <tr key={e.id}>
                  <td>{rotularFonte(e.fonte)}</td>
                  <td>{formatarDataHora(e.iniciado_em)}</td>
                  <td>
                    <span className={`badge badge-execucao-${e.status}`}>
                      {ROTULO_STATUS_EXECUCAO[e.status] || e.status}
                    </span>
                  </td>
                  <td>{e.processadas}</td>
                  <td>{e.novas}</td>
                  <td>{e.puladas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {execucoes.totalPages > 1 && (
        <div className="paginacao">
          <span>Página {execucoes.page} de {execucoes.totalPages}</span>
          <div className="paginacao-botoes">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <button type="button" disabled={page >= execucoes.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
          </div>
        </div>
      )}
      </section>
    </>
  );
}
