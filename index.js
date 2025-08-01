require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');

// Aguarda 10 segundos para garantir que não há conflitos
setTimeout(() => {
  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
  
  console.log('🤖 Bot simples iniciado!');
  
  bot.on('text', (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    console.log(`📩 Mensagem: "${texto}"`);
    bot.sendMessage(chatId, `Echo: ${texto}`);
  });
  
  bot.on('polling_error', (err) => {
    console.error('❌ Polling error:', err.message);
  });
  
}, 10000);
