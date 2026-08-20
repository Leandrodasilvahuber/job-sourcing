const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/vagas.db');
const db = new Database(dbPath);

// A tabela `vagas` original (fonte/id_externo/empresa/...) era de um crawler
// de vagas que nunca chegou a ser usado (nenhum código gravava nela) — foi
// substituída pela tabela de vagas importadas de relatório (empresa_nome/
// titulo/status/...). Como o formato mudou, dropa a tabela antiga (vazia)
// pra deixar o CREATE TABLE IF NOT EXISTS do schema.sql recriar com a nova
// forma.
const tabelaVagasAntiga = db.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vagas'
`).get();
if (tabelaVagasAntiga) {
  const colunasVagas = db.prepare('PRAGMA table_info(vagas)').all().map((c) => c.name);
  if (colunasVagas.includes('fonte') && !colunasVagas.includes('empresa_nome')) {
    db.exec('DROP TABLE vagas');
  }
}

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const tabelaExiste = db.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'empresas_nao_checadas'
`).get();
if (tabelaExiste) {
  const colunasExistentes = db.prepare('PRAGMA table_info(empresas_nao_checadas)').all().map((c) => c.name);
  if (!colunasExistentes.includes('fonte_id')) {
    db.exec('ALTER TABLE empresas_nao_checadas ADD COLUMN fonte_id TEXT');
  }
  if (!colunasExistentes.includes('pais')) {
    db.exec('ALTER TABLE empresas_nao_checadas ADD COLUMN pais TEXT');
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_fonte_fonte_id
    ON empresas_nao_checadas(fonte, fonte_id)
    WHERE fonte_id IS NOT NULL
`);

const tabelaConfirmadasExiste = db.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'empresas_confirmadas'
`).get();
if (tabelaConfirmadasExiste) {
  const colunasConfirmadas = db.prepare('PRAGMA table_info(empresas_confirmadas)').all().map((c) => c.name);
  if (!colunasConfirmadas.includes('pesquisa_status')) {
    db.exec("ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_status TEXT DEFAULT 'pendente'");
  }
  if (!colunasConfirmadas.includes('pesquisa_markdown')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_markdown TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_existe')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_existe INTEGER');
  }
  if (!colunasConfirmadas.includes('pesquisa_emails')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_emails TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_erro')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_erro TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_atualizado_em')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_atualizado_em TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_resumo')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_resumo TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_stack')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_stack TEXT');
  }
  if (!colunasConfirmadas.includes('pesquisa_eh_software')) {
    db.exec('ALTER TABLE empresas_confirmadas ADD COLUMN pesquisa_eh_software INTEGER');
  }
}

const tabelaEnviosExiste = db.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'envios'
`).get();
if (tabelaEnviosExiste) {
  const colunasEnvios = db.prepare('PRAGMA table_info(envios)').all().map((c) => c.name);
  if (!colunasEnvios.includes('destinatario_email')) {
    db.exec('ALTER TABLE envios ADD COLUMN destinatario_email TEXT');
  }
}

module.exports = db;
