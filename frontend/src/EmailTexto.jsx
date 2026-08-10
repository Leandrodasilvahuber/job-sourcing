import { useEffect, useState } from 'react';
import { buscarEmailTexto, salvarEmailTexto } from './api';
import { formatarDataHora } from './format';

export function EmailTexto() {
  const [conteudo, setConteudo] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
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
    if (!conteudo.trim()) return;

    setSalvando(true);
    setMensagem('');
    try {
      const resultado = await salvarEmailTexto(conteudo);
      setAtualizadoEm(resultado.atualizado_em);
      setMensagem('Texto do email salvo com sucesso.');
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card">
      <h3>Texto do email</h3>
      {atualizadoEm && (
        <p className="upload-status">Última atualização: {formatarDataHora(atualizadoEm)}</p>
      )}
      <form onSubmit={handleSubmit} className="upload-form email-texto-form">
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Escreva o texto do email a ser enviado junto com o currículo…"
          rows={8}
          disabled={salvando}
          required
        />
        <button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar texto'}
        </button>
      </form>
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}
