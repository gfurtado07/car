const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const messageController = require('../controllers/messageController'); // ainda vamos criar este arquivo
const bot = new TelegramBot(config.telegramToken, { polling: true });

// Evento para mensagens de texto
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text;
  const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  const telegramId = msg.from.id;

  try {
    await messageController.processarMensagem(chatId, texto, solicitante, telegramId);
  } catch (error) {
    console.error('Erro processando mensagem:', error);
    await bot.sendMessage(chatId, '❌ Desculpe, ocorreu um erro ao processar sua mensagem.');
  }
});

// Evento para callback queries (botões inline)
bot.on('callback_query', async (query) => {
  try {
    await messageController.callbackQuery(query);
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Erro no callback query:', error);
    await bot.sendMessage(query.message.chat.id, '❌ Desculpe, ocorreu um erro ao processar sua solicitação.');
  }
});

module.exports = bot; // exporta a instância para o index.js e outros módulos
