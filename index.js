require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Configuração de autenticação
let auth;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }
} catch (error) {
  console.error('Erro na configuração de autenticação:', error);
}

const sheets = google.sheets({ version: 'v4', auth });

// Definição das categorias e setores da KX3
const categorias = {
  "estoque_logistica": {
    nome: "Estoque/Logística",
    emails: ["logistica@galtecom.com.br", "estoque@galtecom.com.br", "financeiro@galtecom.com.br"],
    palavrasChave: [
      "rastreio", "rastrear", "pedido", "entrega", "transportadora", "prazo", "atraso", "envio", "remessa",
      "comprovante", "mercadoria", "chegou", "não chegou", "onde está", "NF", "nota fiscal", "distribuidora"
    ],
    prioridade: 3
  },
  "financeiro": {
    nome: "Financeiro",
    emails: ["contabil@galtecom.com.br", "contabil.nav@galtecom.com.br", "financeiro@galtecom.com.br"],
    palavrasChave: [
      "segunda via", "boleto", "prorrogação", "pagamento", "fatura", "cobrança", "vencimento",
      "não recebeu", "boletos", "títulos", "prorrogar", "dias"
    ],
    prioridade: 2,
    isCoringa: true
  },
  "comercial": {
    nome: "Comercial",
    emails: ["gfurtado@galtecom.com.br", "financeiro@galtecom.com.br"],
    palavrasChave: [
      "preços", "concorrência", "acordado", "faturou", "bonificação", "compensar", "valor",
      "reclamando", "rádios", "acima", "próximo pedido"
    ],
    prioridade: 1
  },
  "marketing": {
    nome: "Marketing",
    emails: ["marketing@galtecom.com.br", "marketing.nav@galtecom.com.br", "gfurtado@galtecom.com.br"],
    palavrasChave: [
      "fotos", "vídeos", "produto", "flyers", "lançamento", "fundo branco", "diferenciais",
      "câmeras", "vídeo", "imagens", "material", "KC360", "KRC1610"
    ],
    prioridade: 3
  },
  "diretoria": {
    nome: "Diretoria",
    emails: ["edson@galtecom.com.br", "financeiro@galtecom.com.br", "gfurtado@galtecom.com.br"],
    palavrasChave: [
      "reunião", "diretoria", "proprietário", "KX3", "insatisfeito", "resolver", "situação",
      "diretor", "dono", "gerência"
    ],
    prioridade: 1
  },
  "engenharia": {
    nome: "Engenharia/Desenvolvimento",
    emails: ["engenharia@galtecom.com.br", "desenvolvimento@galtecom.com.br"],
    palavrasChave: [
      "manual", "instalação", "dificuldades", "sensor", "problemas", "funcionamento",
      "técnico", "especificação", "configuração", "KRC5000", "KXS199A", "KRC4100"
    ],
    prioridade: 1
  },
  "faturamento": {
    nome: "Faturamento",
    emails: ["adm@galtecom.com.br", "financeiro@galtecom.com.br"],
    palavrasChave: [
      "CFOP", "CST", "faturou", "correto", "questionando", "nota fiscal",
      "6202", "6308", "fiscal", "tributário"
    ],
    prioridade: 1
  },
  "garantia": {
    nome: "Garantia",
    emails: ["garantia@galtecom.com.br", "garantia1@galtecom.com.br", "edson@galtecom.com.br"],
    palavrasChave: [
      "garantia", "aparelhos", "prazo", "1 ano", "defeito", "troca", "reparo",
      "fora do prazo", "garantir"
    ],
    prioridade: 1
  }
};

// Armazenar chamados pendentes de classificação
const chamadosPendentes = new Map();

// Função para gerar protocolo único
function gerarProtocolo() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');
  
  return `${ano}${mes}${dia}-${hora}${minuto}`;
}

