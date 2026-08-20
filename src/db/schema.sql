CREATE TABLE IF NOT EXISTS empresas_nao_checadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    site TEXT,
    fonte TEXT,
    fonte_id TEXT,
    descricao TEXT,
    localizacao TEXT,
    dados_brutos TEXT,
    motivo_duvida TEXT,
    data_coleta TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pendente',
    pais TEXT
);

CREATE TABLE IF NOT EXISTS execucoes_coleta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fonte TEXT NOT NULL,
    iniciado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    finalizado_em TEXT,
    status TEXT DEFAULT 'em_andamento',
    processadas INTEGER DEFAULT 0,
    novas INTEGER DEFAULT 0,
    puladas INTEGER DEFAULT 0,
    erro TEXT
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
    pesquisa_status TEXT DEFAULT 'pendente',
    pesquisa_markdown TEXT,
    pesquisa_existe INTEGER,
    pesquisa_emails TEXT,
    pesquisa_erro TEXT,
    pesquisa_atualizado_em TEXT,
    pesquisa_resumo TEXT,
    pesquisa_stack TEXT,
    pesquisa_eh_software INTEGER,
    FOREIGN KEY (empresa_nao_checada_id) REFERENCES empresas_nao_checadas(id)
);

CREATE TABLE IF NOT EXISTS envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL,
    canal TEXT,
    destinatario_email TEXT,
    conteudo_enviado TEXT,
    data_envio TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'enviado',
    resposta TEXT,
    data_resposta TEXT,
    FOREIGN KEY (empresa_id) REFERENCES empresas_confirmadas(id)
);

-- Vagas importadas de um relatório (empresa + título da vaga). Fluxo:
-- pendente -> validada/invalida (validação acha site+email da empresa) ->
-- descartada ou enviada (envio do e-mail customizado com o CV em anexo).
CREATE TABLE IF NOT EXISTS vagas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_nome TEXT NOT NULL,
    titulo TEXT NOT NULL,
    site TEXT,
    contato_email TEXT,
    pesquisa_emails TEXT,
    pesquisa_erro TEXT,
    pesquisa_atualizado_em TEXT,
    status TEXT DEFAULT 'pendente',
    destinatario_email_enviado TEXT,
    conteudo_enviado TEXT,
    data_importacao TEXT DEFAULT CURRENT_TIMESTAMP,
    data_envio TEXT
);

-- Mesma empresa + mesmo título de vaga não pode ser importado duas vezes
-- (relatórios re-importados ou sobrepostos não devem duplicar a fila).
CREATE UNIQUE INDEX IF NOT EXISTS idx_vagas_empresa_titulo ON vagas(empresa_nome, titulo);

CREATE TABLE IF NOT EXISTS vaga_email_assunto (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    conteudo TEXT NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vaga_email_texto (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    conteudo TEXT NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS curriculo (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nome_arquivo TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_assunto (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    conteudo TEXT NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_texto (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    conteudo TEXT NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompts (
    chave TEXT PRIMARY KEY,
    conteudo TEXT NOT NULL,
    atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uso_api_diario (
    fonte TEXT NOT NULL,
    data TEXT NOT NULL,
    contagem INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (fonte, data)
);
