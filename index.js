require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const iaService = require('./services/iaService');

// Aguarda 3 segundos antes de iniciar o bot para garantir que não há conflitos
setTimeout(async () => {
  try {
    // Inicializa banco
    await inicializarBancoDados();
    
    // Inicializa bot com polling
    const bot = new TelegramBot(config.telegramToken, { polling: true });
    
    console.log('🤖 Bot iniciado com sucesso!');

    // Handler básico de texto
    bot.on('text', async (msg) => {
      const chatId = msg.chat.id;
      const texto = msg.text;
      const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
      const telegramId = msg.from.id;

      console.log(`📩 Mensagem recebida: "${texto}" de ${solicitante}`);

      try {
        // Salva usuário
        await salvarUsuario(telegramId, solicitante);
        
        // Resposta simples por enquanto
        await bot.sendMessage(chatId, `Olá ${solicitante}! Recebi sua mensagem: "${texto}"`);
        
      } catch (error) {
        console.error('❌ Erro:', error);
        await bot.sendMessage(chatId, '❌ Erro interno.');
      }
    });

    // Handler de erros
    bot.on('polling_error', (err) => {
      console.error('❌ Polling error:', err.message);
    });

    // Inicia monitor de email
    startEmailMonitor();
    
  } catch (error) {
    console.error('❌ Erro ao iniciar:', error);
  }
}, 3000);
