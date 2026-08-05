CREATE TABLE IF NOT EXISTS empresas_nao_checadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    site TEXT,
    fonte TEXT,
    dados_brutos TEXT,
    motivo_duvida TEXT,
    data_coleta TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pendente'
);

CREATE TABLE IF NOT EXISTS empresas_confirmadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_nao_checada_id INTEGER,
    nome TEXT NOT NULL,
    site TEXT,
    contato_email TEXT,
    contato_outro TEXT,
    setor TEXT,
    localizacao TEXT,
    observacoes TEXT,
    data_confirmacao TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_nao_checada_id) REFERENCES empresas_nao_checadas(id)
);

CREATE TABLE IF NOT EXISTS envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    canal TEXT,
    conteudo_enviado TEXT,
    data_envio TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'enviado',
    resposta TEXT,
    data_resposta TEXT,
    FOREIGN KEY (empresa_id) REFERENCES empresas_confirmadas(id)
);

CREATE TABLE IF NOT EXISTS vagas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fonte TEXT NOT NULL,
    id_externo TEXT,
    titulo TEXT,
    empresa TEXT,
    descricao TEXT,
    url TEXT,
    tags TEXT,
    localizacao TEXT,
    remoto BOOLEAN,
    data_publicacao TEXT,
    faixa_salarial TEXT,
    data_coleta TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'novo',
    score REAL,
    UNIQUE(fonte, id_externo)
);
