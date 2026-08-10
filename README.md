# api-busca-empregos

API em Node.js/Express para descobrir empresas de desenvolvimento de software (Brasil e Portugal), revisar os dados coletados e registrar o envio de contatos/candidaturas.

Três formas de alimentar a base de empresas:
1. **Upload de prints** de vagas/empresas, com extração de texto via OCR local (Tesseract).
2. **Crawler do GitHub**, que busca organizações localizadas no Brasil e em Portugal via API pública do GitHub.
3. **Crawler do Google (widget de busca)**, que busca páginas mencionando empresas de software via o widget gratuito do Google Programmable Search Engine, rodado num navegador headless (limite diário interno — resultados sempre marcados para revisão manual).

Todas as empresas coletadas — por qualquer fonte — caem em uma fila de revisão (`empresas_nao_checadas`) antes de virarem um registro confirmado.

## Stack

- Backend: Node.js + Express, SQLite (`better-sqlite3`)
- Frontend: React + Vite (em `frontend/`), buildado como estático e servido pelo próprio Express
- `tesseract.js` (OCR) + `multer` (upload de arquivos)
- `axios` (requisições à API do GitHub e ao Gemini)
- `puppeteer` (navegador headless para rodar o widget de busca do Google)

## Setup

```bash
npm install
npm --prefix frontend install
npm run build:frontend   # gera frontend/dist direto em public/
npm run dev               # http://localhost:3000, com reload via nodemon
```

Para trabalhar no frontend com hot reload, rode o backend (`npm run dev`) e, em outro terminal, `npm run dev:frontend` — o Vite sobe em porta própria (ex: `5173`) com proxy das rotas `/empresas`, `/busca`, `/envios` e `/crawler` para `localhost:3000`. Ao terminar, rode `npm run build:frontend` para atualizar `public/` com o build de produção (é o que o Express realmente serve).

### Variáveis de ambiente (`.env`)

