import { useCallback, useEffect, useState } from 'react';
import { listarEmpresas, listarFontes, confirmarEmpresa, descartarEmpresa, clienteCrawlerGithub, clienteCrawlerGoogle } from './api';
import { useDebounce } from './useDebounce';
import { formatarReset } from './format';
import { Abas } from './Abas';
import { Filtros } from './Filtros';
import { TabelaEmpresas } from './TabelaEmpresas';
import { Paginacao } from './Paginacao';
import { UploadPrints } from './UploadPrints';
import { CrawlerPanel } from './CrawlerPanel';
import { Dashboard } from './Dashboard';
import './App.css';

const FILTROS_INICIAIS = { q: '', status: 'pendente', fonte: '', pageSize: 20 };
const ABAS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'coletar', label: 'Buscar / Coletar' },
  { id: 'empresas', label: 'Empresas' },
];

export default function App() {
  const [aba, setAba] = useState('dashboard');
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [page, setPage] = useState(1);
  const [resultado, setResultado] = useState({ data: [], total: 0, totalPages: 1 });
  const [fontes, setFontes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [recarregarToken, setRecarregarToken] = useState(0);
  const [confirmandoIds, setConfirmandoIds] = useState(() => new Set());

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
    setConfirmandoIds((s) => new Set(s).add(empresa.id));
    try {
      await confirmarEmpresa(empresa.id, {});
      recarregar();
    } catch (e) {
      alert(`Erro ao confirmar: ${e.message}`);
    } finally {
      setConfirmandoIds((s) => {
        const n = new Set(s);
        n.delete(empresa.id);
        return n;
      });
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
      <Abas aba={aba} onChange={setAba} itens={ABAS} />

      {aba === 'dashboard' && <Dashboard recarregarToken={recarregarToken} />}

      {aba === 'coletar' && (
        <>
          <CrawlerPanel
            titulo="Crawler do GitHub"
            descricao="Busca organizações de software no GitHub localizadas no Brasil e em Portugal e adiciona as novas na base."
            cliente={clienteCrawlerGithub}
            mensagemIniciado="Coleta iniciada em segundo plano (Brasil + Portugal)."
            formatarErroLimite={(r) => `Limite de requisições do GitHub excedido (${r.recurso}). Tenta de novo às ${formatarReset(r.reset_em)}.`}
            onConcluido={recarregar}
          />
          <CrawlerPanel
            titulo="Crawler do Google (busca)"
            descricao="Busca páginas de empresas de software via widget de busca do Google (BR e PT). Limite diário interno — nomes e sites precisam de revisão manual."
            cliente={clienteCrawlerGoogle}
            mensagemIniciado="Coleta iniciada em segundo plano (buscas Google BR + PT)."
            formatarErroLimite={(r) => `Limite diário de buscas atingido. Tenta de novo às ${formatarReset(r.reset_em)}.`}
            onConcluido={recarregar}
          />
          <UploadPrints onConcluido={recarregar} />
        </>
      )}

      {aba === 'empresas' && (
        <section className="card">
          <h2>Empresas coletadas</h2>
          <Filtros filtros={filtros} onChange={setFiltros} fontes={fontes} />
          <TabelaEmpresas
            empresas={resultado.data}
            carregando={carregando}
            erro={erro}
            onConfirmar={handleConfirmar}
            onDescartar={handleDescartar}
            confirmandoIds={confirmandoIds}
          />
          <Paginacao
            page={resultado.page ?? page}
            totalPages={resultado.totalPages ?? 1}
            total={resultado.total ?? 0}
            onChange={setPage}
          />
        </section>
      )}
    </main>
  );
}
