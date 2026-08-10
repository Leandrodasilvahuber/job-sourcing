const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const CAMINHO_CURRICULO = path.join(__dirname, '../../data/curriculo.pdf');

function validarCredenciais() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('Credenciais do Gmail não configuradas. Defina GMAIL_USER e GMAIL_APP_PASSWORD no .env.');
  }
  return { GMAIL_USER, GMAIL_APP_PASSWORD };
}

async function enviarEmailComCv({ destinatario, assunto, corpo, nomeArquivoCv }) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = validarCredenciais();

  if (!fs.existsSync(CAMINHO_CURRICULO)) {
    throw new Error('Nenhum currículo em PDF encontrado. Envie um currículo no dashboard antes de enviar o CV.');
  }

  const transportador = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  try {
    await transportador.sendMail({
      from: GMAIL_USER,
      to: destinatario,
      subject: assunto,
      text: corpo,
      attachments: [
        { filename: nomeArquivoCv || 'curriculo.pdf', path: CAMINHO_CURRICULO },
      ],
    });
  } catch (erro) {
    throw new Error(`Falha ao enviar email via Gmail: ${erro.message}`);
  }
}

module.exports = { enviarEmailComCv };
