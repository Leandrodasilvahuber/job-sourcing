import { useCallback, useEffect, useState } from 'react';
import { listarEmpresas, listarFontes, confirmarEmpresa, descartarEmpresa, clienteCrawlerGithub, clienteCrawlerGoogle, listarEmpresasConfirmadas, enviarCv } from './api';
import { useDebounce } from './useDebounce';
import { formatarReset } from './format';
import { Abas } from './Abas';
import { Filtros } from './Filtros';
import { TabelaEmpresas } from './TabelaEmpresas';
import { TabelaConfirmadas } from './TabelaConfirmadas';
import { Paginacao } from './Paginacao';
import { UploadPrints } from './UploadPrints';
import { CrawlerPanel } from './CrawlerPanel';
import { Dashboard } from './Dashboard';
import { EscolherEmailModal } from './EscolherEmailModal';
import './App.css';

const FILTROS_INICIAIS = { q: '', status: 'pendente', fonte: '', pageSize: 20 };
const ABAS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'coletar', label: 'Buscar / Coletar' },
  { id: 'empresas', label: 'Empresas' },
  { id: 'confirmadas', label: 'Confirmadas' },
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

  const [pageConfirmadas, setPageConfirmadas] = useState(1);
  const [qConfirmadas, setQConfirmadas] = useState('');
  const [resultadoConfirmadas, setResultadoConfirmadas] = useState({ data: [], total: 0, totalPages: 1 });
  const [carregandoConfirmadas, setCarregandoConfirmadas] = useState(true);
  const [erroConfirmadas, setErroConfirmadas] = useState(null);
  const [enviandoIds, setEnviandoIds] = useState(() => new Set());
  const [escolhaEmail, setEscolhaEmail] = useState(null);

  const qDebounced = useDebounce(filtros.q);
  const qConfirmadasDebounced = useDebounce(qConfirmadas);

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

  useEffect(() => {
    setPageConfirmadas(1);
  }, [qConfirmadasDebounced]);

  useEffect(() => {
    let cancelado = false;
    setCarregandoConfirmadas(true);
    setErroConfirmadas(null);

    listarEmpresasConfirmadas({ page: pageConfirmadas, pageSize: 20, q: qConfirmadasDebounced })
      .then((dados) => {
        if (!cancelado) setResultadoConfirmadas(dados);
      })
      .catch((e) => {
        if (!cancelado) setErroConfirmadas(e.message);
      })
      .finally(() => {
        if (!cancelado) setCarregandoConfirmadas(false);
      });

    return () => { cancelado = true; };
  }, [pageConfirmadas, qConfirmadasDebounced, recarregarToken]);

  const recarregar = useCallback(() => setRecarregarToken((t) => t + 1), []);

  async function handleConfirmar(empresa) {
    setConfirmandoIds((s) => new Set(s).add(empresa.id));
    try {
      await confirmarEmpresa(empresa.id, {});
      recarregar();
    } catch (e) {
      console.error(`Erro ao confirmar "${empresa.nome}":`, e.message);
    } finally {
      setConfirmandoIds((s) => {
        const n = new Set(s);
        n.delete(empresa.id);
        return n;
      });
    }
  }

  function candidatosEmail(empresa) {
    const brutos = [empresa.contato_email, ...(empresa.pesquisa_emails || [])];
    return [...new Set(brutos.filter((e) => e && e.trim()))];
  }

  async function executarEnvioCv(empresa, destinatarioEmail) {
    setEnviandoIds((s) => new Set(s).add(empresa.id));
    try {
      await enviarCv(empresa.id, destinatarioEmail);
      setRecarregarToken((t) => t + 1);
    } catch (e) {
      alert(`Erro ao enviar CV: ${e.message}`);
    } finally {
      setEnviandoIds((s) => {
        const n = new Set(s);
        n.delete(empresa.id);
        return n;
      });
    }
  }

  // Manda um de cada vez (não em paralelo) pra não sobrecarregar o SMTP do
  // Gmail com vários envios simultâneos pra mesma empresa.
  async function executarEnvioCvTodos(empresa, emails) {
    setEnviandoIds((s) => new Set(s).add(empresa.id));
    try {
      for (const email of emails) {
        await enviarCv(empresa.id, email).catch((e) => {
          console.error(`Erro ao enviar CV para "${email}":`, e.message);
        });
      }
      setRecarregarToken((t) => t + 1);
    } finally {
      setEnviandoIds((s) => {
        const n = new Set(s);
        n.delete(empresa.id);
        return n;
      });
    }
  }

  async function handleEnviarCv(empresa) {
    const candidatos = candidatosEmail(empresa);

    if (candidatos.length === 0) {
      alert(`Nenhum email encontrado para "${empresa.nome}". Não é possível enviar o CV.`);
      return;
    }

    if (candidatos.length === 1) {
      await executarEnvioCv(empresa, candidatos[0]);
      return;
    }

    setEscolhaEmail({ empresa, candidatos });
  }

  function handleEscolherEmail(destinatarioEmail) {
    const { empresa } = escolhaEmail;
    setEscolhaEmail(null);
    executarEnvioCv(empresa, destinatarioEmail);
  }

  function handleEnviarTodos() {
    const { empresa, candidatos } = escolhaEmail;
    setEscolhaEmail(null);
    executarEnvioCvTodos(empresa, candidatos);
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

      {aba === 'dashboard' && <Dashboard recarregarToken={recarregarToken} onConcluido={recarregar} />}

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

      {aba === 'confirmadas' && (
        <section className="card">
          <h2>Empresas confirmadas</h2>
          <div className="filtros">
            <input
              type="search"
              placeholder="Buscar por nome, localização ou descrição…"
              value={qConfirmadas}
              onChange={(e) => setQConfirmadas(e.target.value)}
              className="filtro-busca"
            />
          </div>
          <TabelaConfirmadas
            empresas={resultadoConfirmadas.data}
            carregando={carregandoConfirmadas}
            erro={erroConfirmadas}
            onEnviarCv={handleEnviarCv}
            enviandoIds={enviandoIds}
          />
          <Paginacao
            page={resultadoConfirmadas.page ?? pageConfirmadas}
            totalPages={resultadoConfirmadas.totalPages ?? 1}
            total={resultadoConfirmadas.total ?? 0}
            onChange={setPageConfirmadas}
          />
        </section>
      )}

      {escolhaEmail && (
        <EscolherEmailModal
          empresa={escolhaEmail.empresa}
          candidatos={escolhaEmail.candidatos}
          onEscolher={handleEscolherEmail}
          onEnviarTodos={handleEnviarTodos}
          onFechar={() => setEscolhaEmail(null)}
        />
      )}
    </main>
  );
}
