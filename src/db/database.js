const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/vagas.db');
const db = new Database(dbPath);

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
}

module.exports = db;
