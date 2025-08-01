const axios = require('axios');
const config = require('../config');

/**
 * Envia mensagem para o agente conversacional Pareto com root_id para memória
 */
async function converse(mensagemUsuario, rootId = null, contextoConversa = []) {
  try {
    const messages = [
      ...contextoConversa,
      { role: 'user', content: mensagemUsuario }
    ];

    console.log('🤖 Enviando para agente IA:', mensagemUsuario);
    if (rootId) {
      console.log('🧠 Usando root_id para memória:', rootId);
    }

    // Monta o payload com root_id se disponível
    const payload = {
      messages: messages,
      temperature: 0.7,
      model: "tess-5",
      tools: "no-tools",
      wait_execution: true
    };

    // Adiciona root_id apenas se existir
    if (rootId) {
      payload.root_id = rootId;
    }

    const response = await axios.post(
      `${config.paretoApiUrl}/agents/${config.paretoAgentId}/execute`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${config.paretoToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.responses && response.data.responses[0]) {
      const output = response.data.responses[0].output;
      
      // Extrai o root_id da resposta se disponível
      let novoRootId = null;
      if (response.data.root_id) {
        novoRootId = response.data.root_id;
        console.log('🆔 Novo root_id recebido:', novoRootId);
      }
      
      console.log('✅ Resposta do agente IA recebida');
      
      return {
        resposta: output,
        root_id: novoRootId
      };
    }
    
    throw new Error('Resposta inválida do agente IA');

  } catch (error) {
    console.error('❌ Erro ao consultar agente IA:', error.message);
    
    // Fallback mantém root_id se houver
    return {
      resposta: "Olá! Sou o assistente do CAR (Central de Atendimento ao Representante). Como posso ajudá-lo hoje? Para abrir um chamado, digite 'abrir chamado'.",
      root_id: rootId // mantém o root_id existente
    };
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
