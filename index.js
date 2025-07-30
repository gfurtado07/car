require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');

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

// Função para registrar chamado na planilha
async function registrarChamado(protocolo, solicitante, solicitacao) {
  try {
    const valores = [
      [
        protocolo,                    // Protocolo
        formatarDataHora(),          // Data Abertura
        solicitante,                 // Solicitante
        'Aguardando Classificação',  // Categoria (será atualizada depois)
        solicitacao,                 // Solicitação
        '',                          // Resposta (vazia inicialmente)
        'Aberto',                    // Status
        ''                           // Data Finalização (vazia inicialmente)
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

// Manipulador de mensagens
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text || '<arquivo anexado>';
  const solicitante = obterNomeSolicitante(msg);

  try {
    // Gerar protocolo único
    const protocolo = gerarProtocolo();
    
    // Confirmar recebimento
    await bot.sendMessage(chatId, `🎫 *Protocolo gerado: ${protocolo}*\n\nOlá ${solicitante}!\n\nRecebi sua solicitação e já abri um chamado para você.\n\n📝 *Sua mensagem:* "${texto}"\n\n⏳ Em breve nossa equipe entrará em contato para dar andamento ao seu chamado.`, {
      parse_mode: 'Markdown'
    });

    // Registrar na planilha
    const sucesso = await registrarChamado(protocolo, solicitante, texto);
    
    if (sucesso) {
      await bot.sendMessage(chatId, `✅ Chamado registrado com sucesso!\n\n📋 Protocolo: *${protocolo}*\n📅 Data: ${formatarDataHora()}\n👤 Solicitante: ${solicitante}\n\nMantenha este número de protocolo para acompanhar seu chamado.`, {
        parse_mode: 'Markdown'
      });
    } else {
      await bot.sendMessage(chatId, `❌ Houve um problema ao registrar seu chamado. Por favor, tente novamente ou entre em contato com o suporte.`);
    }

  } catch (error) {
    console.error('Erro no processamento da mensagem:', error);
    await bot.sendMessage(chatId, `❌ Ops! Ocorreu um erro inesperado. Tente novamente em alguns minutos.`);
  }
});

console.log('🤖 Bot CAR KX3 iniciado... Aguardando mensagens...');