| Variável       | Obrigatória | Descrição |
|----------------|:-----------:|-----------|
| `PORT`         | não | Porta do servidor Express (padrão `3000`). |
| `GITHUB_TOKEN` | recomendada | Token de acesso pessoal do GitHub (fine-grained, somente leitura de repositórios públicos). Sem ele, o rate limit da API cai de 5000 para 60 requisições/hora. Gerar em [github.com/settings/tokens](https://github.com/settings/tokens). |
| `GOOGLE_CSE_ID` | sim, para o crawler do Google | ID de um Programmable Search Engine (CSE) configurado para buscar toda a web — é o `cx` usado pelo widget gratuito (`cse.js`), não a API JSON paga. |
| `GOOGLE_CSE_DAILY_LIMIT` | não | Teto diário de buscas que o app se permite fazer, como proteção de custo (cada busca dispara uma chamada extra ao Gemini para estruturar o resultado). Padrão `100`. Valores `<= 0` são ignorados e caem no padrão. |
| `GEMINI_API_KEY` | sim, para o crawler do Google e para a pesquisa ao confirmar | Chave de API do Google AI Studio (Gemini). Usada para estruturar em JSON o texto bruto do widget de busca do Google, e para pesquisar/validar empresas ao confirmá-las. Sem `GOOGLE_CSE_ID`/`GEMINI_API_KEY`, a rota do crawler do Google responde `400` explicando o que falta; sem `GEMINI_API_KEY`, a pesquisa ao confirmar fica com `pesquisa_status = 'erro'`. Gerar em [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | não | Modelo Gemini usado na pesquisa (padrão `gemini-flash-latest`, alias que a Google aponta para o flash mais recente disponível). Precisa suportar grounding via Google Search e saída estruturada em JSON. |

O banco SQLite é criado automaticamente em `data/vagas.db` na primeira execução (schema em `src/db/schema.sql`).

## Fluxo de dados

```
empresas_nao_checadas (fonte: 'print' | 'github' | 'google_cse', status: pendente)
        │
        ├─ POST /empresas/nao-checadas/:id/confirmar → empresas_confirmadas
        └─ POST /empresas/nao-checadas/:id/descartar  → status: descartada

empresas_confirmadas
        └─ POST /envios → registra contato feito, com resposta rastreável
```

Deduplicação: empresas com `fonte_id` preenchido têm índice único em `(fonte, fonte_id)` — rodar um crawler de novo não duplica registros. Para o GitHub, `fonte_id` é o login da organização; para o Google, é o domínio (`displayLink`) do resultado — a única chave natural disponível, já que buscas não têm um "id" como uma org tem.

## Rotas

### Prints (OCR)
- `POST /busca` — multipart, campo `prints` (até 20 imagens). Roda OCR em cada imagem e insere em `empresas_nao_checadas` com `fonte = 'print'`.

### Empresas
- `GET /empresas/nao-checadas` — lista paginada e filtrável. Query params: `page`, `pageSize` (máx. 100), `status` (`pendente`/`confirmada`/`descartada`, omitido = todos), `fonte`, `q` (busca em nome/localização/descrição). Retorna `{ data, total, page, pageSize, totalPages }`.
- `GET /empresas/nao-checadas/fontes` — lista as fontes distintas já coletadas (para popular o filtro).
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

### Crawler (Google)
- `POST /crawler/google/run` — dispara a coleta em background (queries BR + PT). Responde:
  - `202` e roda assíncrono, ou
  - `400` se `GOOGLE_CSE_ID`/`GEMINI_API_KEY` não estiverem configurados (corpo inclui `faltando: [...]`), ou
  - `409` se já houver uma coleta em andamento, ou
  - `429` se o limite diário local já estiver esgotado (checa **antes** de iniciar, sem abrir navegador — é um contador local de proteção de custo, não uma quota exposta por alguma API).
- `GET /crawler/google/status` — indica se há uma coleta em andamento.

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

## Crawler do Google (widget de busca)

A Google Custom Search JSON API é paga e foi descontinuada neste projeto. Em vez dela, o crawler (`src/crawlers/googleCseCrawler.js`) roda o widget **gratuito** do Google Programmable Search Engine (`cse.js?cx=...`) dentro de um navegador headless (Puppeteer, gerenciado como singleton em `src/services/browserManager.js`): abre uma página local servida via HTTP (o widget não funciona em `about:blank`), dispara a busca programaticamente via `google.search.cse.element`, espera o callback `searchCallbacks.web.rendered` (não há endpoint JSON — esse é o sinal de "pronto") e extrai o texto renderizado dos resultados.

Como esse texto bruto não é estruturado, ele é repassado ao **Gemini** (`gerarConteudo` de `src/services/gemini.js`, com `responseSchema`) pedindo para devolver os itens em JSON (`title`/`link`/`snippet`/`displayLink`) — o mesmo formato que a API antiga retornava, então o resto do pipeline (`runGoogleCrawl`, `pesquisaEmpresa.js`) não precisou mudar. Roda uma lista pequena e editável de queries (`QUERIES`), por padrão 6 (BR/PT), uma busca cada — o widget não expõe paginação programática simples, então só a primeira leva de resultados é usada.

Cada resultado vira uma empresa com `nome`/`site` vindos do título/link e `motivo_duvida` sempre preenchido, já que resultado de busca não é um registro estruturado como uma org do GitHub — precisa de revisão manual.

Como cada busca agora sempre dispara uma chamada extra ao Gemini, o controle de uso (`src/services/usoApi.js`, tabela `uso_api_diario`, sobrevive a restart do servidor) funciona como um limite diário de proteção de custo, não mais como uma quota imposta pelo Google. O "reset" mostrado ao usuário é a próxima meia-noite local.

Rodar via linha de comando:

```bash
node scripts/runGoogleCrawler.js
```

## Pesquisa via Gemini ao confirmar

Ao confirmar uma empresa (`POST /empresas/nao-checadas/:id/confirmar`), o backend dispara, de forma síncrona (o request só responde depois de terminar), um pipeline de duas etapas (`src/services/pesquisaEmpresa.js`):

1. **Busca + pesquisa** — busca a empresa (nome + site) via o mesmo widget de busca do Google usado pelo crawler (`buscar()` de `src/crawlers/googleCseCrawler.js`) e repassa os resultados pro Gemini escrever um relatório em markdown (existência, contatos, e-mails, observações), com instrução explícita de só usar o que veio na busca. *Nota: a ferramenta nativa de Google Search grounding do próprio Gemini (`tools: google_search`) cobra por busca mesmo dentro da "cota gratuita" e exige faturamento habilitado no projeto — como esse não é o caso aqui, optamos por essa combinação (widget gratuito + Gemini só sintetizando) em vez do grounding nativo.*
2. **Análise** — repassa esse markdown numa segunda chamada ao Gemini (sem busca, com saída estruturada em JSON) pedindo pra dizer se a empresa existe de fato e listar os e-mails de contato encontrados.

O resultado é salvo em `empresas_confirmadas`: `pesquisa_status` (`pendente`/`concluida`/`erro`), `pesquisa_markdown`, `pesquisa_existe`, `pesquisa_emails` (JSON) e `pesquisa_erro`. O campo `contato_email` só é preenchido automaticamente com o primeiro e-mail encontrado se ainda estiver vazio — não sobrescreve um valor definido manualmente.

Falha nessa etapa (sem `GEMINI_API_KEY`, quota excedida, resposta inválida) **não desfaz a confirmação** — a empresa continua confirmada, só fica com `pesquisa_status = 'erro'` e o motivo em `pesquisa_erro`.

## Estrutura

```
src/
  app.js                  # bootstrap do Express
  db/
    schema.sql
    database.js            # conexão + migrações leves (ex: coluna fonte_id)
  crawlers/
    githubCrawler.js        # busca de orgs no GitHub + controle de rate limit
    googleCseCrawler.js      # busca via widget do Google (Puppeteer) + Gemini pra estruturar
  services/
    browserManager.js       # singleton lazy do navegador headless (Puppeteer)
    coletores.js            # extração de campos via OCR + persistência de empresas coletadas
    gemini.js                # cliente da API do Gemini
    pesquisaEmpresa.js        # pipeline de pesquisa (busca + Gemini) ao confirmar uma empresa
    usoApi.js                # contador de uso diário persistido (limite de proteção de custo)
    ocr.js                  # wrapper do tesseract.js
  routes/
    busca.js                 # upload de prints
    empresas.js               # revisão/confirmação de empresas
    envios.js                  # registro de contatos enviados
    crawler.js                  # disparo do crawler do GitHub via API
    crawlerGoogle.js             # disparo do crawler do Google via API
scripts/
  runCrawler.js             # execução standalone do crawler do GitHub
  runGoogleCrawler.js        # execução standalone do crawler do Google
frontend/                   # app React (Vite) — build gera direto em public/
  src/
    App.jsx                  # tela principal: dois crawlers + upload + tabela paginada
    CrawlerPanel.jsx          # painel genérico de crawler (usado por GitHub e Google)
    Filtros.jsx, TabelaEmpresas.jsx, Paginacao.jsx, UploadPrints.jsx
    api.js                    # chamadas à API (inclui fábrica de cliente de crawler)
public/                     # build de produção do frontend, servido estático pelo Express
data/                       # banco SQLite (ignorado no git)
```

## Frontend

Duas abas em React: "Buscar / Coletar" (os dois painéis de crawler + upload de prints) e "Empresas" (tabela paginada de `empresas_nao_checadas` com filtros por status, fonte e busca livre, e ações de confirmar/descartar direto na linha).

## Próximos passos (não implementados)

- Diretórios de empresas (Clutch, GoodFirms) — checar `robots.txt`/termos antes de qualquer scraping.
- Agendamento periódico dos crawlers (`node-cron`).
