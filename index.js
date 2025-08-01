require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario, buscarUsuario } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const openaiService = require('./services/openaiService');
// (Futuramente) const chamadoService = require('./services/chamadoService');

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

      // Tenta parsear JSON para identificar abertura de chamado
      const respostaJSON = openaiService.tentarParsearJSON(respostaIA.resposta);

      let respostaFinal = respostaIA.resposta;

      if (respostaJSON && respostaJSON.tipo === 'abertura_chamado' && respostaJSON.dados) {
        respostaFinal = respostaJSON.resposta_usuario || '[Chamado aberto]';

        // >>> Aqui você pode salvar o chamado localmente e/ou na planilha <<<
        /*
        const protocoloSalvo = await chamadoService.registraChamado(
          respostaJSON.dados,
          telegramId
        );
        respostaFinal += `\n✨ Seu chamado foi registrado! Protocolo: ${protocoloSalvo}`;
        */

        // Loga dados do chamado para debug
        console.log('🎫 Novo chamado:', respostaJSON.dados);
      }

      await bot.sendMessage(chatId, respostaFinal);
      console.log('✅ Resposta enviada');

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
      console.log('🧠 Histórico de conversas ativo');
      console.log('⏳ Aguardando mensagens...');
    } catch (error) {
      console.error('❌ Erro ao iniciar:', error);
    }
  }

  iniciarBot();
}, 10000);

