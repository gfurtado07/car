require('dotenv').config();

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { inicializarBancoDados, salvarUsuario, buscarUsuario, atualizarRootId } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');
const iaService = require('./services/iaService');

// Aguarda 10 segundos para evitar conflitos
setTimeout(() => {
  const bot = new TelegramBot(config.telegramToken, { polling: true });
  
  // Handler de mensagens de texto com IA e memória conversacional
  bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const solicitante = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
    const telegramId = msg.from.id;

    console.log(`📩 Mensagem recebida: "${texto}" de ${solicitante} (ID: ${telegramId})`);

    try {
      // Busca usuário existente para pegar root_id
      let usuario = await buscarUsuario(telegramId);
      
      if (!usuario) {
        // Cria novo usuário se não existir
        usuario = await salvarUsuario(telegramId, solicitante);
        console.log('👤 Novo usuário criado:', solicitante);
      }

      // Pega root_id existente (pode ser null para primeira conversa)
      const rootIdAtual = usuario && usuario.root_id ? usuario.root_id : null;
      console.log(`🔍 Root_id atual do usuário: ${rootIdAtual || 'null (primeira conversa)'}`);

      // Chama agente conversacional com root_id
      const respostaIA = await iaService.converse(texto, rootIdAtual);
      
      // Debug da resposta da IA
      console.log('🤖 Resposta completa da IA:', JSON.stringify(respostaIA, null, 2));

      // Se recebeu novo root_id, atualiza no banco
      if (respostaIA.root_id && respostaIA.root_id !== rootIdAtual) {
        const usuarioAtualizado = await atualizarRootId(telegramId, respostaIA.root_id);
        console.log('💾 Root_id atualizado no banco:', respostaIA.root_id);
        console.log('✅ Usuário atualizado:', usuarioAtualizado);
      }

      // Processa resposta (JSON ou texto simples)
      const respostaJSON = iaService.tentarParsearJSON(respostaIA.resposta);
      
      let respostaFinal;
      if (respostaJSON && respostaJSON.resposta_usuario) {
        respostaFinal = respostaJSON.resposta_usuario;
      } else {
        respostaFinal = respostaIA.resposta;
      }

      // Validação da resposta final
      if (!respostaFinal || respostaFinal.trim() === '') {
        console.log('⚠️ Resposta vazia da IA, usando fallback');
        respostaFinal = 'Desculpe, não consegui processar sua mensagem. Pode tentar novamente?';
      }

      console.log(`📤 Enviando resposta: "${respostaFinal}"`);
      await bot.sendMessage(chatId, respostaFinal);
      console.log('✅ Resposta enviada ao usuário');

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      try {
        await bot.sendMessage(chatId, '⚠️ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
      } catch (sendError) {
        console.error('❌ Erro ao enviar mensagem de erro:', sendError);
      }
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

      console.log('🤖 Bot CAR KX3 com IA e Memória iniciado!');
      console.log('🧠 Sistema de root_id ativo para memória conversacional');
      console.log('🔗 Integrado com Pareto AI');
      console.log('🗄️ Banco de dados PostgreSQL conectado');
      console.log('⏳ Aguardando mensagens...');
    } catch (error) {
      console.error('❌ Erro ao iniciar o Bot:', error);
    }
  }

  iniciarBot();
  
}, 10000);
