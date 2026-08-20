import { useEffect, useState } from 'react';
import { buscarEmailAssunto, salvarEmailAssunto, buscarEmailTexto, salvarEmailTexto } from './api';
import { formatarDataHora } from './format';

export function EmailTexto() {
  const [assunto, setAssunto] = useState('');
  const [assuntoAtualizadoEm, setAssuntoAtualizadoEm] = useState(null);
  const [conteudo, setConteudo] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    buscarEmailAssunto()
      .then((dados) => {
        if (dados) {
          setAssunto(dados.conteudo);
          setAssuntoAtualizadoEm(dados.atualizado_em);
        }
      })
      .catch(() => {});
    buscarEmailTexto()
      .then((dados) => {
        if (dados) {
          setConteudo(dados.conteudo);
          setAtualizadoEm(dados.atualizado_em);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(evento) {
    evento.preventDefault();
    if (!assunto.trim() || !conteudo.trim()) return;

    setSalvando(true);
    setMensagem('');
    try {
      const [resultadoAssunto, resultadoTexto] = await Promise.all([
        salvarEmailAssunto(assunto),
        salvarEmailTexto(conteudo),
      ]);
      setAssuntoAtualizadoEm(resultadoAssunto.atualizado_em);
      setAtualizadoEm(resultadoTexto.atualizado_em);
      setMensagem('Email salvo com sucesso.');
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card card-acento-indigo">
      <h2>Texto do email</h2>

      <label className="email-texto-rotulo" htmlFor="email-assunto">
        Título
        {assuntoAtualizadoEm && (
          <span className="upload-status"> — última atualização: {formatarDataHora(assuntoAtualizadoEm)}</span>
        )}
      </label>
      <form onSubmit={handleSubmit} className="upload-form email-texto-form">
        <textarea
          id="email-assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="Título/assunto do email…"
          rows={2}
          disabled={salvando}
          required
        />

        <label className="email-texto-rotulo" htmlFor="email-corpo">
          Corpo
          {atualizadoEm && (
            <span className="upload-status"> — última atualização: {formatarDataHora(atualizadoEm)}</span>
          )}
        </label>
        <textarea
          id="email-corpo"
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Escreva o texto do email a ser enviado junto com o currículo…"
          rows={14}
          disabled={salvando}
          required
        />

        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}
