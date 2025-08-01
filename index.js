require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario, buscarUsuario } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const iaService = require('./services/iaService');

// Inicializa o bot uma única vez
const bot = new TelegramBot(config.telegramToken, { polling: true });

// Handler de mensagens de texto
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text;
  const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  const telegramId = msg.from.id;

  console.log('Mensagem recebida:', texto, 'de:', solicitante);

  try {
    // Salva usuário no banco
    await salvarUsuario(telegramId, solicitante);

    // Chama agente conversacional
    const respostaRaw = await iaService.converse(texto);
    
    let respostaIA;
    try {
      respostaIA = JSON.parse(respostaRaw);
    } catch {
      respostaIA = {
        resposta_usuario: respostaRaw,
        acao: 'continuar_conversa'
      };
    }

    await bot.sendMessage(chatId, respostaIA.resposta_usuario || 'Desculpe, não entendi sua mensagem.');

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    await bot.sendMessage(chatId, '❌ Ocorreu um erro ao processar sua mensagem.');
  }
});

// Handler de callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  console.log('Callback recebido:', data);

  try {
    if (data.startsWith('finalizar_')) {
      const protocolo = data.replace('finalizar_', '');
      await bot.sendMessage(chatId, `✅ Chamado ${protocolo} finalizado com sucesso!`);
    } else if (data.startsWith('mais_')) {
      const protocolo = data.replace('mais_', '');
      await bot.sendMessage(chatId, `✍️ Você pode enviar mais informações para o chamado ${protocolo}.`);
    }
    
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Erro no callback:', error);
  }
});

// Handler de erros de polling
bot.on('polling_error', (err) => {
  console.error('Polling error:', err);
});

async function iniciarBot() {
  try {
    await inicializarBancoDados();
    startEmailMonitor();

    console.log('🤖 Bot CAR KX3 com IA iniciado!');
    console.log('🚀 Integrado com Pareto AI');
    console.log('🗄️ Banco de dados PostgreSQL conectado');
    console.log('⌛ Aguardando mensagens...');
  } catch (error) {
    console.error('Erro ao iniciar o Bot:', error);
    process.exit(1);
  }
}

iniciarBot();
