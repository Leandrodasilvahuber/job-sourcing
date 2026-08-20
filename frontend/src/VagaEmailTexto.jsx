import { useEffect, useState } from 'react';
import { buscarVagaEmailAssunto, salvarVagaEmailAssunto, buscarVagaEmailTexto, salvarVagaEmailTexto } from './api';
import { formatarDataHora } from './format';

export function VagaEmailTexto() {
  const [assunto, setAssunto] = useState('');
  const [assuntoAtualizadoEm, setAssuntoAtualizadoEm] = useState(null);
  const [conteudo, setConteudo] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    buscarVagaEmailAssunto()
      .then((dados) => {
        if (dados) {
          setAssunto(dados.conteudo);
          setAssuntoAtualizadoEm(dados.atualizado_em);
        }
      })
      .catch(() => {});
    buscarVagaEmailTexto()
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
        salvarVagaEmailAssunto(assunto),
        salvarVagaEmailTexto(conteudo),
      ]);
      setAssuntoAtualizadoEm(resultadoAssunto.atualizado_em);
      setAtualizadoEm(resultadoTexto.atualizado_em);
      setMensagem('Email de vaga salvo com sucesso.');
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card card-acento-indigo">
      <h2>Texto do email de vaga</h2>
      <p className="crawler-descricao">
        Usado no envio pela aba Vagas. Use <code>[nome da empresa]</code> e <code>[vaga]</code> no texto
        pra serem trocados automaticamente pelo nome da empresa e pelo título da vaga.
      </p>

      <label className="email-texto-rotulo" htmlFor="vaga-email-assunto">
        Título
        {assuntoAtualizadoEm && (
          <span className="upload-status"> — última atualização: {formatarDataHora(assuntoAtualizadoEm)}</span>
        )}
      </label>
      <form onSubmit={handleSubmit} className="upload-form email-texto-form">
        <textarea
          id="vaga-email-assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="Título/assunto do email…"
          rows={2}
          disabled={salvando}
          required
        />

        <label className="email-texto-rotulo" htmlFor="vaga-email-corpo">
          Corpo
          {atualizadoEm && (
            <span className="upload-status"> — última atualização: {formatarDataHora(atualizadoEm)}</span>
          )}
        </label>
        <textarea
          id="vaga-email-corpo"
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Escreva o texto do email a ser enviado pra vaga…"
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
