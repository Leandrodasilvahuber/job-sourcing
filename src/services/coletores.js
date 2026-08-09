/**
 * Heurística para extrair empresas a partir do texto bruto extraído por OCR
 * de um print. Um único print pode conter uma listagem com várias empresas
 * (ex: resultados de busca de vagas no LinkedIn) — nesse caso, o nome de
 * cada empresa costuma sair do OCR como uma linha curta isolada (cercada
 * por linhas em branco), porque é um bloco de texto visualmente separado
 * no layout original. O texto bruto completo é sempre preservado à parte
 * (ver dados_brutos), então erros aqui não perdem informação — só afetam
 * os campos de destaque.
 */
// Cada alternativa é ancorada à linha inteira (^...$) — evita casar um
// trecho de "cidade, UF" no meio de uma frase qualquer (ex: uma vírgula
// seguida de duas letras dentro de um parágrafo de descrição de vaga).
const PADRAO_LOCALIZACAO_MODALIDADE = /\b(remoto|home\s*office|h[ií]brido|presencial)\b/i;
const PADRAO_LOCALIZACAO_CIDADE_UF = /^[a-zà-ÿ][a-zà-ÿ\s.'-]{1,28},\s*[a-z]{2}$/i;
const PADRAO_LOCALIZACAO_PAIS = /^[a-zà-ÿ][a-zà-ÿ\s.'-]{1,28}[,-]\s*(brasil|portugal)$/i;

// Uma linha só é considerada localização se tiver "cara" de localização
// (curta, sem ser um trecho de frase) e casar algum dos padrões acima.
function pareceLinhaDeLocalizacao(linha) {
  if (!linha || linha.length > 40) return false;
  return (
    PADRAO_LOCALIZACAO_MODALIDADE.test(linha) ||
    PADRAO_LOCALIZACAO_CIDADE_UF.test(linha) ||
    PADRAO_LOCALIZACAO_PAIS.test(linha)
  );
}

// Termos de interface e de cargo que aparecem como linhas curtas isoladas
// mas não são nome de empresa — evita falso positivo tipo "Engenheiro de
// Software Pleno" ou "Candidatura simplificada".
const PADRAO_RUIDO = /engenheiro|desenvolvedor|developer|analista|program(a|e)dor|estagi|competê|tempo integral|remoto|h[ií]brido|presencial|mensagens|avaliando|contratando|prefer[êe]ncias|resultados|classifica[çc][ãa]o|institui[çc][ãa]o|candidatura|sobre a vaga|contract\b|full.?time|part.?time|^vagas?\b|salvar|filtro|pesquisa/i;

function pareceNomeDeEmpresa(linha) {
  if (!linha || linha.length < 2 || linha.length > 40) return false;
  if (/\d/.test(linha)) return false;
  if (!/[a-zA-ZÀ-ú]/.test(linha)) return false;
  if (pareceLinhaDeLocalizacao(linha)) return false;
  if (PADRAO_RUIDO.test(linha)) return false;
  return true;
}

function slugify(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function contexto(linhas, indice, janela = 6) {
  const inicio = Math.max(0, indice - janela);
  const fim = Math.min(linhas.length, indice + janela + 1);
  return linhas
    .slice(inicio, fim)
    .filter((_, i) => inicio + i !== indice)
    .filter(Boolean);
}

function extrairEmpresasDePrint(textoBruto) {
  const linhas = (textoBruto || '').split('\n').map((linha) => linha.trim());

  if (linhas.every((linha) => !linha)) {
    return [{
      nome: null,
      localizacao: null,
      descricao: null,
      motivo_duvida: 'OCR não retornou texto legível para este print.',
    }];
  }

  const indicesCandidatos = linhas
    .map((linha, i) => ({ linha, i }))
    .filter(({ linha, i }) => {
      if (!pareceNomeDeEmpresa(linha)) return false;
      const anterior = linhas[i - 1];
      const proxima = linhas[i + 1];
      // isolada: linha em branco (ou início/fim do texto) nos dois lados
      const isoladaAntes = i === 0 || !anterior;
      const isoladaDepois = i === linhas.length - 1 || !proxima;
      return isoladaAntes && isoladaDepois;
    });

  if (indicesCandidatos.length === 0) {
    // fallback: print de uma vaga/empresa só, sem múltiplos cards isolados
    const linhasComTexto = linhas.filter(Boolean);
    const linhaLocalizacao = linhasComTexto.find(pareceLinhaDeLocalizacao);
    return [{
      nome: linhasComTexto[0],
      localizacao: linhaLocalizacao ?? null,
      descricao: linhasComTexto.join(' '),
      motivo_duvida: linhaLocalizacao
        ? null
        : 'Localização não identificada automaticamente a partir do print — revisar manualmente.',
    }];
  }

  return indicesCandidatos.map(({ linha: nome, i }) => {
    const linhasContexto = contexto(linhas, i);
    const linhaLocalizacao = linhasContexto.find(pareceLinhaDeLocalizacao);
    return {
      nome,
      localizacao: linhaLocalizacao ?? null,
      descricao: linhasContexto.join(' '),
      motivo_duvida: linhaLocalizacao
        ? 'Nome extraído automaticamente de uma listagem com múltiplas empresas — revisar manualmente.'
        : 'Nome extraído automaticamente de uma listagem com múltiplas empresas; localização não identificada — revisar manualmente.',
    };
  });
}

const db = require('../db/database');

const inserirEmpresaColetada = db.prepare(`
  INSERT OR IGNORE INTO empresas_nao_checadas
    (nome, site, fonte, fonte_id, descricao, localizacao, dados_brutos, motivo_duvida)
  VALUES
    (@nome, @site, @fonte, @fonte_id, @descricao, @localizacao, @dados_brutos, @motivo_duvida)
`);

function salvarEmpresaColetada(empresa) {
  return inserirEmpresaColetada.run(empresa);
}

const buscarPorFonteEId = db.prepare(`
  SELECT 1 FROM empresas_nao_checadas WHERE fonte = ? AND fonte_id = ?
`);

function empresaJaColetada(fonte, fonteId) {
  return !!buscarPorFonteEId.get(fonte, fonteId);
}

module.exports = { extrairEmpresasDePrint, slugify, salvarEmpresaColetada, empresaJaColetada };
