module.exports = {
  telegramToken: process.env.TELEGRAM_TOKEN,
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Google Sheets
  googleCredentials: process.env.GOOGLE_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CREDENTIALS) : null,
  sheetId: process.env.SHEET_ID,
  sheetName: process.env.SHEET_NAME || 'CAR',
  
  // IMAP
  imapHost: process.env.IMAP_HOST,
  imapPort: Number(process.env.IMAP_PORT) || 993,
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS
};

