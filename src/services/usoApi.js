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
  db.prepare(`
    INSERT INTO uso_api_diario (fonte, data, contagem) VALUES (?, ?, 1)
    ON CONFLICT(fonte, data) DO UPDATE SET contagem = contagem + 1
  `).run(fonte, dataLocalHoje());
}

// Não temos visibilidade do reset real da API — usamos a próxima meia-noite
// local do nosso próprio contador como proxy honesto.
function proximaMeiaNoiteLocal() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

module.exports = { dataLocalHoje, contagemAtual, incrementarUso, proximaMeiaNoiteLocal };
