import { useEffect, useRef, useState } from 'react';

export function CrawlerPanel({ titulo, descricao, cliente, mensagemIniciado, formatarErroLimite, onConcluido }) {
  const [emExecucao, setEmExecucao] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    cliente.status().then((s) => setEmExecucao(s.em_execucao)).catch(() => {});
  }, [cliente]);

  useEffect(() => {
    if (!emExecucao) {
      clearInterval(intervaloRef.current);
      return;
    }
    intervaloRef.current = setInterval(async () => {
      try {
        const s = await cliente.status();
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
  }, [emExecucao, cliente, onConcluido]);

  async function handleClick() {
    setMensagem(null);
    const resultado = await cliente.rodar();

    if (resultado.httpStatus === 202) {
      setEmExecucao(true);
      setMensagem({ tipo: 'info', texto: mensagemIniciado });
    } else if (resultado.httpStatus === 409) {
      setEmExecucao(true);
      setMensagem({ tipo: 'aviso', texto: 'Já existe uma coleta em andamento.' });
    } else if (resultado.httpStatus === 429) {
      setMensagem({ tipo: 'erro', texto: formatarErroLimite(resultado) });
    } else if (resultado.httpStatus === 400) {
      setMensagem({ tipo: 'erro', texto: resultado.error || 'Configuração ausente.' });
    } else {
      setMensagem({ tipo: 'erro', texto: resultado.error || 'Falha ao iniciar a coleta.' });
    }
  }

  return (
    <section className="card">
      <h2>{titulo}</h2>
      <p className="crawler-descricao">{descricao}</p>
      <button type="button" onClick={handleClick} disabled={emExecucao}>
        {emExecucao ? 'Coleta em andamento…' : 'Rodar crawler'}
      </button>
      {mensagem && <p className={`crawler-mensagem crawler-mensagem-${mensagem.tipo}`}>{mensagem.texto}</p>}
    </section>
  );
}
