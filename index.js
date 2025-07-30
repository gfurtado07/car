require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

/* ═══════════════════════════════════════════════════════════
   1. CONFIGURAÇÕES INICIAIS
═══════════════════════════════════════════════════════════ */

// Google Sheets
let auth;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }
} catch (err) {
  console.error('Erro na autenticação Google:', err);
}
const sheets = google.sheets({ version: 'v4', auth });

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Agente IA Pareto
const PARETO_API_URL = 'https://tess.pareto.io/api';
const PARETO_TOKEN = process.env.PARETO_API_TOKEN;
const PARETO_AGENT_ID = process.env.PARETO_AGENT_ID;

/* ═══════════════════════════════════════════════════════════
   2. CATEGORIAS DOS SETORES
═══════════════════════════════════════════════════════════ */

const categorias = {
  estoque_logistica: {
    nome: 'Estoque/Logística',
    emails: ['logistica@galtecom.com.br', 'estoque@galtecom.com.br', 'financeiro@galtecom.com.br']
  },
  financeiro: {
    nome: 'Financeiro',
    emails: ['contabil@galtecom.com.br', 'contabil.nav@galtecom.com.br', 'financeiro@galtecom.com.br']
  },
  comercial: {
    nome: 'Comercial',
    emails: ['gfurtado@galtecom.com.br', 'financeiro@galtecom.com.br']
  },
  marketing: {
    nome: 'Marketing',
    emails: ['marketing@galtecom.com.br', 'marketing.nav@galtecom.com.br', 'gfurtado@galtecom.com.br']
  },
  diretoria: {
    nome: 'Diretoria',
    emails: ['edson@galtecom.com.br', 'financeiro@galtecom.com.br', 'gfurtado@galtecom.com.br']
  },
  engenharia: {
    nome: 'Engenharia/Desenvolvimento',
    emails: ['engenharia@galtecom.com.br', 'desenvolvimento@galtecom.com.br']
  },
  faturamento: {
    nome: 'Faturamento',
    emails: ['adm@galtecom.com.br', 'financeiro@galtecom.com.br']
  },
  garantia: {
    nome: 'Garantia',
    emails: ['garantia@galtecom.com.br', 'garantia1@galtecom.com.br', 'edson@galtecom.com.br']
  }
};

/* ═══════════════════════════════════════════════════════════
   3. ESTADO, HELPERS E TRANSCRIÇÃO DE ÁUDIO
═══════════════════════════════════════════════════════════ */

const conversasEmAndamento = new Map();
const anexosDoUsuario = new Map();

function gerarProtocolo() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0');
}

function dataHoraBR() {
  return new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo', 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function nomeSolicitante(msg) {
  const { first_name = '', last_name = '', username = '' } = msg.from;
  return (first_name || last_name) ? `${first_name} ${last_name}`.trim() :
         username ? `@${username}` : `User ${msg.from.id}`;
}

/* ───────────────────────────────────────────────────────────
   3.1 TRANSCRIÇÃO DE ÁUDIO (UTILIZANDO GOOGLE CLOUD SPEECH)
──────────────────────────────────────────────────────────── */

async function transcreverAudio(filePath) {
  // Requer a dependência @google-cloud/speech instalada
  const speech = require('@google-cloud/speech');
  const client = new speech.SpeechClient();

  // Lê o arquivo de áudio e converte para base64
  const file = fs.readFileSync(filePath);
  const audioBytes = file.toString('base64');

  // Para mensagens de voz do Telegram (formato OGG_OPUS)
  const audio = { content: audioBytes };
  const config = {
    encoding: 'OGG_OPUS',
    sampleRateHertz: 48000,
    languageCode: 'pt-BR'
  };

  const request = {
    audio: audio,
    config: config
  };

  const [response] = await client.recognize(request);
  const transcription = response.results
    .map(result => result.alternatives[0].transcript)
    .join('\n');
  return transcription;
}

/* ═══════════════════════════════════════════════════════════
   4. COMUNICAÇÃO COM AGENTE IA (PARETO) - CORRIGIDA
═══════════════════════════════════════════════════════════ */

function tentarParsearJSON(texto) {
  try {
    const textoLimpo = texto.trim();
    const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.log('Não foi possível parsear JSON da resposta IA:', error.message);
    return null;
  }
}

