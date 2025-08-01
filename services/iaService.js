const axios = require('axios');
const config = require('../config');

/**
 * Envia mensagem para o agente conversacional Pareto e retorna a resposta
 */
async function converse(mensagemUsuario, contextoConversa = []) {
  try {
    const messages = [
      ...contextoConversa,
      { role: 'user', content: mensagemUsuario }
    ];

    console.log('🤖 Enviando para agente IA:', mensagemUsuario);

    const response = await axios.post(
      `${config.paretoApiUrl}/agents/${config.paretoAgentId}/execute`,
      {
        messages: messages,
        temperature: 0.7,
        model: "tess-5",
        tools: "no-tools",
        wait_execution: true
      },
      {
        headers: {
          'Authorization': `Bearer ${config.paretoToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 segundos timeout
      }
    );

    if (response.data && response.data.responses && response.data.responses[0]) {
      const output = response.data.responses[0].output;
      console.log('✅ Resposta do agente IA recebida');
      return output;
    }
    
    throw new Error('Resposta inválida do agente IA');

  } catch (error) {
    console.error('❌ Erro ao consultar agente IA:', error.message);
    
    // Fallback para quando o agente IA não responder
    return "Olá! Sou o assistente do CAR (Central de Atendimento ao Representante). Como posso ajudá-lo hoje? Para abrir um chamado, digite 'abrir chamado'.";
  }
}

/**
 * Tenta fazer parse JSON da resposta do agente, se falhar retorna texto simples
 */
function tentarParsearJSON(texto) {
  try {
    const textoLimpo = texto.trim();
    const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.log('ℹ️ Resposta não é JSON, usando como texto simples');
    return null;
  }
}

module.exports = {
  converse,
  tentarParsearJSON
};
