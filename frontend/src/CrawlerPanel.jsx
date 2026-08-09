import { useEffect, useRef, useState } from 'react';
import { rodarCrawler, statusCrawler } from './api';

function formatarReset(resetEm) {
  if (!resetEm) return '';
  try {
    return new Date(resetEm).toLocaleTimeString('pt-BR');
  } catch {
    return resetEm;
  }
}

export function CrawlerPanel({ onConcluido }) {
  const [emExecucao, setEmExecucao] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    statusCrawler().then((s) => setEmExecucao(s.em_execucao)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!emExecucao) {
      clearInterval(intervaloRef.current);
      return;
    }
    intervaloRef.current = setInterval(async () => {
      try {
        const s = await statusCrawler();
        setEmExecucao(s.em_execucao);
        if (!s.em_execucao) {
          setMensagem({ tipo: 'sucesso', texto: 'Coleta finalizada. Confira a aba Empresas.' });
          onConcluido?.();
        }
      } catch {
        // ignora falha pontual de polling
      }
    }, 4000);
    return () => clearInterval(intervaloRef.current);
  }, [emExecucao, onConcluido]);

  async function handleClick() {
    setMensagem(null);
    const resultado = await rodarCrawler();

    if (resultado.httpStatus === 202) {
      setEmExecucao(true);
      setMensagem({ tipo: 'info', texto: 'Coleta iniciada em segundo plano (Brasil + Portugal).' });
    } else if (resultado.httpStatus === 409) {
      setEmExecucao(true);
      setMensagem({ tipo: 'aviso', texto: 'Já existe uma coleta em andamento.' });
    } else if (resultado.httpStatus === 429) {
      setMensagem({
        tipo: 'erro',
        texto: `Limite de requisições do GitHub excedido (${resultado.recurso}). Tenta de novo às ${formatarReset(resultado.reset_em)}.`,
      });
    } else {
      setMensagem({ tipo: 'erro', texto: resultado.error || 'Falha ao iniciar a coleta.' });
    }
  }

  return (
    <section className="card">
      <h2>Crawler do GitHub</h2>
      <p className="crawler-descricao">
        Busca organizações de software no GitHub localizadas no Brasil e em Portugal e adiciona as novas na base.
      </p>
      <button type="button" onClick={handleClick} disabled={emExecucao}>
        {emExecucao ? 'Coleta em andamento…' : 'Rodar crawler'}
      </button>
      {mensagem && <p className={`crawler-mensagem crawler-mensagem-${mensagem.tipo}`}>{mensagem.texto}</p>}
    </section>
  );
}
