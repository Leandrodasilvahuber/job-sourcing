// Singleton lazy do navegador headless (Puppeteer), usado pelo crawler do
// Google CSE. Evitamos abrir/fechar um Chromium inteiro a cada busca (custo
// de ~300-800ms de launch) já que o processo já é long-running.
const puppeteer = require('puppeteer');

let browserPromise = null;

async function obterBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    browserPromise.then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null;
      });
    });
  }
  return browserPromise;
}

module.exports = { obterBrowser };
