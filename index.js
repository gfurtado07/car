require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario, buscarUsuario } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const openaiService = require('./services/openaiService');

setTimeout(() => {
  const bot = new TelegramBot(config.telegramToken, { polling: true });
  
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
    const telegramId = msg.from.id;

    console.log(`📩 Mensagem: "${texto}" de ${solicitante}`);

    try {
      // Salva/atualiza usuário
      await salvarUsuario(telegramId, solicitante);

      // Processa com OpenAI
      const respostaIA = await openaiService.conversar(texto, telegramId);
      
      // Tenta parsear JSON para chamados
      const respostaJSON = openaiService.tentarParsearJSON(respostaIA.resposta);
      
      let respostaFinal;
      if (respostaJSON && respostaJSON.resposta_usuario) {
        // É uma abertura de chamado
        respostaFinal = respostaJSON.resposta_usuario;
        
        // Aqui você pode processar os dados do chamado
        if (respostaJSON.tipo === 'abertura_chamado') {
          console.log('🎫 Dados do chamado:', respostaJSON.dados);
          // TODO: Salvar no Google Sheets, enviar email, etc.
        }
      } else {
        respostaFinal = respostaIA.resposta;
      }

      await bot.sendMessage(chatId, respostaFinal);
      console.log(`✅ Resposta enviada (${respostaIA.tokens_usados} tokens)`);

    } catch (error) {
      console.error('❌ Erro:', error);
      await bot.sendMessage(chatId, '⚠️ Erro interno. Tente novamente.');
    }
  });

  bot.on('polling_error', (err) => {
    if (!err.message.includes('409')) {
      console.error('❌ Polling error:', err.message);
    }
  });

  async function iniciarBot() {
    try {
      await inicializarBancoDados();
      startEmailMonitor();

      console.log('🤖 Bot CAR com OpenAI iniciado!');
      console.log('🧠 Modelo: gpt-4o-mini');
      console.log('💬 Histórico de conversas ativo');
      console.log('⏳ Aguardando mensagens...');
    } catch (error) {
      console.error('❌ Erro ao iniciar:', error);
    }
  }

  iniciarBot();
}, 10000);
