const axios = require('axios');
const config = require('../config');

async function consultarAgente(agentId, mensagem) {
  try {
    const response = await axios.post(
      `${config.paretoApiUrl}/agents/${agentId}/execute`,
      {
        messages: [{ role: 'user', content: mensagem }],
        temperature: 0.7,
        model: "tess-5",
        tools: "no-tools",
        wait_execution: true
      },
      {
        headers: {
          'Authorization': `Bearer ${config.paretoApiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.responses && response.data.responses[0]) {
      return response.data.responses[0].output;
    }
    throw new Error('Resposta inválida do agente');
  } catch (error) {
    console.error(`Erro ao consultar agente ${agentId}:`, error.message);
    throw error;
  }
}

module.exports = {
  summarizeTicket(dadosChamado) {
    return consultarAgente(config.ticketSummarizerAgentId, JSON.stringify(dadosChamado));
  },
  composeEmail(dadosEmail) {
    return consultarAgente(config.emailComposerAgentId, JSON.stringify(dadosEmail));
  },
  converse(mensagem) {
    return consultarAgente(config.conversationalAgentId, mensagem);
  },
  editTicket(descricao, contexto) {
    return consultarAgente(config.ticketEditorAgentId, JSON.stringify({ descricao, contexto }));
  },
  processEmailResponse(emailData) {
    return consultarAgente(config.emailResponseProcessorAgentId, JSON.stringify(emailData));
  },
  analyzeAttachment(attachmentData) {
    return consultarAgente(config.attachmentAnalyzerAgentId, JSON.stringify(attachmentData));
  },
  updateStatus(updateData) {
    return consultarAgente(config.statusUpdateAgentId, JSON.stringify(updateData));
  },
};
