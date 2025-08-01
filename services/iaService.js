const axios = require('axios');
const config = require('../config');

/**
 * Envia mensagem para o agente conversacional Pareto com root_id numérico
 */
async function converse(mensagemUsuario, rootId = null, contextoConversa = []) {
  try {
    const messages = [
      ...contextoConversa,
      { role: 'user', content: mensagemUsuario }
    ];

    console.log('🤖 Enviando para agente IA:', mensagemUsuario);

    // Monta payload base
    const payload = {
      temperature: 1,
      model: "tess-5",
      messages: messages,
      tools: "no-tools",
      wait_execution: true // IMPORTANTE: mudando para true para aguardar resposta completa
    };

    // Adiciona root_id apenas se for um número válido
    if (rootId !== null && rootId !== undefined && !isNaN(Number(rootId))) {
      payload.root_id = Number(rootId);
      console.log('🧠 Enviando root_id:', payload.root_id);
    } else {
      console.log('🆕 Primeira conversa - sem root_id');
    }

    console.log('📤 Payload enviado:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${config.paretoApiUrl}/agents/${config.paretoAgentId}/execute`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${config.paretoToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000 // Aumentando timeout para 45s
      }
    );

    console.log('📥 Resposta completa da API:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.responses && response.data.responses[0]) {
      const output = response.data.responses[0].output;
      
      // Extrai root_id da resposta se disponível
      let novoRootId = null;
      if (response.data.root_id && !isNaN(Number(response.data.root_id))) {
        novoRootId = Number(response.data.root_id);
        console.log('🆔 Novo root_id recebido:', novoRootId);
      }
      
      console.log('✅ Resposta do agente IA recebida');
      
      return {
        resposta: output || 'Desculpe, não consegui gerar uma resposta.',
        root_id: novoRootId
      };
    }
    
    throw new Error('Resposta inválida do agente IA');

  } catch (error) {
    console.error('❌ Erro ao consultar agente IA:', error.message);
    console.error('❌ Detalhes do erro:', error.response?.data || error);
    
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

