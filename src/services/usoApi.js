// Contador de uso diário persistido, para APIs (como a do Google) que não
// expõem quota restante — sem isso, só saberíamos que estourou quando a
// própria chamada já tivesse falhado.
const db = require('../db/database');

function dataLocalHoje() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function contagemAtual(fonte) {
  const row = db.prepare('SELECT contagem FROM uso_api_diario WHERE fonte = ? AND data = ?')
    .get(fonte, dataLocalHoje());
  return row ? row.contagem : 0;
}

function incrementarUso(fonte) {
  incrementarUsoEm(fonte, 1);
}

// Mesma tabela/contador, mas soma uma quantidade arbitrária em vez de +1 —
// usado pra somar tokens (não chamadas) de uso do Mistral.
function incrementarUsoEm(fonte, quantidade) {
  db.prepare(`
    INSERT INTO uso_api_diario (fonte, data, contagem) VALUES (?, ?, ?)
    ON CONFLICT(fonte, data) DO UPDATE SET contagem = contagem + excluded.contagem
  `).run(fonte, dataLocalHoje(), quantidade);
}

// Usado quando a própria API já recusou a chamada por quota (ex: 429) mas
// nosso contador local ainda estava abaixo do limite configurado — a quota
// real do provedor é compartilhada (outros usos da mesma chave) e não temos
// visibilidade dela, então travamos o contador local no limite pra parar de
// bater à toa até a próxima meia-noite.
function marcarEsgotado(fonte, limite) {
  if (!limite) return;
  db.prepare(`
    INSERT INTO uso_api_diario (fonte, data, contagem) VALUES (?, ?, ?)
    ON CONFLICT(fonte, data) DO UPDATE SET contagem = MAX(contagem, excluded.contagem)
  `).run(fonte, dataLocalHoje(), limite);
}

// Não temos visibilidade do reset real da API — usamos a próxima meia-noite
// local do nosso próprio contador como proxy honesto.
function proximaMeiaNoiteLocal() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

module.exports = { dataLocalHoje, contagemAtual, incrementarUso, incrementarUsoEm, marcarEsgotado, proximaMeiaNoiteLocal };
