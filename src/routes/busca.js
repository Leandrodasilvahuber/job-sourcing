const express = require('express');
const multer = require('multer');
const router = express.Router();
const { extrairTexto } = require('../services/ocr');
const { extrairEmpresasDePrint, slugify, salvarEmpresaColetada } = require('../services/coletores');
const { iniciarExecucao, concluirExecucao } = require('../services/execucoes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas arquivos de imagem são aceitos.'));
    }
    cb(null, true);
  },
});

router.post('/', upload.array('prints', 20), async (req, res) => {
  const arquivos = req.files;
  if (!arquivos || arquivos.length === 0) {
    return res.status(400).json({ error: 'Envie ao menos um print no campo "prints".' });
  }

  const execucaoId = iniciarExecucao('print');
  const inseridos = [];
  const duplicados = [];
  for (const arquivo of arquivos) {
    const textoBruto = await extrairTexto(arquivo.buffer);
    const empresasDetectadas = extrairEmpresasDePrint(textoBruto);

    for (const campos of empresasDetectadas) {
      const registro = {
        nome: campos.nome,
        site: null,
        fonte: 'print',
        fonte_id: campos.nome ? slugify(campos.nome) : null,
        descricao: campos.descricao,
        localizacao: campos.localizacao,
        dados_brutos: JSON.stringify({ arquivo_original: arquivo.originalname, texto_ocr: textoBruto }),
        motivo_duvida: campos.motivo_duvida,
      };

      const info = salvarEmpresaColetada(registro);
      if (info.changes > 0) {
        inseridos.push({ id: info.lastInsertRowid, ...registro });
      } else {
        duplicados.push(registro.nome);
      }
    }
  }

  concluirExecucao(execucaoId, {
    status: 'concluida',
    processadas: inseridos.length + duplicados.length,
    novas: inseridos.length,
    puladas: duplicados.length,
  });

  res.status(201).json({ inseridos, duplicados });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Apenas arquivos de imagem são aceitos.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
