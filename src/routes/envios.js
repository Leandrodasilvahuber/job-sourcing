const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { enviarEmailComCv } = require('../services/emailSender');

const buscarEmpresaConfirmada = db.prepare(`
  SELECT * FROM empresas_confirmadas WHERE id = ?
`);
const inserirEnvio = db.prepare(`
  INSERT INTO envios (empresa_id, canal, conteudo_enviado, status)
  VALUES (@empresa_id, @canal, @conteudo_enviado, @status)
`);
const buscarAssunto = db.prepare('SELECT conteudo FROM email_assunto WHERE id = 1');
const buscarTexto = db.prepare('SELECT conteudo FROM email_texto WHERE id = 1');
const buscarCurriculoMeta = db.prepare('SELECT * FROM curriculo WHERE id = 1');
const inserirEnvioCv = db.prepare(`
  INSERT INTO envios (empresa_id, canal, destinatario_email, conteudo_enviado, status)
  VALUES (@empresa_id, 'cv', @destinatario_email, @conteudo_enviado, 'enviado')
`);
const listarEnvios = db.prepare(`
  SELECT * FROM envios ORDER BY data_envio DESC
`);
const buscarEnvioPorId = db.prepare(`
  SELECT * FROM envios WHERE id = ?
`);
const atualizarResposta = db.prepare(`
  UPDATE envios SET resposta = ?, status = ?, data_resposta = CURRENT_TIMESTAMP WHERE id = ?
`);

router.post('/', (req, res) => {
  const { empresa_id, canal, conteudo_enviado, status } = req.body;

  if (!empresa_id) {
    return res.status(400).json({ error: 'Campo "empresa_id" é obrigatório.' });
  }

  const empresa = buscarEmpresaConfirmada.get(empresa_id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa confirmada não encontrada.' });
  }

  const info = inserirEnvio.run({
    empresa_id,
    canal: canal ?? null,
    conteudo_enviado: conteudo_enviado ?? null,
    status: status ?? 'enviado',
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/', (req, res) => {
  res.json(listarEnvios.all());
});

router.post('/cv', async (req, res) => {
  const { empresa_id, destinatario_email } = req.body;

  if (!empresa_id) {
    return res.status(400).json({ error: 'Campo "empresa_id" é obrigatório.' });
  }
  if (!destinatario_email || !destinatario_email.trim()) {
    return res.status(400).json({ error: 'Campo "destinatario_email" é obrigatório.' });
  }

  const empresa = buscarEmpresaConfirmada.get(empresa_id);
  if (!empresa) {
    return res.status(404).json({ error: 'Empresa confirmada não encontrada.' });
  }

  const assunto = buscarAssunto.get();
  if (!assunto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum título de email cadastrado. Cadastre o título no dashboard antes de enviar.' });
  }

  const texto = buscarTexto.get();
  if (!texto?.conteudo) {
    return res.status(400).json({ error: 'Nenhum texto de email cadastrado. Cadastre o texto no dashboard antes de enviar.' });
  }

  const curriculoMeta = buscarCurriculoMeta.get();
  if (!curriculoMeta) {
    return res.status(400).json({ error: 'Nenhum currículo em PDF cadastrado. Envie um currículo no dashboard antes de enviar.' });
  }

  try {
    await enviarEmailComCv({
      destinatario: destinatario_email.trim(),
      assunto: assunto.conteudo,
      corpo: texto.conteudo,
      nomeArquivoCv: curriculoMeta.nome_arquivo,
    });
  } catch (erro) {
    return res.status(400).json({ error: erro.message });
  }

  const info = inserirEnvioCv.run({
    empresa_id,
    destinatario_email: destinatario_email.trim(),
    conteudo_enviado: texto.conteudo,
  });

  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id/resposta', (req, res) => {
  const { id } = req.params;
  const envio = buscarEnvioPorId.get(id);
  if (!envio) {
    return res.status(404).json({ error: 'Envio não encontrado.' });
  }

  const { resposta, status } = req.body;
  atualizarResposta.run(resposta ?? null, status ?? 'respondido', id);

  res.json(buscarEnvioPorId.get(id));
});

module.exports = router;
