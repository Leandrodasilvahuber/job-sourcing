const form = document.getElementById('form-upload');
const inputPrints = document.getElementById('input-prints');
const uploadStatus = document.getElementById('upload-status');
const uploadResultado = document.getElementById('upload-resultado');
const listaPendentes = document.getElementById('lista-pendentes');
const btnRecarregar = document.getElementById('btn-recarregar');

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function renderizarItem(empresa, { comAcoes }) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = empresa.id;

  li.innerHTML = `
    <h3>${escapeHtml(empresa.nome) || '(sem nome identificado)'}</h3>
    <div class="meta">
      ${empresa.localizacao ? `📍 ${escapeHtml(empresa.localizacao)}` : 'localização não identificada'}
      · fonte: ${escapeHtml(empresa.fonte)}
    </div>
    <div class="descricao">${escapeHtml(empresa.descricao) || ''}</div>
    ${empresa.motivo_duvida ? `<div class="aviso">⚠️ ${escapeHtml(empresa.motivo_duvida)}</div>` : ''}
    ${comAcoes ? `
      <div class="acoes">
        <button class="confirmar">Confirmar</button>
        <button class="descartar">Descartar</button>
      </div>
    ` : ''}
  `;

  return li;
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const arquivos = inputPrints.files;
  if (!arquivos || arquivos.length === 0) {
    return;
  }

  const formData = new FormData();
  for (const arquivo of arquivos) {
    formData.append('prints', arquivo);
  }

  const botao = form.querySelector('button');
  botao.disabled = true;
  uploadStatus.textContent = `Processando ${arquivos.length} print(s) via OCR — isso pode levar alguns segundos...`;
  uploadResultado.innerHTML = '';

  try {
    const resposta = await fetch('/busca', { method: 'POST', body: formData });
    const dados = await resposta.json();

    if (!resposta.ok) {
      uploadStatus.textContent = `Erro: ${dados.error || resposta.statusText}`;
      return;
    }

    uploadStatus.textContent = `${dados.inseridos.length} item(ns) inserido(s) como pendente(s).`;
    dados.inseridos.forEach((empresa) => {
      uploadResultado.appendChild(renderizarItem(empresa, { comAcoes: false }));
    });

    form.reset();
    carregarPendentes();
  } catch (erro) {
    uploadStatus.textContent = `Falha ao enviar: ${erro.message}`;
  } finally {
    botao.disabled = false;
  }
});

async function carregarPendentes() {
  listaPendentes.innerHTML = '<li>Carregando...</li>';
  const resposta = await fetch('/empresas/nao-checadas');
  const empresas = await resposta.json();

  listaPendentes.innerHTML = '';
  if (empresas.length === 0) {
    listaPendentes.innerHTML = '<li>Nenhum item pendente.</li>';
    return;
  }

  empresas.forEach((empresa) => {
    listaPendentes.appendChild(renderizarItem(empresa, { comAcoes: true }));
  });
}

listaPendentes.addEventListener('click', async (evento) => {
  const li = evento.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;

  if (evento.target.classList.contains('confirmar')) {
    await fetch(`/empresas/nao-checadas/${id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    carregarPendentes();
  }

  if (evento.target.classList.contains('descartar')) {
    await fetch(`/empresas/nao-checadas/${id}/descartar`, { method: 'POST' });
    carregarPendentes();
  }
});

btnRecarregar.addEventListener('click', carregarPendentes);

carregarPendentes();
