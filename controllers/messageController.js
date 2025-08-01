const iaService = require('../services/iaService');
const bot = require('../handlers/telegram'); // para enviar mensagens
const { salvarUsuario, buscarUsuario } = require('../utils/helpers');

async function processarMensagem(chatId, texto, solicitante, telegramId) {
  try {
    // Salva ou atualiza o usuário no banco
    await salvarUsuario(telegramId, solicitante);

    // Busca dados do usuário, caso precise (exemplo)
    const usuario = await buscarUsuario(telegramId);

    // Chama o agente conversacional para interpretar a mensagem e decidir ação
    const respostaRaw = await iaService.converse(texto);
    
    // Tenta parsear JSON da resposta
    let respostaIA;
    try {
      respostaIA = JSON.parse(respostaRaw);
    } catch {
      // Caso retorno seja texto simples
      respostaIA = {
        resposta_usuario: respostaRaw,
        acao: 'continuar_conversa'
      };
    }

    // Envia resposta ao usuário conforme retorno do agente
    await bot.sendMessage(chatId, respostaIA.resposta_usuario || 'Desculpe, não entendi sua mensagem.');

    // Pode expandir para lidar com status, abrir chamado, etc. conforme "acao"

  } catch (error) {
    console.error('Erro no messageController.processarMensagem:', error);
    await bot.sendMessage(chatId, '❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
  }
}

async function callbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    if (data.startsWith('finalizar_')) {
      const protocolo = data.replace('finalizar_', '');
      await bot.sendMessage(chatId, `✅ Chamado ${protocolo} finalizado com sucesso!`);
      // Aqui você pode integrar a atualização em banco ou planilha
    } else if (data.startsWith('mais_')) {
      const protocolo = data.replace('mais_', '');
      await bot.sendMessage(chatId, `✍️ Você pode enviar mais informações para o chamado ${protocolo}.`);
    } else {
      await bot.sendMessage(chatId, `❓ Comando não reconhecido.`);
    }
  } catch (error) {
    console.error('Erro no messageController.callbackQuery:', error);
    await bot.sendMessage(chatId, '❌ Ocorreu um erro ao processar sua solicitação.');
  }
}

module.exports = {
  processarMensagem,
  callbackQuery
};

