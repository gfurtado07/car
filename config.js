module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  openaiApiKey: process.env.OPENAI_API_KEY, // Nova configuração
  imapHost: process.env.IMAP_HOST,
  imapPort: Number(process.env.IMAP_PORT) || 993,
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS
};

