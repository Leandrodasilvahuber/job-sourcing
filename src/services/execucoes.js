const db = require('../db/database');

const inserirExecucao = db.prepare(`
  INSERT INTO execucoes_coleta (fonte, status) VALUES (@fonte, 'em_andamento')
`);
const finalizarExecucao = db.prepare(`
  UPDATE execucoes_coleta
  SET finalizado_em = CURRENT_TIMESTAMP, status = @status, processadas = @processadas,
      novas = @novas, puladas = @puladas, erro = @erro
  WHERE id = @id
`);

function iniciarExecucao(fonte) {
  const info = inserirExecucao.run({ fonte });
  return info.lastInsertRowid;
}

function concluirExecucao(id, { status, processadas = 0, novas = 0, puladas = 0, erro = null }) {
  finalizarExecucao.run({ id, status, processadas, novas, puladas, erro });
}

module.exports = { iniciarExecucao, concluirExecucao };