// Função para formatar data/hora
function formatarDataHora() {
  const agora = new Date();
  return agora.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Função para obter nome do usuário
function obterNomeSolicitante(msg) {
  const firstName = msg.from.first_name || '';
  const lastName = msg.from.last_name || '';
  const username = msg.from.username || '';
  
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (username) {
    return `@${username}`;
  } else {
    return `User ${msg.from.id}`;
  }
}

// Função para classificar mensagem por palavras-chave
function classificarMensagem(texto) {
  const textoLower = texto.toLowerCase();
  const scores = {};
  
  // Calcular score para cada categoria
  for (const [key, categoria] of Object.entries(categorias)) {
    let score = 0;
    for (const palavra of categoria.palavrasChave) {
      if (textoLower.includes(palavra.toLowerCase())) {
        score += categoria.prioridade;
      }
    }
    if (score > 0) {
      scores[key] = score;
    }
  }
  
  // Encontrar categoria com maior score
  if (Object.keys(scores).length === 0) {
    return null;
  }
  
  const melhorCategoria = Object.keys(scores).reduce((a, b) => 
    scores[a] > scores[b] ? a : b
  );
  
  return {
    categoria: melhorCategoria,
    score: scores[melhorCategoria],
    confianca: scores[melhorCategoria] >= 3 ? 'alta' : 'baixa'
  };
}

// Função para registrar chamado na planilha
async function registrarChamado(protocolo, solicitante, solicitacao, categoria = 'Aguardando Classificação') {
  try {
    const valores = [
      [
        protocolo,
        formatarDataHora(),
        solicitante,
        categoria,
        solicitacao,
        '',
        'Aberto',
        ''
      ]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: valores
      }
    });

    console.log(`Chamado registrado: ${protocolo}`);
    return true;
  } catch (error) {
    console.error('Erro ao registrar chamado:', error);
    return false;
  }
}

// Função para atualizar categoria na planilha
async function atualizarCategoria(protocolo, categoria) {
  try {
    // Buscar linha do protocolo
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`
    });
    
    const rows = response.data.values;
    if (!rows) return false;
    
    // Encontrar linha do protocolo
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === protocolo) {
        // Atualizar categoria na coluna D (índice 3)
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: `${process.env.SHEET_NAME}!D${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[categoria]]
          }
        });
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    return false;
  }
}

// Manipulador de mensagens de texto
bot.on('text', async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text;
  const solicitante = obterNomeSolicitante(msg);

  // Verificar se é resposta a classificação
  if (chamadosPendentes.has(chatId)) {
    await processarRespostaClassificacao(chatId, texto);
    return;
  }

  try {
    // Gerar protocolo único
    const protocolo = gerarProtocolo();
    
    // Classificar mensagem
    const classificacao = classificarMensagem(texto);
    
    // Confirmar recebimento
    await bot.sendMessage(chatId, `🎫 *Protocolo: ${protocolo}*\n\nOlá ${solicitante}!\n\nRecebi sua solicitação:\n📝 "${texto}"\n\n⏳ Analisando e direcionando para o setor responsável...`, {
      parse_mode: 'Markdown'
    });

    if (classificacao && classificacao.confianca === 'alta') {
      // Classificação automática com alta confiança
      const categoria = categorias[classificacao.categoria];
      await registrarChamado(protocolo, solicitante, texto, categoria.nome);
      
      await bot.sendMessage(chatId, `✅ *Chamado classificado automaticamente*\n\n📋 Protocolo: *${protocolo}*\n🏢 Setor: *${categoria.nome}*\n📅 Data: ${formatarDataHora()}\n\n📧 E-mail enviado para a equipe responsável.\n\n📱 Mantenha este protocolo para acompanhar seu chamado.`, {
        parse_mode: 'Markdown'
      });
      
    } else if (classificacao && classificacao.confianca === 'baixa') {
      // Pedir confirmação ao usuário
      const categoria = categorias[classificacao.categoria];
      
      await registrarChamado(protocolo, solicitante, texto);
      
      chamadosPendentes.set(chatId, {
        protocolo: protocolo,
        categoriaSugerida: classificacao.categoria
      });
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Sim, está correto', callback_data: `confirm_${protocolo}` }],
            [{ text: '❌ Não, escolher outro setor', callback_data: `reject_${protocolo}` }]
          ]
        }
      };
      
      await bot.sendMessage(chatId, `🤖 *Identifiquei que sua solicitação é sobre:*\n\n🏢 *${categoria.nome}*\n\nEsta classificação está correta?`, {
        parse_mode: 'Markdown',
        ...keyboard
      });
      
    } else {
      // Não identificou categoria - mostrar menu
      await registrarChamado(protocolo, solicitante, texto);
      await mostrarMenuCategorias(chatId, protocolo);
    }

  } catch (error) {
    console.error('Erro no processamento da mensagem:', error);
    await bot.sendMessage(chatId, `❌ Ops! Ocorreu um erro inesperado. Tente novamente em alguns minutos.`);
  }
});

