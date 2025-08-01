require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario, buscarUsuario } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const iaService = require('./services/iaService');

// Aguarda 10 segundos para evitar conflitos
setTimeout(() => {
  const bot = new TelegramBot(config.telegramToken, { polling: true });
  
  // Handler de mensagens de texto com IA
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
    const telegramId = msg.from.id;

    console.log(`📩 Mensagem recebida: "${texto}" de ${solicitante}`);

    try {
      // Salva usuário no banco
      await salvarUsuario(telegramId, solicitante);

      // Chama agente conversacional
      const respostaRaw = await iaService.converse(texto);
      
      // Tenta parsear JSON, se falhar usa texto simples
      const respostaJSON = iaService.tentarParsearJSON(respostaRaw);
      
      let respostaFinal;
      if (respostaJSON && respostaJSON.resposta_usuario) {
        respostaFinal = respostaJSON.resposta_usuario;
      } else {
        respostaFinal = respostaRaw;
      }

      await bot.sendMessage(chatId, respostaFinal);
      console.log('✅ Resposta enviada ao usuário');

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      await bot.sendMessage(chatId, '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
    }
  });

  // Handler de erros de polling (silencioso para não poluir o log)
  bot.on('polling_error', (err) => {
    if (!err.message.includes('409')) {
      console.error('❌ Polling error:', err.message);
    }
  });

  // Inicialização
  async function iniciarBot() {
    try {
      await inicializarBancoDados();
      startEmailMonitor();

      console.log('🤖 Bot CAR KX3 com IA iniciado!');
      console.log('🚀 Integrado com Pareto AI');
      console.log('🗄️ Banco de dados PostgreSQL conectado');
      console.log('⌛ Aguardando mensagens...');
    } catch (error) {
      console.error('❌ Erro ao iniciar o Bot:', error);
    }
  }

  iniciarBot();
  
}, 10000);
