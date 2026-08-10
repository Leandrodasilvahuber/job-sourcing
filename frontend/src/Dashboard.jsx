import { useEffect, useState } from 'react';
import { buscarResumoDashboard, listarPaises, listarExecucoes } from './api';
import { formatarDataHora } from './format';

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

export function Dashboard({ recarregarToken }) {
  const [pais, setPais] = useState('');
  const [paises, setPaises] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [execucoes, setExecucoes] = useState({ data: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    listarPaises().then(setPaises).catch(() => setPaises([]));
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
  );
}
