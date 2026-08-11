import { useEffect, useRef, useState } from 'react';
import { confirmarEmMassa, statusConfirmarEmMassa } from './api';

export function ConfirmarEmMassaPanel({ onConcluido }) {
  const [progresso, setProgresso] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    statusConfirmarEmMassa().then(setProgresso).catch(() => {});
  }, []);

  useEffect(() => {
    if (!progresso?.em_execucao) {
      clearInterval(intervaloRef.current);
      return;
    }
    intervaloRef.current = setInterval(async () => {
      try {
        const s = await statusConfirmarEmMassa();
        setProgresso(s);
        if (!s.em_execucao) {
          setMensagem('Confirmação em massa finalizada.');
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
    const resultado = await confirmarEmMassa();

    if (resultado.httpStatus === 202) {
      setProgresso({ em_execucao: true, total: resultado.total, processadas: 0, confirmadas: 0, invalidas: 0 });
    } else if (resultado.httpStatus === 409) {
      setMensagem('Já existe uma confirmação em massa em andamento.');
    } else if (resultado.status === 'nada_a_fazer') {
      setMensagem('Nenhuma empresa pendente para confirmar.');
    } else {
      setMensagem(resultado.error || 'Falha ao iniciar a confirmação em massa.');
    }
  }

  const emExecucao = !!progresso?.em_execucao;
  const percentual = emExecucao && progresso.total > 0
    ? Math.min(100, Math.round((progresso.processadas / progresso.total) * 100))
    : 0;

  return (
    <section className="card">
      <h2>Confirmar em massa</h2>
      <p className="crawler-descricao">
        Confirma todas as empresas pendentes: abre o site de cada uma, procura e-mail de contato e tira um
        print da página inicial. Sem site, com erro ao abrir, ou sem e-mail encontrado — a empresa vira inválida.
      </p>
      <button type="button" onClick={handleClick} disabled={emExecucao}>
        {emExecucao ? 'Confirmando em massa…' : 'Confirmar em massa'}
      </button>
      {emExecucao && (
        <>
          <div className="barra-progresso" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
            <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
          </div>
          <p className="crawler-mensagem crawler-mensagem-info">
            {progresso.processadas} / {progresso.total} processadas ({percentual}%) — {progresso.confirmadas} confirmadas,{' '}
            {progresso.invalidas} inválidas
          </p>
        </>
      )}
      {!emExecucao && mensagem && <p className="crawler-mensagem crawler-mensagem-info">{mensagem}</p>}
    </section>
  );
}
