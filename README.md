# api-busca-empregos

API em Node.js/Express para descobrir empresas de desenvolvimento de software (Brasil e Portugal), revisar os dados coletados e registrar o envio de contatos/candidaturas.

Duas formas de alimentar a base de empresas:
1. **Upload de prints** de vagas/empresas, com extração de texto via OCR local (Tesseract).
2. **Crawler do GitHub**, que busca organizações localizadas no Brasil e em Portugal via API pública do GitHub.

Todas as empresas coletadas — por qualquer fonte — caem em uma fila de revisão (`empresas_nao_checadas`) antes de virarem um registro confirmado.

## Stack

- Node.js + Express
- SQLite (`better-sqlite3`)
- `tesseract.js` (OCR) + `multer` (upload de arquivos)
- `axios` (requisições à API do GitHub)

## Setup

```bash
npm install
cp .env.example .env   # se existir; caso contrário, ver variáveis abaixo
npm run dev             # http://localhost:3000, com reload via nodemon
```

### Variáveis de ambiente (`.env`)

| Variável       | Obrigatória | Descrição |
|----------------|:-----------:|-----------|
| `PORT`         | não | Porta do servidor Express (padrão `3000`). |
| `GITHUB_TOKEN` | recomendada | Token de acesso pessoal do GitHub (fine-grained, somente leitura de repositórios públicos). Sem ele, o rate limit da API cai de 5000 para 60 requisições/hora. Gerar em [github.com/settings/tokens](https://github.com/settings/tokens). |

O banco SQLite é criado automaticamente em `data/vagas.db` na primeira execução (schema em `src/db/schema.sql`).

## Fluxo de dados

```
empresas_nao_checadas (fonte: 'print' | 'github', status: pendente)
        │
        ├─ POST /empresas/nao-checadas/:id/confirmar → empresas_confirmadas
        └─ POST /empresas/nao-checadas/:id/descartar  → status: descartada

empresas_confirmadas
        └─ POST /envios → registra contato feito, com resposta rastreável
```

Deduplicação: empresas com `fonte_id` preenchido (caso do GitHub) têm índice único em `(fonte, fonte_id)` — rodar o crawler de novo não duplica registros.

## Rotas

### Prints (OCR)
- `POST /busca` — multipart, campo `prints` (até 20 imagens). Roda OCR em cada imagem e insere em `empresas_nao_checadas` com `fonte = 'print'`.

### Empresas
- `GET /empresas/nao-checadas` — lista pendentes de revisão.
- `POST /empresas/nao-checadas/:id/confirmar` — promove para `empresas_confirmadas`.
- `POST /empresas/nao-checadas/:id/descartar` — marca como descartada.

### Envios
- `POST /envios` — registra um contato/candidatura enviado para uma empresa confirmada.
- `GET /envios` — lista envios.
- `PATCH /envios/:id/resposta` — registra resposta recebida.

### Crawler (GitHub)
- `POST /crawler/run` — dispara a coleta em background (BR + PT). Responde:
  - `202` e roda assíncrono, ou
  - `409` se já houver uma coleta em andamento, ou
  - `429` se o rate limit do GitHub já estiver esgotado (checa **antes** de iniciar; não tenta rodar sem quota).
- `GET /crawler/status` — indica se há uma coleta em andamento.

### Outras
- `GET /health` — healthcheck.

## Crawler do GitHub

Busca organizações (`type:org`) com `location:Brazil` e `location:Portugal` via GitHub Search API, busca os detalhes de cada uma (`GET /orgs/{login}`) e persiste nome, site, descrição e localização.

Cuidados já implementados:
- **Só processa novidades**: antes de gastar quota buscando detalhes de uma org, verifica se ela já está na base (por `fonte` + `fonte_id`) e pula se sim.
- **Controle de rate limit**: consulta `/rate_limit` antes de começar — se já estiver esgotado, recusa a execução (a rota retorna `429`) em vez de deixar o crawler tentar e falhar no meio. Durante a coleta, para de imediato (sem estourar 403) assim que o limite chega a zero, preservando o que já foi salvo.

Rodar via linha de comando (sem precisar do servidor no ar):

```bash
node scripts/runCrawler.js
```

## Estrutura

```
src/
  app.js                  # bootstrap do Express
  db/
    schema.sql
    database.js            # conexão + migrações leves (ex: coluna fonte_id)
  crawlers/
    githubCrawler.js        # busca de orgs no GitHub + controle de rate limit
  services/
    coletores.js            # extração de campos via OCR + persistência de empresas coletadas
    ocr.js                  # wrapper do tesseract.js
  routes/
    busca.js                 # upload de prints
    empresas.js               # revisão/confirmação de empresas
    envios.js                  # registro de contatos enviados
    crawler.js                  # disparo do crawler via API
scripts/
  runCrawler.js             # execução standalone do crawler
public/                     # frontend estático (upload em lote de prints)
data/                       # banco SQLite (ignorado no git)
```

## Próximos passos (não implementados)

- Google Custom Search API como fonte adicional (fase 2 do roteiro original).
- Diretórios de empresas (Clutch, GoodFirms) — checar `robots.txt`/termos antes de qualquer scraping.
- Agendamento periódico do crawler (`node-cron`).
