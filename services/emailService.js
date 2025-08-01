const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;
const config = require('../config');

function startEmailMonitor() {
  const imapConfig = {
    user: config.imapUser,
    password: config.imapPass,
    host: config.imapHost,
    port: config.imapPort,
    tls: true
  };

  const imap = new Imap(imapConfig);

  imap.once('ready', () => {
    imap.openBox('INBOX', false, function (err, box) {
      if (err) {
        console.error('Erro ao abrir a caixa de entrada:', err);
        return;
      }
      console.log('📬 Monitor de e-mails iniciado com sucesso!');
      // Aqui vai sua lógica de monitoramento (para simplificar, mantemos assim por enquanto)
    });
  });

  imap.once('error', err => {
    console.error('Erro IMAP:', err);
  });

  imap.once('end', () => {
    console.log('Conexão IMAP encerrada. Tentando reconectar em 60 segundos...');
    setTimeout(startEmailMonitor, 60000);
  });

  imap.connect();
}

module.exports = { startEmailMonitor };
