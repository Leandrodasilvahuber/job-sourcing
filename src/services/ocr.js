const Tesseract = require('tesseract.js');

async function extrairTexto(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'por');
  return (data.text || '').trim();
}

module.exports = { extrairTexto };
