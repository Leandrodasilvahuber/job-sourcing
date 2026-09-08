import { useEffect, useRef, useState } from 'react';
import {
  importarVagas,
  listarVagas,
  validarVaga,
  validarVagasEmMassa,
  statusValidarVagasEmMassa,
  pararValidarVagasEmMassa,
  descartarVaga,
  visualizarEmailVaga,
  enviarEmailVaga,
} from './api';
import { useDebounce } from './useDebounce';
import { Paginacao } from './Paginacao';
import { EscolherEmailModal } from './EscolherEmailModal';

const ROTULO_STATUS = {
  pendente: 'Pendente',
  validada: 'Validada',
  invalida: 'Inválida',
  descartada: 'Descartada',
  enviada: 'Enviada',
};

// badge-confirmada é a classe "verde" já existente em App.css — reaproveitada
// tanto pra "validada" quanto pra "enviada" (ambos os estados de sucesso).
const CLASSE_STATUS = {
  pendente: 'badge-pendente',
  validada: 'badge-confirmada',
  invalida: 'badge-invalida',
  descartada: 'badge-descartada',
  enviada: 'badge-confirmada',
};

function ImportarVagasPanel({ onConcluido }) {
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function handleSubmit(evento) {
    evento.preventDefault();
    const arquivo = evento.target.elements.relatorio.files[0];
    if (!arquivo) return;

    setEnviando(true);
    setMensagem('');
    try {
      const resultado = await importarVagas(arquivo);
      const ignoradas = resultado.ignoradas ?? 0;
      const duplicadas = resultado.duplicadas ?? 0;
      const extras = [
        ignoradas ? `${ignoradas} linha(s) ignorada(s)` : null,
        duplicadas ? `${duplicadas} já existiam` : null,
      ].filter(Boolean).join(', ');
      setMensagem(`${resultado.inseridas} vaga(s) importada(s)${extras ? `, ${extras}` : ''}.`);
      evento.target.reset();
      onConcluido?.();
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card card-acento-indigo">
      <h2>Importar relatório de vagas</h2>
      <p className="crawler-descricao">
        Envie um CSV com uma coluna de empresa (ex: "empresa" ou "nome") e uma coluna de vaga
        (ex: "vaga", "titulo" ou "cargo"). Aceita vírgula ou ponto-e-vírgula como separador.
      </p>
      <form onSubmit={handleSubmit} className="upload-form">
        <input type="file" name="relatorio" accept=".csv,text/csv" required disabled={enviando} />
        <button type="submit" disabled={enviando}>
          {enviando ? 'Importando…' : 'Importar'}
        </button>
      </form>
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}

function ValidarVagasEmMassaPanel({ onConcluido }) {
  const [progresso, setProgresso] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    statusValidarVagasEmMassa().then(setProgresso).catch(() => {});
  }, []);

  useEffect(() => {
    if (!progresso?.em_execucao) {
      clearInterval(intervaloRef.current);
      return;
    }
    intervaloRef.current = setInterval(async () => {
      try {
        const s = await statusValidarVagasEmMassa();
        setProgresso(s);
        if (!s.em_execucao) {
          setMensagem(s.interrompida ? 'Validação em massa interrompida.' : 'Validação em massa finalizada.');
          onConcluido?.();
        }
      } catch {
        // ignora falha pontual de polling
      }
    }, 2000);
    return () => clearInterval(intervaloRef.current);
  }, [progresso?.em_execucao, onConcluido]);

  async function handleClick() {
    setMensagem(null);
    const resultado = await validarVagasEmMassa();

    if (resultado.httpStatus === 202) {
      setProgresso({ em_execucao: true, total: resultado.total, processadas: 0, validadas: 0, invalidas: 0 });
    } else if (resultado.httpStatus === 409) {
      setMensagem('Já existe uma validação em massa em andamento.');
    } else if (resultado.status === 'nada_a_fazer') {
      setMensagem('Nenhuma vaga pendente para validar.');
    } else {
      setMensagem(resultado.error || 'Falha ao iniciar a validação em massa.');
    }
  }

  async function handleParar() {
    await pararValidarVagasEmMassa();
    setProgresso((p) => (p ? { ...p, parando: true } : p));
  }

  const emExecucao = !!progresso?.em_execucao;
  const percentual = emExecucao && progresso.total > 0
    ? Math.min(100, Math.round((progresso.processadas / progresso.total) * 100))
    : 0;

  return (
    <section className="card card-acento-azul">
      <h2>Validar vagas em massa</h2>
      <p className="crawler-descricao">
        Busca o site oficial e o e-mail de contato/vagas de cada empresa pendente. Sem site ou sem
        e-mail encontrado, a vaga vira inválida (pode ser revalidada depois).
      </p>
      <div className="acoes-em-massa">
        <button type="button" onClick={handleClick} disabled={emExecucao}>
          {emExecucao ? 'Validando em massa…' : 'Validar em massa'}
        </button>
        {emExecucao && (
          <button type="button" className="btn-descartar" onClick={handleParar} disabled={progresso.parando}>
            {progresso.parando ? 'Parando…' : 'Parar execução'}
          </button>
        )}
      </div>
      {emExecucao && (
        <>
          <div className="barra-progresso" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
            <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
          </div>
          <p className="crawler-mensagem crawler-mensagem-info">
            {progresso.processadas} / {progresso.total} processadas ({percentual}%) — {progresso.validadas} validadas,{' '}
            {progresso.invalidas} inválidas
          </p>
        </>
      )}
      {!emExecucao && mensagem && <p className="crawler-mensagem crawler-mensagem-info">{mensagem}</p>}
    </section>
  );
}

