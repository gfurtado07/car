module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  paretoApiUrl: process.env.PARETO_API_URL || 'https://tess.pareto.io/api',
  paretoToken: process.env.PARETO_API_TOKEN,
  paretoAgentId: process.env.PARETO_AGENT_ID,
  imapHost: process.env.IMAP_HOST,
  imapPort: Number(process.env.IMAP_PORT) || 993,
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS
};