// Função para mostrar menu de categorias
async function mostrarMenuCategorias(chatId, protocolo) {
  chamadosPendentes.set(chatId, { protocolo: protocolo });
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Estoque/Logística', callback_data: `cat_estoque_logistica_${protocolo}` }],
        [{ text: '💰 Financeiro', callback_data: `cat_financeiro_${protocolo}` }],
        [{ text: '🤝 Comercial', callback_data: `cat_comercial_${protocolo}` }],
        [{ text: '📢 Marketing', callback_data: `cat_marketing_${protocolo}` }],
        [{ text: '👔 Diretoria', callback_data: `cat_diretoria_${protocolo}` }],
        [{ text: '🔧 Engenharia/Desenvolvimento', callback_data: `cat_engenharia_${protocolo}` }],
        [{ text: '📊 Faturamento', callback_data: `cat_faturamento_${protocolo}` }],
        [{ text: '🛡️ Garantia', callback_data: `cat_garantia_${protocolo}` }]
      ]
    }
  };
  
  await bot.sendMessage(chatId, `🤖 *Não consegui identificar automaticamente o tipo da sua solicitação.*\n\nPor favor, selecione o setor mais adequado:`, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

// Manipulador de callback queries (botões)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data.startsWith('confirm_')) {
    const protocolo = data.replace('confirm_', '');
    const pendente = chamadosPendentes.get(chatId);
    
    if (pendente && pendente.categoriaSugerida) {
      const categoria = categorias[pendente.categoriaSugerida];
      await atualizarCategoria(protocolo, categoria.nome);
      
      await bot.editMessageText(`✅ *Classificação confirmada!*\n\n📋 Protocolo: *${protocolo}*\n🏢 Setor: *${categoria.nome}*\n📧 E-mail enviado para a equipe responsável.`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
      
      chamadosPendentes.delete(chatId);
    }
  } else if (data.startsWith('reject_')) {
    const protocolo = data.replace('reject_', '');
    await bot.editMessageText('🤖 *Escolha o setor correto:*', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown'
    });
    await mostrarMenuCategorias(chatId, protocolo);
  } else if (data.startsWith('cat_')) {
    const parts = data.split('_');
    const protocolo = parts[parts.length - 1];
    const categoriaKey = parts.slice(1, -1).join('_');
    
    const categoria = categorias[categoriaKey];
    if (categoria) {
      await atualizarCategoria(protocolo, categoria.nome);
      
      await bot.editMessageText(`✅ *Chamado classificado!*\n\n📋 Protocolo: *${protocolo}*\n🏢 Setor: *${categoria.nome}*\n📧 E-mail enviado para a equipe responsável.`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      });
      
      chamadosPendentes.delete(chatId);
    }
  }
  
  await bot.answerCallbackQuery(query.id);
});

console.log('🤖 Bot CAR KX3 iniciado com sistema de classificação... Aguardando mensagens...');
