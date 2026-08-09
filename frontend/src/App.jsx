import { useCallback, useEffect, useState } from 'react';
import { listarEmpresas, listarFontes, confirmarEmpresa, descartarEmpresa } from './api';
import { useDebounce } from './useDebounce';
import { Filtros } from './Filtros';
import { TabelaEmpresas } from './TabelaEmpresas';
import { Paginacao } from './Paginacao';
import { UploadPrints } from './UploadPrints';
import './App.css';

const FILTROS_INICIAIS = { q: '', status: 'pendente', fonte: '', pageSize: 20 };

export default function App() {
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [page, setPage] = useState(1);
  const [resultado, setResultado] = useState({ data: [], total: 0, totalPages: 1 });
  const [fontes, setFontes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [recarregarToken, setRecarregarToken] = useState(0);

  const qDebounced = useDebounce(filtros.q);

  useEffect(() => {
    listarFontes().then(setFontes).catch(() => setFontes([]));
  }, [recarregarToken]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, filtros.status, filtros.fonte, filtros.pageSize]);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    listarEmpresas({ page, pageSize: filtros.pageSize, status: filtros.status, fonte: filtros.fonte, q: qDebounced })
      .then((dados) => {
        if (!cancelado) setResultado(dados);
      })
      .catch((e) => {
        if (!cancelado) setErro(e.message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => { cancelado = true; };
  }, [page, filtros.pageSize, filtros.status, filtros.fonte, qDebounced, recarregarToken]);

  const recarregar = useCallback(() => setRecarregarToken((t) => t + 1), []);

  async function handleConfirmar(empresa) {
    if (!confirm(`Confirmar "${empresa.nome}" como empresa válida?`)) return;
    try {
      await confirmarEmpresa(empresa.id, {});
      recarregar();
    } catch (e) {
      alert(`Erro ao confirmar: ${e.message}`);
    }
  }

  async function handleDescartar(empresa) {
    if (!confirm(`Descartar "${empresa.nome}"?`)) return;
    try {
      await descartarEmpresa(empresa.id);
      recarregar();
    } catch (e) {
      alert(`Erro ao descartar: ${e.message}`);
    }
  }

  return (
    <main>
      <h1>Job Sourcing</h1>

      <UploadPrints onConcluido={recarregar} />

      <section className="card">
        <h2>Empresas coletadas</h2>
        <Filtros filtros={filtros} onChange={setFiltros} fontes={fontes} />
        <TabelaEmpresas
          empresas={resultado.data}
          carregando={carregando}
          erro={erro}
          onConfirmar={handleConfirmar}
          onDescartar={handleDescartar}
        />
        <Paginacao
          page={resultado.page ?? page}
          totalPages={resultado.totalPages ?? 1}
          total={resultado.total ?? 0}
          onChange={setPage}
        />
      </section>
    </main>
  );
}