export function Vagas({ recarregarToken }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [resultado, setResultado] = useState({ data: [], total: 0, totalPages: 1 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [token, setToken] = useState(0);
  const [validandoIds, setValidandoIds] = useState(() => new Set());
  const [enviandoIds, setEnviandoIds] = useState(() => new Set());
  const [previewVaga, setPreviewVaga] = useState(null);
  const [previewDados, setPreviewDados] = useState(null);
  const [previewErro, setPreviewErro] = useState(null);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [escolhaEmail, setEscolhaEmail] = useState(null);

  const qDebounced = useDebounce(q);
  const recarregar = () => setToken((t) => t + 1);

  useEffect(() => {
    setPage(1);
  }, [status, qDebounced]);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    listarVagas({ page, pageSize: 20, status, q: qDebounced })
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
  }, [page, status, qDebounced, token, recarregarToken]);

  async function handleValidar(vaga) {
    setValidandoIds((s) => new Set(s).add(vaga.id));
    try {
      await validarVaga(vaga.id);
      recarregar();
    } catch (e) {
      alert(`Erro ao validar "${vaga.empresa_nome}": ${e.message}`);
    } finally {
      setValidandoIds((s) => {
        const n = new Set(s);
        n.delete(vaga.id);
        return n;
      });
    }
  }

  async function handleDescartar(vaga) {
    if (!confirm(`Descartar a vaga "${vaga.titulo}" (${vaga.empresa_nome})?`)) return;
    try {
      await descartarVaga(vaga.id);
      recarregar();
    } catch (e) {
      alert(`Erro ao descartar: ${e.message}`);
    }
  }

  async function handleVerEmail(vaga) {
    setPreviewVaga(vaga);
    setPreviewDados(null);
    setPreviewErro(null);
    setPreviewCarregando(true);
    try {
      const dados = await visualizarEmailVaga(vaga.id);
      setPreviewDados(dados);
    } catch (e) {
      setPreviewErro(e.message);
    } finally {
      setPreviewCarregando(false);
    }
  }

  function candidatosEmail(vaga) {
    const brutos = [vaga.contato_email, ...(vaga.pesquisa_emails || [])];
    return [...new Set(brutos.filter((e) => e && e.trim()))];
  }

  async function executarEnvioEmail(vaga, destinatarioEmail) {
    setEnviandoIds((s) => new Set(s).add(vaga.id));
    try {
      await enviarEmailVaga(vaga.id, destinatarioEmail);
      recarregar();
    } catch (e) {
      alert(`Erro ao enviar email: ${e.message}`);
    } finally {
      setEnviandoIds((s) => {
        const n = new Set(s);
        n.delete(vaga.id);
        return n;
      });
    }
  }

  // Manda um de cada vez (não em paralelo) pra não sobrecarregar o SMTP do
  // Gmail com vários envios simultâneos pra mesma vaga.
  async function executarEnvioEmailTodos(vaga, emails) {
    setEnviandoIds((s) => new Set(s).add(vaga.id));
    try {
      for (const email of emails) {
        await enviarEmailVaga(vaga.id, email).catch((e) => {
          console.error(`Erro ao enviar email para "${email}":`, e.message);
        });
      }
      recarregar();
    } finally {
      setEnviandoIds((s) => {
        const n = new Set(s);
        n.delete(vaga.id);
        return n;
      });
    }
  }

  async function handleEnviarEmail(vaga) {
    const candidatos = candidatosEmail(vaga);

    if (candidatos.length === 0) {
      alert(`Nenhum email encontrado para "${vaga.empresa_nome}". Não é possível enviar.`);
      return;
    }

    if (candidatos.length === 1) {
      await executarEnvioEmail(vaga, candidatos[0]);
      return;
    }

    setEscolhaEmail({ vaga, candidatos });
  }

  function handleEscolherEmail(destinatarioEmail) {
    const { vaga } = escolhaEmail;
    setEscolhaEmail(null);
    executarEnvioEmail(vaga, destinatarioEmail);
  }

  function handleEnviarTodos() {
    const { vaga, candidatos } = escolhaEmail;
    setEscolhaEmail(null);
    executarEnvioEmailTodos(vaga, candidatos);
  }

  return (
    <>
      <ImportarVagasPanel onConcluido={recarregar} />
      <ValidarVagasEmMassaPanel onConcluido={recarregar} />

      <section className="card card-acento-verde">
        <h2>Vagas</h2>
        <div className="filtros">
          <input
            type="search"
            placeholder="Buscar por empresa ou vaga…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="filtro-busca"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="validada">Validada</option>
            <option value="invalida">Inválida</option>
            <option value="enviada">Enviada</option>
            <option value="descartada">Descartada</option>
          </select>
        </div>

        {erro && <p className="mensagem-erro">Erro ao carregar vagas: {erro}</p>}
        {!carregando && !erro && resultado.data.length === 0 && (
          <p className="mensagem-vazia">Nenhuma vaga encontrada.</p>
        )}

        {resultado.data.length > 0 && (
          <div className="tabela-wrapper">
            <table className="tabela-empresas tabela-vagas">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Vaga</th>
                  <th>E-mail</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {resultado.data.map((vaga) => (
                  <tr key={vaga.id} className={carregando ? 'linha-carregando' : ''}>
                    <td className="col-nome" data-label="Empresa">{vaga.empresa_nome}</td>
                    <td data-label="Vaga">{vaga.titulo}</td>
                    <td data-label="E-mail">
                      {vaga.contato_email ?? '—'}
                      {vaga.status === 'invalida' && vaga.pesquisa_erro && (
                        <div className="modal-motivo-duvida">{vaga.pesquisa_erro}</div>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${CLASSE_STATUS[vaga.status] ?? 'badge-pendente'}`}>
                        {ROTULO_STATUS[vaga.status] ?? vaga.status}
                      </span>
                    </td>
                    <td className="col-acoes" data-label="Ações">
                      {(vaga.status === 'pendente' || vaga.status === 'invalida') && (
                        <button
                          type="button"
                          className="btn-confirmar"
                          disabled={validandoIds.has(vaga.id)}
                          onClick={() => handleValidar(vaga)}
                        >
                          {validandoIds.has(vaga.id) ? 'Validando…' : 'Validar vaga'}
                        </button>
                      )}
                      {vaga.status === 'validada' && (
                        <>
                          <button
                            type="button"
                            className="btn-visualizar-email"
                            onClick={() => handleVerEmail(vaga)}
                          >
                            Ver email customizado
                          </button>
                          <button
                            type="button"
                            className="btn-confirmar"
                            disabled={enviandoIds.has(vaga.id)}
                            onClick={() => handleEnviarEmail(vaga)}
                          >
                            {enviandoIds.has(vaga.id) ? 'Enviando…' : 'Enviar email'}
                          </button>
                          <button
                            type="button"
                            className="btn-descartar"
                            onClick={() => handleDescartar(vaga)}
                          >
                            Descartar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacao
          page={resultado.page ?? page}
          totalPages={resultado.totalPages ?? 1}
          total={resultado.total ?? 0}
          onChange={setPage}
        />
      </section>

      {previewVaga && (
        <div className="modal-fundo" onClick={() => setPreviewVaga(null)}>
          <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cabecalho">
              <h3>E-mail para {previewVaga.empresa_nome}</h3>
              <button type="button" className="modal-fechar" onClick={() => setPreviewVaga(null)}>×</button>
            </div>
            {previewCarregando && <p className="mensagem-vazia">Gerando pré-visualização…</p>}
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

      {escolhaEmail && (
        <EscolherEmailModal
          empresa={{ nome: escolhaEmail.vaga.empresa_nome }}
          candidatos={escolhaEmail.candidatos}
          onEscolher={handleEscolherEmail}
          onEnviarTodos={handleEnviarTodos}
          onFechar={() => setEscolhaEmail(null)}
        />
      )}
    </>
  );
}
