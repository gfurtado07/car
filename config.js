module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  sheetId: process.env.SHEET_ID,
  sheetName: process.env.SHEET_NAME,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  imapHost: process.env.IMAP_HOST,
  imapPort: Number(process.env.IMAP_PORT) || 993,
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS,
  paretoApiUrl: 'https://tess.pareto.io/api',
  paretoApiToken: process.env.PARETO_API_TOKEN,

  ticketSummarizerAgentId: process.env.PARETO_AGENT_ID_TICKET_SUMMARIZER || '27266',
  emailComposerAgentId: process.env.PARETO_AGENT_ID_EMAIL_COMPOSER || '27267',
  conversationalAgentId: process.env.PARETO_AGENT_ID_CONVERSATIONAL_AGENT || '27268',
  ticketEditorAgentId: process.env.PARETO_AGENT_ID_TICKET_EDITOR || '27269',
  emailResponseProcessorAgentId: process.env.PARETO_AGENT_ID_EMAIL_RESPONSE_PROCESSOR || '27270',
  attachmentAnalyzerAgentId: process.env.PARETO_AGENT_ID_ATTACHMENT_ANALYZER || '27271',
  statusUpdateAgentId: process.env.PARETO_AGENT_ID_STATUS_UPDATE || '27273',

  nodeEnv: process.env.NODE_ENV || 'development',
};
