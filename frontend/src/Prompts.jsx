import { useEffect, useState } from 'react';
import { listarPrompts, salvarPrompt, restaurarPrompt, restaurarTodosPrompts } from './api';
import { formatarDataHora } from './format';

function PromptCard({ prompt, onSalvar, onRestaurar }) {
  const [conteudo, setConteudo] = useState(prompt.conteudo);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    setConteudo(prompt.conteudo);
  }, [prompt.conteudo]);

  async function handleSubmit(evento) {
    evento.preventDefault();
    if (!conteudo.trim()) return;
    setSalvando(true);
    setMensagem('');
    try {
      await onSalvar(prompt.chave, conteudo);
      setMensagem('Salvo com sucesso.');
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function handleRestaurar() {
    setSalvando(true);
    setMensagem('');
    try {
      await onRestaurar(prompt.chave);
      setMensagem('Restaurado ao padrão.');
    } catch (erro) {
      setMensagem(`Erro: ${erro.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card card-acento-indigo">
      <div className="prompt-cabecalho">
        <div>
          <h2>{prompt.label}</h2>
          <p className="crawler-descricao">{prompt.descricao}</p>
        </div>
        {prompt.personalizado && <span className="badge badge-fonte">Personalizado</span>}
      </div>

      <p className="prompt-placeholders">
        Variáveis disponíveis: {prompt.placeholders.map((p) => (
          <code key={p} className="prompt-placeholder-tag">{`{{${p}}}`}</code>
        ))}
      </p>

      <form onSubmit={handleSubmit} className="upload-form email-texto-form">
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          rows={10}
          disabled={salvando}
          required
        />
        <div className="prompt-acoes">
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={handleRestaurar} disabled={salvando || !prompt.personalizado} className="btn-restaurar">
            Restaurar padrão
          </button>
        </div>
      </form>
      {prompt.atualizado_em && (
        <p className="upload-status">Última atualização: {formatarDataHora(prompt.atualizado_em)}</p>
      )}
      {mensagem && <p className="upload-status">{mensagem}</p>}
    </section>
  );
}

export function Prompts() {
  const [prompts, setPrompts] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [restaurandoTudo, setRestaurandoTudo] = useState(false);

  function carregar() {
    setCarregando(true);
    setErro(null);
    listarPrompts()
      .then(setPrompts)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSalvar(chave, conteudo) {
    const atualizado = await salvarPrompt(chave, conteudo);
    setPrompts((atual) => atual.map((p) => (p.chave === chave ? atualizado : p)));
  }

  async function handleRestaurar(chave) {
    const atualizado = await restaurarPrompt(chave);
    setPrompts((atual) => atual.map((p) => (p.chave === chave ? atualizado : p)));
  }

  async function handleRestaurarTudo() {
    if (!confirm('Restaurar todos os prompts ao texto padrão? As personalizações serão perdidas.')) return;
    setRestaurandoTudo(true);
    try {
      const atualizados = await restaurarTodosPrompts();
      setPrompts(atualizados);
    } catch (e) {
      alert(`Erro ao restaurar: ${e.message}`);
    } finally {
      setRestaurandoTudo(false);
    }
  }

  const algumPersonalizado = prompts.some((p) => p.personalizado);

  return (
    <>
      <section className="card">
        <div className="dashboard-cabecalho">
          <h2>Prompts de IA</h2>
          <button type="button" onClick={handleRestaurarTudo} disabled={restaurandoTudo || !algumPersonalizado} className="btn-restaurar">
            {restaurandoTudo ? 'Restaurando…' : 'Restaurar tudo ao padrão'}
          </button>
        </div>
        <p className="crawler-descricao">
          Prompts enviados ao Mistral durante a confirmação em massa (escolher site oficial, mapear páginas, extrair
          e-mail e identificar nome/descrição da empresa). Edite com cuidado — o texto entre <code className="prompt-placeholder-tag">{'{{ }}'}</code> é
          substituído automaticamente e precisa continuar presente pra o prompt funcionar.
        </p>
      </section>

      {erro && <p className="mensagem-erro">{erro}</p>}
      {carregando ? (
        <p className="mensagem-vazia">Carregando…</p>
      ) : (
        prompts.map((prompt) => (
          <PromptCard key={prompt.chave} prompt={prompt} onSalvar={handleSalvar} onRestaurar={handleRestaurar} />
        ))
      )}
    </>
  );
}
