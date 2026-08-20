import { useEffect, useState } from 'react';
import { buscarCurriculo, enviarCurriculo } from './api';
import { formatarDataHora } from './format';

export function UploadCurriculo() {
  const [curriculo, setCurriculo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    buscarCurriculo().then(setCurriculo).catch(() => setCurriculo(null));
  }, []);

  async function handleSubmit(evento) {
    evento.preventDefault();
    const arquivo = evento.target.elements.curriculo.files[0];
    if (!arquivo) return;

    setEnviando(true);
    setMensagem('');
    try {
      const resultado = await enviarCurriculo(arquivo);
      setCurriculo(resultado);
      setMensagem('Currículo atualizado com sucesso.');
      evento.target.reset();
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card card-acento-indigo">
      <h2>Currículo (PDF)</h2>
      {curriculo ? (
        <p className="upload-status">
          Atual: <a href="/curriculo/download" target="_blank" rel="noreferrer">{curriculo.nome_arquivo}</a>
          {' '}— enviado em {formatarDataHora(curriculo.atualizado_em)}
        </p>
      ) : (
        <p className="mensagem-vazia">Nenhum currículo enviado ainda.</p>
      )}
      <form onSubmit={handleSubmit} className="upload-form">
        <input type="file" name="curriculo" accept="application/pdf" required disabled={enviando} />
        <button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar currículo'}
        </button>
      </form>
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}