async function consultarAgenteIA(mensagemUsuario, contextoConversa = []) {
  try {
    const messages = [
      ...contextoConversa,
      { role: 'user', content: mensagemUsuario }
    ];

    console.log('Enviando para agente IA:', mensagemUsuario);

    const response = await axios.post(
      `${PARETO_API_URL}/agents/${PARETO_AGENT_ID}/execute`,
      {
        messages: messages,
        temperature: 0.7,
        model: "tess-5",
        tools: "no-tools",
        wait_execution: true
      },
      {
        headers: {
          'Authorization': `Bearer ${PARETO_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.responses && response.data.responses[0]) {
      const output = response.data.responses[0].output;
      console.log('Resposta bruta do agente:', output);
      const jsonResponse = tentarParsearJSON(output);
      if (jsonResponse && jsonResponse.resposta_usuario) {
        console.log('JSON parsado com sucesso:', jsonResponse);
        return jsonResponse;
      } else {
        console.log('Usando resposta como texto simples');
        return {
          acao: 'responder',
          resposta_usuario: output,
          categoria: null,
          confianca: 'baixa',
          proxima_acao: 'continuar_conversa',
          informacoes_coletadas: {}
        };
      }
    }
    throw new Error('Resposta inválida do agente');
  } catch (error) {
    console.error('Erro ao consultar agente IA:', error.message);
    return {
      acao: 'erro',
      resposta_usuario: 'Desculpe, estou com dificuldades técnicas no momento. Vou processar sua solicitação manualmente.',
      categoria: null,
      confianca: 'baixa',
      proxima_acao: 'menu_setores',
      informacoes_coletadas: {}
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   5. PLANILHA E E-MAIL (MANTÉM FUNCIONALIDADE ATUAL)
═══════════════════════════════════════════════════════════ */

async function registrarChamado(proto, solicitante, solicitacao, categoria='Aguardando Classificação') {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[proto, dataHoraBR(), solicitante, categoria, solicitacao, '', 'Aberto', '']] }
    });
    console.log(`Chamado registrado: ${proto}`);
    return true;
  } catch (err) {
    console.error('Erro ao registrar chamado:', err);
    return false;
  }
}

async function baixarArquivoTelegram(fileId, nomeOriginal) {
  return new Promise((resolve, reject) => {
    bot.getFileLink(fileId).then(link => {
      const filename = `${Date.now()}_${nomeOriginal}`;
      const dest = '/tmp/' + filename;
      const file = fs.createWriteStream(dest);
      https.get(link, resp => {
        resp.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      }).on('error', err => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).catch(reject);
  });
}

async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos = [], informacoesColetadas = {}) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;
  
  let infoExtra = '';
  if (informacoesColetadas && Object.keys(informacoesColetadas).length > 0) {
    infoExtra = '\n\nInformações coletadas:\n';
    if (informacoesColetadas.produto) infoExtra += `- Produto: ${informacoesColetadas.produto}\n`;
    if (informacoesColetadas.pedido) infoExtra += `- Pedido: ${informacoesColetadas.pedido}\n`;
    if (informacoesColetadas.cnpj) infoExtra += `- CNPJ: ${informacoesColetadas.cnpj}\n`;
    if (informacoesColetadas.urgencia) infoExtra += `- Urgência: ${informacoesColetadas.urgencia}\n`;
    if (informacoesColetadas.detalhes_extras) infoExtra += `- Detalhes: ${informacoesColetadas.detalhes_extras}\n`;
  }
  
  const mail = {
    from: `"CAR KX3" <${process.env.SMTP_USER}>`,
    to: cat.emails.join(', '),
    subject: `Novo chamado – Protocolo ${proto} – ${cat.nome}`,
    text: `Olá equipe ${cat.nome},

Um novo chamado foi aberto na Central de Atendimento ao Representante.

Protocolo: ${proto}
Solicitante: ${solicitante}
Categoria: ${cat.nome}
Solicitação: ${solicitacao}${infoExtra}

Por favor, verifiquem e deem seguimento ao chamado.

Atenciosamente,
CAR – Central de Atendimento ao Representante
KX3 Galtecom`,
    attachments: anexos.map(c => ({ filename: path.basename(c), path: c }))
  };
  
  try {
    await transporter.sendMail(mail);
    anexos.forEach(c => fs.unlink(c, err => { if (err) console.error('Erro ao deletar arquivo:', err); }));
    console.log(`E-mail enviado ao setor: ${cat.nome}`);
    return true;
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   6. PROCESSAMENTO PRINCIPAL COM IA - CORRIGIDO
═══════════════════════════════════════════════════════════ */

async function processarMensagem(chatId, texto, solicitante) {
  const conversa = conversasEmAndamento.get(chatId) || [];
  const anexos = anexosDoUsuario.get(chatId) || [];

  try {
    // Consultar agente IA
    const respostaIA = await consultarAgenteIA(texto, conversa);
    
    console.log('Resposta estruturada da IA:', JSON.stringify(respostaIA, null, 2));
    
    // Atualizar contexto da conversa
    conversa.push({ role: 'user', content: texto });
    conversa.push({ role: 'assistant', content: respostaIA.resposta_usuario });
    conversasEmAndamento.set(chatId, conversa);

    // Enviar somente a resposta amigável para o usuário
    await bot.sendMessage(chatId, respostaIA.resposta_usuario);

    // Processar ação recomendada pelo agente
    if (respostaIA.proxima_acao === 'gerar_protocolo' && respostaIA.categoria) {
      const proto = gerarProtocolo();
      const cat = categorias[respostaIA.categoria];
      
      if (cat) {
        const solicitacaoCompleta = conversa
          .filter(msg => msg.role === 'user')
          .map(msg => msg.content)
          .join(' | ');
        
        await registrarChamado(proto, solicitante, solicitacaoCompleta, cat.nome);
        await enviarEmailAbertura(proto, solicitante, respostaIA.categoria, solicitacaoCompleta, anexos, respostaIA.informacoes_coletadas);
        
        await bot.sendMessage(chatId, 
          `✅ *Chamado criado com sucesso!*\n\n📋 Protocolo: *${proto}*\n🏢 Setor: *${cat.nome}*\n📧 E-mail enviado à equipe responsável.\n\n📱 Guarde este número de protocolo para acompanhar seu chamado.`,
          { parse_mode: 'Markdown' }
        );
        
        // Limpar estado
        conversasEmAndamento.delete(chatId);
        anexosDoUsuario.delete(chatId);
      }
    } else if (respostaIA.proxima_acao === 'menu_setores') {
      mostrarMenuCategorias(chatId);
    }
    // Caso a ação seja "continuar_conversa" ou "pedir_mais_info", apenas aguarda a próxima mensagem.

  } catch (error) {
    console.error('Erro no processamento da mensagem:', error);
    await bot.sendMessage(chatId, '❌ Ops! Ocorreu um erro inesperado. Tente novamente em alguns minutos.');
  }
}

/* ═══════════════════════════════════════════════════════════
   7. HANDLERS TELEGRAM
═══════════════════════════════════════════════════════════ */

// Mensagens de texto
bot.on('text', async msg => {
  const chatId = msg.chat.id;
  const txt = msg.text;
  const solicitante = nomeSolicitante(msg);

  try {
    await processarMensagem(chatId, txt, solicitante);
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    await bot.sendMessage(chatId, '❌ Ops! Ocorreu um erro. Tente novamente em alguns minutos.');
  }
});

// Anexos - Fotos
bot.on('photo', async msg => {
  const chatId = msg.chat.id;
  const sizes = msg.photo;
  const arq = sizes[sizes.length - 1];
  const nome = `foto_${arq.file_unique_id}.jpg`;
  
  try {
    const caminho = await baixarArquivoTelegram(arq.file_id, nome);
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId, `📸 Foto recebida! Agora me conte sobre sua solicitação.`);
  } catch (error) {
    console.error('Erro ao processar foto:', error);
    await bot.sendMessage(chatId, '❌ Não consegui processar sua foto. Tente novamente.');
  }
});

// Anexos - Documentos
bot.on('document', async msg => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  const nome = doc.file_name || `doc_${doc.file_unique_id}`;
  
  try {
    const caminho = await baixarArquivoTelegram(doc.file_id, nome);
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId, `📎 Documento recebido! Agora me conte sobre sua solicitação.`);
  } catch (error) {
    console.error('Erro ao processar documento:', error);
    await bot.sendMessage(chatId, '❌ Não consegui processar seu documento. Tente novamente.');
  }
});

// Anexos - Áudios
bot.on('audio', async msg => {
  const chatId = msg.chat.id;
  const aud = msg.audio;
  const nome = aud.file_name || `audio_${aud.file_unique_id}.mp3`;
  
  try {
    const caminho = await baixarArquivoTelegram(aud.file_id, nome);
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId, `🎵 Áudio recebido! Agora me conte sobre sua solicitação.`);
  } catch (error) {
    console.error('Erro ao processar áudio:', error);
    await bot.sendMessage(chatId, '❌ Não consegui processar seu áudio. Tente novamente.');
  }
});

// Anexos - Vídeos
bot.on('video', async msg => {
  const chatId = msg.chat.id;
  const vid = msg.video;
  const nome = vid.file_name || `video_${vid.file_unique_id}.mp4`;
  
  try {
    const caminho = await baixarArquivoTelegram(vid.file_id, nome);
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId, `🎬 Vídeo recebido! Agora me conte sobre sua solicitação.`);
  } catch (error) {
    console.error('Erro ao processar vídeo:', error);
    await bot.sendMessage(chatId, '❌ Não consegui processar seu vídeo. Tente novamente.');
  }
});

// Novo handler para mensagens de voz (transcrição)
bot.on('voice', async msg => {
  const chatId = msg.chat.id;
  const voice = msg.voice;
  const nome = `voice_${voice.file_unique_id}.ogg`;
  
  try {
    const caminho = await baixarArquivoTelegram(voice.file_id, nome);
    const transcript = await transcreverAudio(caminho);
    await bot.sendMessage(chatId, `📝 Transcrição: ${transcript}`);
  } catch (error) {
    console.error('Erro ao transcrever voz:', error);
    await bot.sendMessage(chatId, '❌ Não consegui transcrever sua mensagem de voz. Tente novamente.');
  }
});

/* ═══════════════════════════════════════════════════════════
   8. MENU MANUAL (FALLBACK)
═══════════════════════════════════════════════════════════ */

function mostrarMenuCategorias(chatId) {
  bot.sendMessage(chatId, '🤖 Para prosseguir, selecione o setor mais adequado para sua solicitação:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Estoque/Logística', callback_data: `manual_estoque_logistica` }],
        [{ text: '💰 Financeiro', callback_data: `manual_financeiro` }],
        [{ text: '🤝 Comercial', callback_data: `manual_comercial` }],
        [{ text: '📢 Marketing', callback_data: `manual_marketing` }],
        [{ text: '👔 Diretoria', callback_data: `manual_diretoria` }],
        [{ text: '🔧 Engenharia', callback_data: `manual_engenharia` }],
        [{ text: '📊 Faturamento', callback_data: `manual_faturamento` }],
        [{ text: '🛡️ Garantia', callback_data: `manual_garantia` }]
      ]
    }
  });
}

// Callback para seleção manual
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  
  if (data.startsWith('manual_')) {
    const categoriaKey = data.replace('manual_', '');
    const cat = categorias[categoriaKey];
    const solicitante = nomeSolicitante(q.message);
    const conversa = conversasEmAndamento.get(chatId) || [];
    const anexos = anexosDoUsuario.get(chatId) || [];
    
    if (cat) {
      const proto = gerarProtocolo();
      const solicitacaoCompleta = conversa
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join(' | ') || 'Seleção manual de categoria';
      
      await registrarChamado(proto, solicitante, solicitacaoCompleta, cat.nome);
      await enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacaoCompleta, anexos);
      
      await bot.editMessageText(
        `✅ *Chamado criado!*\n\n📋 Protocolo: *${proto}*\n🏢 Setor: *${cat.nome}*\n📧 E-mail enviado à equipe responsável.\n\n📱 Guarde este número de protocolo para acompanhar seu chamado.`,
        { chat_id: chatId, message_id: q.message.message_id, parse_mode: 'Markdown' }
      );
      
      // Limpar estado
      conversasEmAndamento.delete(chatId);
      anexosDoUsuario.delete(chatId);
    }
  }
  
  await bot.answerCallbackQuery(q.id);
});

/* ═══════════════════════════════════════════════════════════
   9. INICIALIZAÇÃO
═══════════════════════════════════════════════════════════ */

console.log('🤖 Bot CAR KX3 com IA iniciado!');
console.log('🧠 Agente IA integrado com Pareto');
console.log('✅ Funcionalidades ativas:');
console.log('   • Conversação inteligente com IA');
console.log('   • Classificação automática avançada');
console.log('   • Geração de protocolos únicos');
console.log('   • Registro na planilha Google Sheets');
console.log('   • Envio de e-mails com anexos');
console.log('   • Suporte a fotos, documentos, áudios e vídeos');
console.log('   • Transcrição de mensagens de voz');
console.log('   • Tratamento inteligente de respostas IA');
console.log('📞 Aguardando mensagens...');