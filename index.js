require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '<arquivo recebido>';

  // Resposta no Telegram
  await bot.sendMessage(chatId, `Recebi sua mensagem: "${text}". Em breve abrirei seu chamado!`);

  // Teste de leitura no Sheets
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A1`
    });
    const valor = res.data.values ? res.data.values[0][0] : 'vazio';
    await bot.sendMessage(chatId, `Valor em A1 da planilha é: "${valor}"`);
  }
  catch (err) {
    console.error('Erro ao ler planilha:', err);
    await bot.sendMessage(chatId, 'Não consegui ler a planilha :(');
  }
});

console.log('Bot iniciado...');
