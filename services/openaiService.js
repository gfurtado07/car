const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({
  apiKey: config.openaiApiKey
});

// Armazenamento em memória das conversas (será substituído pelo banco depois)
const conversas = new Map();

/**
 * Prompts do sistema para diferentes contextos
 */
const SYSTEM_PROMPTS = {
  atendimento: `Você é o assistente CAR (Central de Atendimento ao Representante) da KX3 Galtecom.

SUAS RESPONSABILIDADES:
- Atender representantes e clientes com excelência
- Ajudar na abertura de chamados técnicos
- Fornecer informações sobre produtos e serviços
- Coletar dados necessários para atendimento
- Encaminhar para departamentos específicos

DEPARTAMENTOS DISPONÍVEIS:
- Técnico: Problemas com equipamentos, configurações
- Comercial: Vendas, orçamentos, contratos
- Financeiro: Cobranças, pagamentos, faturas
- Suporte: Dúvidas gerais, treinamentos

FLUXO DE ABERTURA DE CHAMADO:
1. Colete: Nome completo, empresa, telefone, e-mail
2. Identifique o departamento adequado
3. Descreva detalhadamente o problema/solicitação
4. Defina prioridade (baixa, média, alta, urgente)
5. Gere um protocolo único

INSTRUÇÕES:
- Seja sempre cordial e profissional
- Faça perguntas claras e objetivas
- Mantenha o foco na resolução
- Confirme informações importantes
- Responda sempre em português brasileiro

Quando for abrir um chamado, use este formato JSON na resposta:
{
  "tipo": "abertura_chamado",
  "dados": {
    "nome": "Nome do cliente",
    "empresa": "Nome da empresa", 
    "telefone": "Telefone",
    "email": "Email",
    "departamento": "técnico|comercial|financeiro|suporte",
    "assunto": "Resumo do problema",
    "descricao": "Descrição detalhada",
    "prioridade": "baixa|média|alta|urgente"
  },
  "resposta_usuario": "Mensagem para o usuário"
}`
};

/**
 * Processa conversa com OpenAI mantendo histórico
 */
async function conversar(mensagemUsuario, telegramId, contextoExtra = {}) {
  try {
    // Recupera ou cria histórico da conversa
    let historicoConversa = conversas.get(telegramId) || [];
    
    // Adiciona mensagem do usuário ao histórico
    historicoConversa.push({
      role: 'user',
      content: mensagemUsuario
    });

    // Monta mensagens para a API
    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPTS.atendimento
      },
      ...historicoConversa
    ];

    console.log('🤖 Enviando para OpenAI:', mensagemUsuario);
    console.log('📚 Histórico tem', historicoConversa.length, 'mensagens');

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const resposta = completion.choices[0].message.content;

    // Adiciona resposta do assistente ao histórico
    historicoConversa.push({
      role: 'assistant',
      content: resposta
    });

    // Limita histórico a últimas 20 mensagens para não estourar tokens
    if (historicoConversa.length > 20) {
      historicoConversa = historicoConversa.slice(-20);
    }

    // Salva histórico atualizado
    conversas.set(telegramId, historicoConversa);

    console.log('✅ Resposta OpenAI recebida');

    return {
      resposta: resposta,
      tokens_usados: completion.usage.total_tokens,
      modelo: completion.model
    };

  } catch (error) {
    console.error('❌ Erro na OpenAI:', error.message);
    
    // Fallback para erro
    return {
      resposta: "Olá! Sou o assistente CAR da KX3 Galtecom. Como posso ajudá-lo hoje? Para abrir um chamado, digite 'abrir chamado'.",
      erro: true
    };
  }
}

/**
 * Limpa histórico de conversa de um usuário
 */
function limparHistorico(telegramId) {
  conversas.delete(telegramId);
  console.log(`🗑️ Histórico limpo para usuário ${telegramId}`);
}

/**
 * Tenta parsear JSON da resposta
 */
function tentarParsearJSON(texto) {
  try {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  conversar,
  limparHistorico,
  tentarParsearJSON
};
