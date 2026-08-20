import { useEffect, useState } from 'react';
import { listarExecucoes } from './api';
import { formatarDataHora } from './format';

const ROTULO_STATUS_EXECUCAO = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  limite_excedido: 'Limite excedido',
  interrompida: 'Interrompida',
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

export function HistoricoExecucoes({ recarregarToken }) {
  const [execucoes, setExecucoes] = useState({ data: [], total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    listarExecucoes({ page, pageSize: 10 })
      .then((dados) => {
        if (!cancelado) setExecucoes(dados);
      })
      .catch((e) => {
        if (!cancelado) setErro(e.message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => { cancelado = true; };
  }, [page, recarregarToken]);

  return (
    <section className="card card-acento-indigo">
      <h2>Histórico de execuções</h2>
      {erro && <p className="mensagem-erro">{erro}</p>}

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
                  <td data-label="Fonte">{rotularFonte(e.fonte)}</td>
                  <td data-label="Início">{formatarDataHora(e.iniciado_em)}</td>
                  <td data-label="Status">
                    <span className={`badge badge-execucao-${e.status}`}>
                      {ROTULO_STATUS_EXECUCAO[e.status] || e.status}
                    </span>
                  </td>
                  <td data-label="Processadas">{e.processadas}</td>
                  <td data-label="Novas">{e.novas}</td>
                  <td data-label="Já existentes">{e.puladas}</td>
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
