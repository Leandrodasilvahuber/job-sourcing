function escapeHtml(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Palavras que costumam abrir o parágrafo de despedida/assinatura — usado só
// pra dar um estilo levemente diferente (mais discreto) a esse bloco, sem
// depender de o usuário marcar isso de alguma forma no texto.
const INICIO_DESPEDIDA = /^(atenciosamente|att\.?|cordialmente|abra[çc]os?|grato|obrigado)/i;

function paragrafoParaHtml(paragrafo, { estiloAssinatura }) {
  const linhas = escapeHtml(paragrafo.trim()).split('\n').join('<br>');
  const estilo = estiloAssinatura
    ? 'margin:0;color:#6b7280;font-size:14px;line-height:1.7;'
    : 'margin:0 0 18px;color:#1f2937;font-size:15px;line-height:1.7;';
  return `<p style="${estilo}">${linhas}</p>`;
}

// Envolve o texto puro do corpo do e-mail (editado no dashboard, com
// parágrafos separados por linha em branco) num layout HTML simples e
// profissional — tabela com largura fixa, fontes de sistema, sem depender
// de imagens externas ou CSS que clientes de e-mail (Outlook, Gmail) não
// suportam bem.
function montarHtmlEmail(corpo) {
  const paragrafos = corpo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlParagrafos = paragrafos
    .map((p, i) => paragrafoParaHtml(p, {
      estiloAssinatura: i === paragrafos.length - 1 && INICIO_DESPEDIDA.test(p),
    }))
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Candidatura</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f3f5;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,0.08);">
<tr><td style="height:5px;background-color:#2563eb;line-height:5px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 40px 8px;">
${htmlParagrafos}
</td></tr>
<tr><td style="padding:8px 40px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:8px;">
<tr><td style="padding-top:18px;font-size:12.5px;color:#9ca3af;">
📎 Currículo em anexo (PDF).
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { montarHtmlEmail };
