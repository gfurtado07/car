require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const { Client } = require('pg');

// NOVAS DEPENDÊNCIAS PARA ÁUDIO
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { v4: uuidv4 } = require('uuid');
const { SpeechClient } = require('@google-cloud/speech');

// Configura o caminho do ffmpeg (importante para Render)
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/* ═══════════════════════════════════════════════════════════
   1. CONFIGURAÇÕES INICIAIS
═══════════════════════════════════════════════════════════ */

// PostgreSQL Database
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Conecta ao banco de dados
async function inicializarBancoDados() {
  try {
    await dbClient.connect();
    console.log('✅ Conectado ao banco de dados PostgreSQL');
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        telegram_id BIGINT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela de usuários verificada/criada');
  } catch (err) {
    console.error('❌ Erro ao conectar com o banco de dados:', err);
  }
}

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
   2. CATEGORIAS DOS SETORES - TEMPORÁRIO PARA TESTES
═══════════════════════════════════════════════════════════ */

const categorias = {
  estoque_logistica: {
    nome: 'Estoque/Logística',
    emails: ['gfurtado@galtecom.com.br']
  },
  financeiro: {
    nome: 'Financeiro',
    emails: ['gfurtado@galtecom.com.br']
  },
  comercial: {
    nome: 'Comercial',
    emails: ['gfurtado@galtecom.com.br']
  },
  marketing: {
    nome: 'Marketing',
    emails: ['gfurtado@galtecom.com.br']
  },
  diretoria: {
    nome: 'Diretoria',
    emails: ['gfurtado@galtecom.com.br']
  },
  engenharia: {
    nome: 'Engenharia/Desenvolvimento',
    emails: ['gfurtado@galtecom.com.br']
  },
  faturamento: {
    nome: 'Faturamento',
    emails: ['gfurtado@galtecom.com.br']
  },
  garantia: {
    nome: 'Garantia',
    emails: ['gfurtado@galtecom.com.br']
  }
};

/* ═══════════════════════════════════════════════════════════
   3. ESTADO, HELPERS, E TRANSCRIÇÃO DE ÁUDIO
═══════════════════════════════════════════════════════════ */

const conversasEmAndamento = new Map();
const anexosDoUsuario = new Map();
const protocolosRegistrados = new Map();
const aguardandoEmail = new Map();

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

function validarEmail(email) {
  const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return re.test(email);
}

/* ───────────────────────────────────────────────────────────
   3.1 FUNÇÕES DO BANCO DE DADOS
──────────────────────────────────────────────────────────── */

async function buscarUsuario(telegramId) {
  try {
    const result = await dbClient.query(
      'SELECT * FROM usuarios WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    return null;
  }
}

async function salvarUsuario(telegramId, nome, email = null) {
  try {
    const result = await dbClient.query(
      `INSERT INTO usuarios (telegram_id, nome, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id)
       DO UPDATE SET nome=$2, email=$3, data_atualizacao=CURRENT_TIMESTAMP
       RETURNING *`,
      [telegramId, nome, email]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Erro ao salvar usuário:', err);
    return null;
  }
}

async function atualizarEmailUsuario(telegramId, email) {
  try {
    const result = await dbClient.query(
      'UPDATE usuarios SET email=$1, data_atualizacao=CURRENT_TIMESTAMP WHERE telegram_id=$2 RETURNING *',
      [email, telegramId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erro ao atualizar e-mail do usuário:', err);
    return null;
  }
}

/* ───────────────────────────────────────────────────────────
   3.2 REMOVER FUNÇÃO ANTIGA transcreverAudio
──────────────────────────────────────────────────────────── */

/* ───────────────────────────────────────────────────────────
   3.3 FUNÇÃO PARA TRANSCRIÇÃO VIA Google Cloud Speech
──────────────────────────────────────────────────────────── */

async function transcreverComGoogle(wavFilePath) {
  const client = new SpeechClient();
  const fileBytes = fs.readFileSync(wavFilePath);
  const audioBytes = fileBytes.toString('base64');

  const [response] = await client.recognize({
    audio: { content: audioBytes },
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'pt-BR'
    }
  });

  const transcription = response.results
    .map(r => r.alternatives[0].transcript)
    .join('\n');
  return transcription;
}

/* ────────────────────────────────────────────────
   3.4 BAIXAR ARQUIVO DO TELEGRAM
───────────────────────────────────────────────── */

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

/* ═══════════════════════════════════════════════════════════
   4. Demais funções (IA, planilha, email, processamento)
   ... (mantém todo o seu código existente na seção 4, 5, 6)
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   7. HANDLERS TELEGRAM – ATUALIZADOS
═══════════════════════════════════════════════════════════ */

// Handler para mensagens de voz (transcrição e processamento automático)
bot.on('voice', async msg => {
  const chatId = msg.chat.id;
  const voice = msg.voice;
  const nome = `voice_${voice.file_unique_id}.ogg`;
  const telegramId = msg.from.id;
  const solicitante = nomeSolicitante(msg);

  try {
    // 1) Baixa o OGG do Telegram
    const oggPath = await baixarArquivoTelegram(voice.file_id, nome);

    // 2) Converte OGG → WAV
    const wavPath = `/tmp/${uuidv4()}.wav`;
    await new Promise((resolve, reject) => {
      ffmpeg(oggPath)
        .toFormat('wav')
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .save(wavPath)
        .on('end', resolve)
        .on('error', reject);
    });

    await bot.sendMessage(chatId, '🎤 Processando seu áudio...');

    // 3) Transcreve com Google
    const transcript = await transcreverComGoogle(wavPath);

    // 4) Limpa arquivos temporários
    fs.unlinkSync(oggPath);
    fs.unlinkSync(wavPath);

    if (transcript && transcript.trim()) {
      await bot.sendMessage(chatId, `📝 *Transcrição:* ${transcript}`, { parse_mode: 'Markdown' });
      // Chama seu processamento normal de mensagem
      await processarMensagem(chatId, transcript, solicitante, telegramId);
    } else {
      await bot.sendMessage(chatId,
        '❌ Não consegui transcrever seu áudio. Por favor, fale mais claramente ou digite sua mensagem.');
    }
  } catch (error) {
    console.error('Erro ao transcrever voz:', error);
    await bot.sendMessage(chatId,
      '❌ Não consegui transcrever sua mensagem de voz. Por favor, tente novamente ou digite sua mensagem.');
  }
});

// Mantenha os demais handlers (text, photo, document, audio, video, callback_query) inalterados

/* ═══════════════════════════════════════════════════════════
   8. MONITOR DE EMAILS
   9. INICIALIZAÇÃO (iniciarBot)
═══════════════════════════════════════════════════════════ */

async function iniciarBot() {
  await inicializarBancoDados();
  startEmailMonitor();
  console.log('🤖 Bot CAR KX3 com IA iniciado!');
}

iniciarBot();

