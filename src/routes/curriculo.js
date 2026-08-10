const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../db/database');

const CAMINHO_ARQUIVO = path.join(__dirname, '../../data/curriculo.pdf');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Apenas arquivos PDF são aceitos.'));
    }
    cb(null, true);
  },
});

const buscarMetadados = db.prepare('SELECT * FROM curriculo WHERE id = 1');
const salvarMetadados = db.prepare(`
  INSERT INTO curriculo (id, nome_arquivo, tamanho, atualizado_em)
  VALUES (1, @nome_arquivo, @tamanho, CURRENT_TIMESTAMP)
  ON CONFLICT (id) DO UPDATE SET
    nome_arquivo = excluded.nome_arquivo,
    tamanho = excluded.tamanho,
    atualizado_em = excluded.atualizado_em
`);

router.post('/', upload.single('curriculo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Envie o arquivo no campo "curriculo".' });
  }

  fs.writeFileSync(CAMINHO_ARQUIVO, req.file.buffer);
  salvarMetadados.run({ nome_arquivo: req.file.originalname, tamanho: req.file.size });

  res.status(201).json(buscarMetadados.get());
});

router.get('/', (req, res) => {
  res.json(buscarMetadados.get() ?? null);
});

router.get('/download', (req, res) => {
  const metadados = buscarMetadados.get();
  if (!metadados || !fs.existsSync(CAMINHO_ARQUIVO)) {
    return res.status(404).json({ error: 'Nenhum currículo enviado ainda.' });
  }
  res.download(CAMINHO_ARQUIVO, metadados.nome_arquivo);
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Apenas arquivos PDF são aceitos.') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
