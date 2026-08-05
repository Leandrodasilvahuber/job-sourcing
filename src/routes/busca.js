const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db/database');
const { extrairTexto } = require('../services/ocr');
const { extrairCamposDePrint } = require('../services/coletores');

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

const insertEmpresaNaoChecada = db.prepare(`
  INSERT INTO empresas_nao_checadas (nome, site, fonte, descricao, localizacao, dados_brutos, motivo_duvida)
  VALUES (@nome, @site, @fonte, @descricao, @localizacao, @dados_brutos, @motivo_duvida)
`);

router.post('/', upload.array('prints', 20), async (req, res) => {
  const arquivos = req.files;
  if (!arquivos || arquivos.length === 0) {
    return res.status(400).json({ error: 'Envie ao menos um print no campo "prints".' });
  }

  const inseridos = [];
  for (const arquivo of arquivos) {
    const textoBruto = await extrairTexto(arquivo.buffer);
    const campos = extrairCamposDePrint(textoBruto);

    const registro = {
      nome: campos.nome,
      site: null,
      fonte: 'print',
      descricao: campos.descricao,
      localizacao: campos.localizacao,
      dados_brutos: JSON.stringify({ arquivo_original: arquivo.originalname, texto_ocr: textoBruto }),
      motivo_duvida: campos.motivo_duvida,
    };

    const info = insertEmpresaNaoChecada.run(registro);
    inseridos.push({ id: info.lastInsertRowid, ...registro });
  }

  res.status(201).json({ inseridos });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Apenas arquivos de imagem são aceitos.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
