import { useEffect, useRef, useState } from 'react';
import { enviarCvEmMassa, statusEnviarCvEmMassa } from './api';

export function EnviarCvEmMassaPanel({ onConcluido }) {
  const [progresso, setProgresso] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    statusEnviarCvEmMassa().then(setProgresso).catch(() => {});
  }, []);

  useEffect(() => {
    if (!progresso?.em_execucao) {
      clearInterval(intervaloRef.current);
      return;
    }
    intervaloRef.current = setInterval(async () => {
      try {
        const s = await statusEnviarCvEmMassa();
        setProgresso(s);
        if (!s.em_execucao) {
          setMensagem('Envio em massa finalizado.');
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
    const resultado = await enviarCvEmMassa();

    if (resultado.httpStatus === 202) {
      setProgresso({ em_execucao: true, total: resultado.total, processadas: 0, emailsEnviados: 0, erros: 0 });
    } else if (resultado.httpStatus === 409) {
      setMensagem('Já existe um envio em massa em andamento.');
    } else if (resultado.status === 'nada_a_fazer') {
      setMensagem('Nenhuma empresa confirmada pendente de envio de CV.');
    } else {
      setMensagem(resultado.error || 'Falha ao iniciar o envio em massa.');
    }
  }

  const emExecucao = !!progresso?.em_execucao;
  const percentual = emExecucao && progresso.total > 0
    ? Math.min(100, Math.round((progresso.processadas / progresso.total) * 100))
    : 0;

  return (
    <section className="card">
      <h2>Enviar e-mail em massa</h2>
      <p className="crawler-descricao">
        Envia o CV pra todas as empresas confirmadas que ainda não receberam nenhum envio — pra todos os
        e-mails encontrados de cada uma, sem perguntar, com um intervalo de meio segundo entre envios.
      </p>
      <button type="button" onClick={handleClick} disabled={emExecucao}>
        {emExecucao ? 'Enviando em massa…' : 'Enviar e-mail em massa'}
      </button>
      {emExecucao && (
        <>
          <div className="barra-progresso" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
            <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
          </div>
          <p className="crawler-mensagem crawler-mensagem-info">
            {progresso.processadas} / {progresso.total} empresas ({percentual}%) — {progresso.emailsEnviados} e-mails
            enviados, {progresso.erros} erros
          </p>
        </>
      )}
      {!emExecucao && mensagem && <p className="crawler-mensagem crawler-mensagem-info">{mensagem}</p>}
    </section>
  );
}
