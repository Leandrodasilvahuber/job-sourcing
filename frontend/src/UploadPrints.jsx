import { useState } from 'react';
import { enviarPrints } from './api';

export function UploadPrints({ onConcluido }) {
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function handleSubmit(evento) {
    evento.preventDefault();
    const arquivos = evento.target.elements.prints.files;
    if (!arquivos || arquivos.length === 0) return;

    setEnviando(true);
    setMensagem('');
    try {
      const resultado = await enviarPrints(arquivos);
      const dup = resultado.duplicados?.length ?? 0;
      setMensagem(`${resultado.inseridos.length} empresa(s) nova(s) inserida(s)${dup ? `, ${dup} já existiam` : ''}.`);
      evento.target.reset();
      onConcluido?.();
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card">
      <h2>Enviar prints</h2>
      <form onSubmit={handleSubmit} className="upload-form">
        <input type="file" name="prints" accept="image/*" multiple required disabled={enviando} />
        <button type="submit" disabled={enviando}>
          {enviando ? 'Processando…' : 'Enviar e processar'}
        </button>
      </form>
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}
