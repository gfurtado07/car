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

// Configura o SpeechClient com credenciais da variável de ambiente
const speechClient = new SpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
});

/* ═══════════════════════════════════════════════════════════════════════
   1. CONFIGURAÇÕES INICIAIS
═══════════════════════════════════════════════════════════════════════ */

// PostgreSQL Database
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Conecta ao banco de dados
async function inicializarBancoDados() {
  try {
    await dbClient.connect();
    console.log('✅ Conectado ao banco de dados PostgreSQL');

    // Cria a tabela de usuários se não existir
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

// SMTP - CORREÇÃO AQUI: createTransport (sem "er")
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
const PARETO_REVIEW_AGENT_ID = process.env.PARETO_REVIEW_AGENT_ID;

/* ═══════════════════════════════════════════════════════════════════════
   2. CATEGORIAS DOS SETORES - TEMPORÁRIO PARA TESTES
═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
   3. ESTADO, HELPERS, E TRANSCRIÇÃO DE ÁUDIO
═══════════════════════════════════════════════════════════════════════ */

const conversasEmAndamento = new Map();
const anexosDoUsuario = new Map();
const protocolosRegistrados = new Map(); // Armazena o protocolo associado a cada chat
const aguardandoEmail = new Map(); // Para controle de fluxo de cadastro de e-mail
const departamentosSelecionados = new Map(); // Para armazenar departamento selecionado temporariamente
const aguardandoRevisao = new Map(); // Para controle do fluxo de revisão de chamados

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
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/* ═══════════════════════════════════════════════════════════════════════
   3.1 FUNÇÕES DO BANCO DE DADOS
══════════════════════════════════════════════════════════════════════ */

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
       DO UPDATE SET nome = $2, email = $3, data_atualizacao = CURRENT_TIMESTAMP
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
      'UPDATE usuarios SET email = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE telegram_id = $2 RETURNING *',
      [email, telegramId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erro ao atualizar e-mail do usuário:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   3.2 TRANSCRIÇÃO DE ÁUDIO (GOOGLE CLOUD SPEECH) - CORRIGIDA
══════════════════════════════════════════════════════════════════════ */

async function transcreverComGoogle(wavFilePath) {
  try {
    const fileBytes = fs.readFileSync(wavFilePath);
    const audioBytes = fileBytes.toString('base64');

    const [response] = await speechClient.recognize({
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
  } catch (error) {
    console.error('Erro na transcrição de áudio:', error);
    throw error;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   3.3 PROCESSAMENTO DE ANEXOS DE E-MAIL
══════════════════════════════════════════════════════════════════════ */

async function processarAnexosEmail(attachments, chatId) {
  const anexosProcessados = [];

  if (!attachments || attachments.length === 0) {
    return anexosProcessados;
  }

  for (const attachment of attachments) {
    try {
      const filename = attachment.filename || `anexo_${Date.now()}`;
      const filepath = `/tmp/${filename}`;

      // Salva o anexo temporariamente
      fs.writeFileSync(filepath, attachment.content);

      // Detecta o tipo do arquivo e envia apropriadamente
      const mimeType = attachment.contentType || '';
      const isImage = mimeType.startsWith('image/');
      const isDocument = !isImage;

      if (isImage) {
        // Envia como foto
        await bot.sendPhoto(chatId, filepath, {
          caption: `📎 Anexo: ${filename}`
        });
      } else {
        // Envia como documento
        await bot.sendDocument(chatId, filepath, {
          caption: `📎 Anexo: ${filename}`
        });
      }

      console.log(`📎 Anexo enviado para o usuário: ${filename}`);
      anexosProcessados.push(filename);

      // Remove o arquivo temporário
      fs.unlinkSync(filepath);

    } catch (error) {
      console.error('Erro ao processar anexo:', error);
    }
  }

  return anexosProcessados;
}

/* ═══════════════════════════════════════════════════════════════════════
   4. COMUNICAÇÃO COM AGENTE IA (PARETO) – CORRIGIDA
═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
   4.1 NOVA FUNÇÃO PARA CONSULTAR AGENTE REVISOR
═══════════════════════════════════════════════════════════════════════ */

async function consultarAgenteRevisor(dadosChamado) {
  try {
    const prompt = `Departamento selecionado: ${dadosChamado.departamento}
Descrição: ${dadosChamado.descricao}
Anexos disponíveis: ${dadosChamado.anexos || 'Nenhum'}
Informações extras: ${JSON.stringify(dadosChamado.extras || {})}`;

    console.log('Enviando para agente revisor:', prompt);

    const response = await axios.post(
      `${PARETO_API_URL}/agents/${PARETO_REVIEW_AGENT_ID}/execute`,
      {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
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
      console.log('Resposta bruta do agente revisor:', output);
      const jsonResponse = tentarParsearJSON(output);
      if (jsonResponse && jsonResponse.acao === 'revisar_chamado') {
        console.log('JSON do revisor parsado com sucesso:', jsonResponse);
        return jsonResponse;
      }
    }
    throw new Error('Resposta inválida do agente revisor');
  } catch (error) {
    console.error('Erro ao consultar agente revisor:', error.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   5. PLANILHA E E-MAIL (FUNCIONALIDADE ATUAL)
═══════════════════════════════════════════════════════════════════════ */

// --- Função auxiliar para carregar e-mails de um departamento na planilha ---
async function buscarEmailsDepartamento(nomeDepartamento) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `DEPARTAMENTOS!A:B`,    // nome fixo da aba
    });
    const linhas = res.data.values || [];
    const linha = linhas.find(r => r[0] === nomeDepartamento);
    if (linha && linha[1]) {
      // caso tenha vários e-mails num mesmo campo, separados por vírgula
      return linha[1].split(',').map(e => e.trim());
    }
    console.warn(`Departamento "${nomeDepartamento}" não encontrado em DEPARTAMENTOS.`);
    return [];
  } catch (err) {
    console.error('Erro ao buscar emails do departamento:', err);
    return [];
  }
}

// --- Função para listar todos os departamentos da aba DEPARTAMENTOS ---
async function listarDepartamentos() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'DEPARTAMENTOS!A:A'
    });
    const linhas = res.data.values || [];
    // retorna array com nomes, filtrando valores vazios
    return linhas.map(r => r[0]).filter(Boolean);
  } catch (err) {
    console.error('Erro ao listar departamentos:', err);
    return [];
  }
}

// --- Função para solicitar seleção de departamento ---
async function solicitarDepartamento(chatId) {
  const departamentos = await listarDepartamentos();
  if (departamentos.length === 0) {
    await bot.sendMessage(chatId, '❌ Nenhum departamento configurado para seleção.');
    return;
  }

  // Cria botões inline para cada departamento
  const inlineKeyboard = departamentos.map(dept => [{ text: dept, callback_data: `selecionar_depto_${dept}` }]);

  await bot.sendMessage(chatId, '🏢 Por favor, selecione o departamento para qual deseja abrir o chamado:', {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
}

async function registrarChamado(proto, solicitante, solicitacao, categoria = 'Aguardando Classificação') {
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

async function atualizarStatusChamado(proto, novoStatus = "Finalizado") {
  try {
    // Busca todas as linhas para achar a linha do protocolo
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
    });

    const linhas = res.data.values || [];

    // Encontrar o índice da linha (começando do 0)
    const linhaIndex = linhas.findIndex(row => row[0] === proto);
    if (linhaIndex === -1) {
      console.warn(`Protocolo ${proto} não encontrado na planilha.`);
      return false;
    }

    // A coluna do status (coluna G) é a 7ª (index 6, 0-based)
    const colunaStatus = 6;

    // Atualiza a célula do status
    const rangeAtualizar = `${process.env.SHEET_NAME}!${String.fromCharCode(65 + colunaStatus)}${linhaIndex + 1}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: rangeAtualizar,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[novoStatus]] }
    });

    console.log(`Status do protocolo ${proto} atualizado para "${novoStatus}"`);
    return true;

  } catch (err) {
    console.error('Erro ao atualizar status na planilha:', err);
    return false;
  }
}

async function atualizarRespostaChamado(proto, resposta) {
  try {
    // Busca todas as linhas para achar a linha do protocolo
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
    });

    const linhas = res.data.values || [];

    // Encontrar o índice da linha (começando do 0)
    const linhaIndex = linhas.findIndex(row => row[0] === proto);
    if (linhaIndex === -1) {
      console.warn(`Protocolo ${proto} não encontrado na planilha.`);
      return false;
    }

    // A coluna da resposta (coluna F) é a 6ª (index 5, 0-based)
    const colunaResposta = 5;

    // Pega a resposta atual para concatenar com a nova
    const respostaAtual = linhas[linhaIndex][colunaResposta] || '';
    const novaResposta = respostaAtual ? 
      `${respostaAtual}

--- ${dataHoraBR()} ---
${resposta}` : 
      `${dataHoraBR()}: ${resposta}`;

    // Atualiza a célula da resposta
    const rangeAtualizar = `${process.env.SHEET_NAME}!${String.fromCharCode(65 + colunaResposta)}${linhaIndex + 1}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: rangeAtualizar,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[novaResposta]] }
    });

    console.log(`Resposta do protocolo ${proto} atualizada na planilha`);
    return true;

  } catch (err) {
    console.error('Erro ao atualizar resposta na planilha:', err);
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

async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos = [], informacoesColetadas = {}, emailSolicitante = null) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;

  // carrega e-mails dinâmicos
  const deptEmails = await buscarEmailsDepartamento(cat.nome);
  const toEmails = deptEmails.length ? deptEmails : cat.emails;

  let infoExtra = '';
  if (informacoesColetadas && Object.keys(informacoesColetadas).length > 0) {
    infoExtra = '\n\nInformações coletadas:\n';
    if (informacoesColetadas.produto) infoExtra += `- Produto: ${informacoesColetadas.produto}\n`;
    if (informacoesColetadas.pedido) infoExtra += `- Pedido: ${informacoesColetadas.pedido}\n`;
    if (informacoesColetadas.cnpj) infoExtra += `- CNPJ: ${informacoesColetadas.cnpj}\n`;
    if (informacoesColetadas.urgencia) infoExtra += `- Urgência: ${informacoesColetadas.urgencia}\n`;
    if (informacoesColetadas.detalhes_extras) infoExtra += `- Detalhes: ${informacoesColetadas.detalhes_extras}\n`;
  }

  let anexoInfo = '';
  if (anexos.length > 0) {
    anexoInfo = `\n\nAnexos enviados: ${anexos.length} arquivo(s)`;
  }

  const mail = {
    from: `"CAR KX3" <${process.env.SMTP_USER}>`,
    to: toEmails.join(', '),
    cc: emailSolicitante || '', // Copia o solicitante
    subject: `Novo chamado – Protocolo ${proto} – ${cat.nome}`,
    text: `Olá equipe ${cat.nome},

Um novo chamado foi aberto na Central de Atendimento ao Representante.

Protocolo: ${proto}
Solicitante: ${solicitante}${emailSolicitante ? `\nE-mail: ${emailSolicitante}` : ''}
Categoria: ${cat.nome}
Solicitação: ${solicitacao}${infoExtra}${anexoInfo}

Por favor, verifiquem e deem seguimento ao chamado.

Atenciosamente,
CAR – Central de Atendimento ao Representante
KX3 Galtecom`,
    attachments: anexos.map(c => ({ filename: path.basename(c), path: c }))
  };

  try {
    await transporter.sendMail(mail);
    anexos.forEach(c => fs.unlink(c, err => { if (err) console.error('Erro ao deletar arquivo:', err); }));
    console.log(`E-mail enviado ao setor: ${cat.nome}${emailSolicitante ? ' (solicitante copiado)' : ''}`);
    return true;
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   6. PROCESSAMENTO PRINCIPAL COM SELEÇÃO DE DEPARTAMENTO E REVISÃO
═══════════════════════════════════════════════════════════════════════ */

async function processarMensagem(chatId, texto, solicitante, telegramId) {
  // Comando para atualizar e-mail
  if (/\/email|atualizar\s+e?mail|alterar\s+e?mail|mudar\s+e?mail/i.test(texto)) {
    aguardandoEmail.set(chatId, { acao: 'update' });
    await bot.sendMessage(chatId, '📧 Por favor, digite seu novo endereço de e-mail:');
    return;
  }

  // Verifica estados de controle de fluxo
  if (aguardandoEmail.has(chatId)) {
    const estado = aguardandoEmail.get(chatId);

    // Estado: aguardando seleção de departamento (só aceita callback)
    if (estado.acao === 'aguardando_departamento') {
      await bot.sendMessage(chatId, 'Por favor, selecione o departamento utilizando os botões acima.');
      return;
    }

    // Estado: aguardando descrição após seleção de departamento
    if (estado.acao === 'aguardando_descricao') {
      aguardandoEmail.delete(chatId);
      const deptSelecionado = departamentosSelecionados.get(chatId);

      if (!deptSelecionado) {
        await bot.sendMessage(chatId, '❌ Departamento não selecionado. Por favor, reinicie o processo digitando "abrir chamado".');
        return;
      }

      // Armazena dados para revisão
      const dadosChamado = {
        departamento: deptSelecionado,
        descricao: texto,
        anexos: anexosDoUsuario.has(chatId) ? anexosDoUsuario.get(chatId).map(a => path.basename(a)).join(', ') : 'Nenhum',
        extras: {}
      };

      aguardandoRevisao.set(chatId, dadosChamado);

      // Consulta agente revisor
      const revisao = await consultarAgenteRevisor(dadosChamado);
      
      if (revisao && revisao.resumo_formatado) {
        await bot.sendMessage(chatId, 
          `📋 *RESUMO DO CHAMADO*\n\n${revisao.resumo_formatado}`,
          { parse_mode: 'Markdown' }
        );

        if (revisao.sugestoes && revisao.sugestoes.length > 0) {
          await bot.sendMessage(chatId, 
            `💡 *Sugestões para melhorar seu chamado:*\n${revisao.sugestoes.map(s => `• ${s}`).join('\n')}`,
            { parse_mode: 'Markdown' }
          );
        }

        await bot.sendMessage(chatId, 
          '📎 *Deseja adicionar mais informações ou anexos antes de abrir o chamado?*\n\n' +
          'Você pode:\n' +
          '• Enviar fotos, documentos, áudios ou vídeos\n' +
          '• Adicionar mais detalhes por texto\n' +
          '• Editar a descrição principal\n' +
          '• Ou confirmar a abertura do chamado',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Abrir Chamado Agora', callback_data: 'confirmar_abertura' }],
                [{ text: '📝 Adicionar Mais Informações', callback_data: 'adicionar_info' }],
                [{ text: '✏️ Editar Descrição Principal', callback_data: 'editar_descricao' }]
              ]
            }
          }
        );
      } else {
        // Fallback se agente revisor falhar
        await bot.sendMessage(chatId, 
          `📋 *RESUMO DO CHAMADO*\n\n` +
          `🏢 **Departamento:** ${deptSelecionado}\n` +
          `📝 **Descrição:** ${texto}\n` +
          `📎 **Anexos:** ${dadosChamado.anexos}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Abrir Chamado Agora', callback_data: 'confirmar_abertura' }],
                [{ text: '📝 Adicionar Mais Informações', callback_data: 'adicionar_info' }],
                [{ text: '✏️ Editar Descrição Principal', callback_data: 'editar_descricao' }]
              ]
            }
          }
        );
      }
      return;
    }

    // Estado: aguardando informações adicionais
    if (estado.acao === 'aguardando_info_adicional') {
      const dadosAtuais = aguardandoRevisao.get(chatId);
      if (dadosAtuais) {
        // Adiciona informação extra
        dadosAtuais.descricao += `\n\nInformação adicional: ${texto}`;
        aguardandoRevisao.set(chatId, dadosAtuais);
        
        await bot.sendMessage(chatId, 
          '✅ Informação adicional registrada!\n\n' +
          'Deseja adicionar mais alguma coisa ou confirmar a abertura do chamado?',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Abrir Chamado Agora', callback_data: 'confirmar_abertura' }],
                [{ text: '📝 Adicionar Mais Informações', callback_data: 'adicionar_info' }],
                [{ text: '✏️ Editar Descrição Principal', callback_data: 'editar_descricao' }]
              ]
            }
          }
        );
      }
      aguardandoEmail.delete(chatId);
      return;
    }

    // Estado: aguardando nova descrição (NOVA FUNCIONALIDADE)
    if (estado.acao === 'aguardando_nova_descricao') {
      const dadosAtuais = aguardandoRevisao.get(chatId);
      if (dadosAtuais) {
        // Substitui a descrição principal
        dadosAtuais.descricao = texto;
        aguardandoRevisao.set(chatId, dadosAtuais);
        
        // Gera nova revisão
        const revisao = await consultarAgenteRevisor(dadosAtuais);
        
        await bot.sendMessage(chatId, '✅ Descrição atualizada!\n\n📋 *NOVO RESUMO DO CHAMADO*');
        
        if (revisao && revisao.resumo_formatado) {
          await bot.sendMessage(chatId, 
            revisao.resumo_formatado,
            { parse_mode: 'Markdown' }
          );

          if (revisao.sugestoes && revisao.sugestoes.length > 0) {
            await bot.sendMessage(chatId, 
              `💡 *Novas sugestões:*\n${revisao.sugestoes.map(s => `• ${s}`).join('\n')}`,
              { parse_mode: 'Markdown' }
            );
          }
        } else {
          await bot.sendMessage(chatId, 
            `🏢 **Departamento:** ${dadosAtuais.departamento}\n📝 **Nova Descrição:** ${texto}\n📎 **Anexos:** ${dadosAtuais.anexos}`,
            { parse_mode: 'Markdown' }
          );
        }

        await bot.sendMessage(chatId, 
          'Como ficou a nova versão? Deseja fazer mais alterações?',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Abrir Chamado Agora', callback_data: 'confirmar_abertura' }],
                [{ text: '📝 Adicionar Mais Informações', callback_data: 'adicionar_info' }],
                [{ text: '✏️ Editar Descrição Novamente', callback_data: 'editar_descricao' }]
              ]
            }
          }
        );
      }
      aguardandoEmail.delete(chatId);
      return;
    }

    // Estados de cadastro/atualização de e-mail
    if (estado.acao === 'cadastro' || estado.acao === 'update') {
      aguardandoEmail.delete(chatId);

      if (!validarEmail(texto)) {
        await bot.sendMessage(chatId, '❌ E-mail inválido. Por favor, digite um e-mail válido (ex: seuemail@exemplo.com):');
        aguardandoEmail.set(chatId, estado); // Recoloca na fila
        return;
      }

      if (estado.acao === 'cadastro') {
        // Primeiro cadastro
        await salvarUsuario(telegramId, solicitante, texto);
        await bot.sendMessage(chatId, 
          `✅ E-mail cadastrado com sucesso!\n\n📧 E-mail: ${texto}\n\nAgora você será copiado em todos os e-mails dos seus chamados. Para alterar seu e-mail futuramente, digite "/email".`
        );
      } else if (estado.acao === 'update') {
        // Atualização
        await atualizarEmailUsuario(telegramId, texto);
        await bot.sendMessage(chatId, 
          `✅ E-mail atualizado com sucesso!\n\n📧 Novo e-mail: ${texto}\n\nVocê será copiado nos próximos chamados com este novo e-mail.`
        );
      }
      return;
    }
  }

  // Se o usuário pergunta pelo protocolo
  if (/qual\s+n(ú|u)mero do protocolo/i.test(texto)) {
    if (protocolosRegistrados.has(chatId)) {
      const proto = protocolosRegistrados.get(chatId);
      await bot.sendMessage(chatId, `🔢 O número do seu protocolo é: ${proto}`);
      return;
    } else {
      await bot.sendMessage(chatId, `❌ Nenhum protocolo foi gerado para sua solicitação ainda.`);
      return;
    }
  }

  // Verifica se usuário tem e-mail cadastrado
  let usuario = await buscarUsuario(telegramId);
  if (!usuario) {
    // Primeiro acesso - cadastra o usuário
    usuario = await salvarUsuario(telegramId, solicitante);
  }

  // Se não tem e-mail cadastrado, solicita apenas na primeira abertura de chamado
  if (!usuario.email && /abrir\s+(um\s+)?(car|chamado)/i.test(texto)) {
    aguardandoEmail.set(chatId, { acao: 'cadastro' });
    await bot.sendMessage(chatId, 
      `👋 Olá ${solicitante}!\n\nPara que você seja copiado nos e-mails dos seus chamados, preciso do seu endereço de e-mail.\n\n📧 Por favor, digite seu e-mail:`
    );
    return;
  }

  // Se o usuário solicita explicitamente abrir um CAR/chamado
  if (/abrir\s+(um\s+)?(car|chamado)/i.test(texto)) {
    // Solicita seleção do departamento ao invés de abrir direto
    await solicitarDepartamento(chatId);
    aguardandoEmail.set(chatId, { acao: 'aguardando_departamento' });
    return;
  }

  // Para outras mensagens, resposta padrão ou integração com IA (se necessário)
  await bot.sendMessage(chatId, '👋 Olá! Para abrir um chamado, digite "abrir chamado" ou "abrir CAR".\n\nPara consultar seu protocolo, digite "qual número do protocolo".\n\nPara atualizar seu e-mail, digite "/email".');
}

/* ═══════════════════════════════════════════════════════════════════════
   7. HANDLERS TELEGRAM
═══════════════════════════════════════════════════════════════════════ */

// Mensagens de texto
bot.on('text', async msg => {
  const chatId = msg.chat.id;
  const txt = msg.text;
  const solicitante = nomeSolicitante(msg);
  const telegramId = msg.from.id;

  try {
    await processarMensagem(chatId, txt, solicitante, telegramId);
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
    
    if (aguardandoRevisao.has(chatId)) {
      // Atualiza os dados do chamado com o novo anexo
      const dadosAtuais = aguardandoRevisao.get(chatId);
      dadosAtuais.anexos = anexosDoUsuario.get(chatId).map(a => path.basename(a)).join(', ');
      aguardandoRevisao.set(chatId, dadosAtuais);
      
      await bot.sendMessage(chatId, `📸 Foto recebida e adicionada ao chamado!`);
    } else {
      await bot.sendMessage(chatId, `📸 Foto recebida! Digite "abrir chamado" para criar um chamado com este anexo.`);
    }
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
    
    if (aguardandoRevisao.has(chatId)) {
      // Atualiza os dados do chamado com o novo anexo
      const dadosAtuais = aguardandoRevisao.get(chatId);
      dadosAtuais.anexos = anexosDoUsuario.get(chatId).map(a => path.basename(a)).join(', ');
      aguardandoRevisao.set(chatId, dadosAtuais);
      
      await bot.sendMessage(chatId, `📄 Documento recebido e adicionado ao chamado!`);
    } else {
      await bot.sendMessage(chatId, `📄 Documento recebido! Digite "abrir chamado" para criar um chamado com este anexo.`);
    }
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
    
    if (aguardandoRevisao.has(chatId)) {
      // Atualiza os dados do chamado com o novo anexo
      const dadosAtuais = aguardandoRevisao.get(chatId);
      dadosAtuais.anexos = anexosDoUsuario.get(chatId).map(a => path.basename(a)).join(', ');
      aguardandoRevisao.set(chatId, dadosAtuais);
      
      await bot.sendMessage(chatId, `🎵 Áudio recebido e adicionado ao chamado!`);
    } else {
      await bot.sendMessage(chatId, `🎵 Áudio recebido! Digite "abrir chamado" para criar um chamado com este anexo.`);
    }
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
    
    if (aguardandoRevisao.has(chatId)) {
      // Atualiza os dados do chamado com o novo anexo
      const dadosAtuais = aguardandoRevisao.get(chatId);
      dadosAtuais.anexos = anexosDoUsuario.get(chatId).map(a => path.basename(a)).join(', ');
      aguardandoRevisao.set(chatId, dadosAtuais);
      
      await bot.sendMessage(chatId, `🎬 Vídeo recebido e adicionado ao chamado!`);
    } else {
      await bot.sendMessage(chatId, `🎬 Vídeo recebido! Digite "abrir chamado" para criar um chamado com este anexo.`);
    }
  } catch (error) {
    console.error('Erro ao processar vídeo:', error);
    await bot.sendMessage(chatId, '❌ Não consegui processar seu vídeo. Tente novamente.');
  }
});

// Handler para mensagens de voz (transcrição e processamento automático) - ATUALIZADO
bot.on('voice', async msg => {
  const chatId = msg.chat.id;
  const voice = msg.voice;
  const nome = `voice_${voice.file_unique_id}.ogg`;
  const telegramId = msg.from.id;
  const solicitante = nomeSolicitante(msg);

  try {
    // 1) Baixa o OGG do Telegram
    const oggPath = await baixarArquivoTelegram(voice.file_id, nome);
    await bot.sendMessage(chatId, '🎤 Processando seu áudio...');

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

    // 3) Transcreve com Google
    const transcript = await transcreverComGoogle(wavPath);

    // 4) Limpa arquivos temporários
    fs.unlinkSync(oggPath);
    fs.unlinkSync(wavPath);

    if (transcript && transcript.trim()) {
      await bot.sendMessage(chatId, `🎯 *Transcrição:* ${transcript}`, { parse_mode: 'Markdown' });
      // Processa a mensagem transcrita automaticamente
      await processarMensagem(chatId, transcript, solicitante, telegramId);
    } else {
      await bot.sendMessage(chatId, '❌ Não consegui transcrever seu áudio. Tente falar mais claramente ou digite sua mensagem.');
    }

  } catch (error) {
    console.error('Erro ao transcrever voz:', error);
    await bot.sendMessage(chatId, '❌ Não consegui transcrever sua mensagem de voz. Por favor, tente novamente ou digite sua mensagem.');
  }
});

// Callback para interações via inline keyboard - ATUALIZADO COM EDIÇÃO
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const telegramId = q.from.id;
  const solicitante = nomeSolicitante(q);

  if (data.startsWith('finalizar_')) {
    const proto = data.replace('finalizar_', '');
    const sucesso = await atualizarStatusChamado(proto, "Finalizado");

    if (sucesso) {
      await bot.sendMessage(chatId, `✅ Seu chamado de protocolo ${proto} foi finalizado. Obrigado por utilizar o CAR!`);
      protocolosRegistrados.delete(chatId); // Remove da lista de chamados abertos
    } else {
      await bot.sendMessage(chatId, `❌ Não consegui atualizar o status do protocolo ${proto}. Por favor, tente novamente mais tarde.`);
    }
  } else if (data.startsWith('mais_')) {
    const proto = data.replace('mais_', '');
    await bot.sendMessage(chatId, `📝 O chamado de protocolo ${proto} permanecerá aberto. Por favor, envie os detalhes adicionais que deseja incluir.`);
    // O atendimento continua; o usuário poderá enviar novas mensagens que serão anexadas ao mesmo protocolo.
  } else if (data.startsWith('selecionar_depto_')) {
    const deptSelecionado = data.replace('selecionar_depto_', '');

    // Guarda a seleção para usar ao abrir o chamado
    departamentosSelecionados.set(chatId, deptSelecionado);

    await bot.editMessageText(
      `✅ Você selecionou o departamento: *${deptSelecionado}*.\n\n📝 Por favor, descreva sua solicitação detalhadamente:`,
      { 
        chat_id: chatId, 
        message_id: q.message.message_id, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Remove os botões
      }
    );

    // Marca que o próximo texto será a descrição do chamado
    aguardandoEmail.set(chatId, { acao: 'aguardando_descricao' });
  } else if (data === 'confirmar_abertura') {
    // Confirma abertura do chamado
    const dadosChamado = aguardandoRevisao.get(chatId);
    const deptSelecionado = departamentosSelecionados.get(chatId);
    
    if (!dadosChamado || !deptSelecionado) {
      await bot.sendMessage(chatId, '❌ Erro interno. Por favor, reinicie o processo digitando "abrir chamado".');
      return;
    }

    const proto = gerarProtocolo();
    protocolosRegistrados.set(chatId, proto);

    // Procura a chave da categoria que corresponda exatamente ao departamento selecionado
    const categoryKey = Object.keys(categorias).find(key => categorias[key].nome === deptSelecionado);

    if (!categoryKey) {
      await bot.sendMessage(chatId, '❌ Departamento selecionado não é suportado no sistema. Contate o suporte.');
      return;
    }

    const usuario = await buscarUsuario(telegramId);

    await registrarChamado(proto, solicitante, dadosChamado.descricao, categorias[categoryKey].nome);
    await enviarEmailAbertura(proto, solicitante, categoryKey, dadosChamado.descricao, anexosDoUsuario.get(chatId) || [], {}, usuario?.email);

    await bot.editMessageText(
      `✅ *CHAMADO CRIADO COM SUCESSO!*\n\n` +
      `🔢 Protocolo: *${proto}*\n` +
      `🏢 Setor: *${categorias[categoryKey].nome}*\n` +
      `📧 E-mail enviado à equipe responsável.\n\n` +
      `📱 Guarde este número de protocolo para acompanhar seu chamado.`,
      { 
        chat_id: chatId, 
        message_id: q.message.message_id, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      }
    );

    // Limpa dados temporários
    anexosDoUsuario.delete(chatId);
    aguardandoRevisao.delete(chatId);
    departamentosSelecionados.delete(chatId);
    
  } else if (data === 'adicionar_info') {
    // Solicita informações adicionais
    aguardandoEmail.set(chatId, { acao: 'aguardando_info_adicional' });
    
    await bot.editMessageText(
      '📝 *Adicionar mais informações*\n\n' +
      'Você pode:\n' +
      '• Enviar fotos, documentos, áudios ou vídeos\n' +
      '• Digitar informações adicionais\n\n' +
      'Digite a informação adicional ou envie seus anexos:',
      { 
        chat_id: chatId, 
        message_id: q.message.message_id, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      }
    );
  } else if (data === 'editar_descricao') {
    // NOVA FUNCIONALIDADE: Solicita nova descrição
    aguardandoEmail.set(chatId, { acao: 'aguardando_nova_descricao' });
    
    await bot.editMessageText(
      '✏️ *Editar Descrição Principal*\n\n' +
      'Digite a nova descrição para seu chamado.\n\n' +
      '💡 Esta será a descrição principal que substituirá a anterior:',
      { 
        chat_id: chatId, 
        message_id: q.message.message_id, 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      }
    );
  }

  await bot.answerCallbackQuery(q.id);
});

/* ═══════════════════════════════════════════════════════════════════════
   8. MONITOR DE EMAILS (ATUALIZAÇÕES DE CHAMADOS) - CORRIGIDO
═══════════════════════════════════════════════════════════════════════ */

function startEmailMonitor() {
  const imapConfig = {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASS,
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT) || 993,
    tls: true
  };

  const imap = new Imap(imapConfig);

  imap.once('ready', () => {
    imap.openBox('INBOX', false, function (err, box) {
      if (err) {
        console.error('Erro ao abrir a caixa de entrada:', err);
        return;
      }

      console.log('📧 Monitor de e-mails iniciado com sucesso!');

      // Escuta por novas mensagens
      imap.on('mail', () => {
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            console.error('Erro na busca de emails:', err);
            return;
          }
          if (results.length) {
            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            fetch.on('message', (msg, seqno) => {
              let emailBuffer = '';
              msg.on('body', stream => {
                stream.on('data', chunk => {
                  emailBuffer += chunk.toString('utf8');
                });
              });
              msg.once('end', async () => {
                try {
                  const mail = await simpleParser(emailBuffer);
                  const subject = mail.subject || '';
                  const body = mail.text || '';
                  const attachments = mail.attachments || [];

                  console.log('📨 Novo email recebido!');
                  console.log('Assunto:', subject);
                  console.log('Início do corpo:', body.substring(0, 200));
                  console.log('Anexos:', attachments.length);

                  // Busca protocolo no assunto com regex mais flexível
                  let match = subject.match(/protocolo\s*[:\-–—]?\s*(\d{8}-\d{4})/i);
                  let proto = null;

                  if (match) {
                    proto = match[1];
                    console.log('✅ Protocolo encontrado no assunto:', proto);
                  } else {
                    // Tenta buscar no corpo do email
                    const matchBody = body.match(/protocolo\s*[:\-–—]?\s*(\d{8}-\d{4})/i);
                    if (matchBody) {
                      proto = matchBody[1];
                      console.log('✅ Protocolo encontrado no corpo:', proto);
                    }
                  }

                  if (proto) {
                    // Atualiza a resposta na planilha
                    await atualizarRespostaChamado(proto, body);

                    // NOVA FUNCIONALIDADE: Atualiza status para "Em Andamento"
                    const mudou = await atualizarStatusChamado(proto, "Em Andamento");
                    if (!mudou) {
                      console.warn(`Não foi possível marcar protocolo ${proto} como "Em Andamento" na planilha.`);
                    }

                    let targetChat = null;
                    // Procura pelo chat que possui esse protocolo
                    for (const [chatId, protocol] of protocolosRegistrados.entries()) {
                      if (protocol === proto) {
                        targetChat = chatId;
                        break;
                      }
                    }

                    if (targetChat) {
                      console.log('🤖 Enviando atualização para chat:', targetChat);

                      // Envia a mensagem de resposta
                      await bot.sendMessage(targetChat, `🔧 *Atualização no chamado ${proto}:*\n\n${body.trim()}`, {
                        parse_mode: 'Markdown'
                      });

                      // Processa e envia anexos se existirem
                      if (attachments.length > 0) {
                        console.log(`📎 Processando ${attachments.length} anexo(s)...`);
                        const anexosEnviados = await processarAnexosEmail(attachments, targetChat);
                        if (anexosEnviados.length > 0) {
                          await bot.sendMessage(targetChat, `📎 ${anexosEnviados.length} anexo(s) enviado(s) junto com a resposta.`);
                        }
                      }

                      // Envia os botões de ação
                      await bot.sendMessage(targetChat, `Deseja finalizar o CAR ou fazer mais alguma solicitação?`, {
                        reply_markup: {
                          inline_keyboard: [
                            [{ text: '✅ Finalizar CAR', callback_data: `finalizar_${proto}` }],
                            [{ text: '📝 Mais Solicitação', callback_data: `mais_${proto}` }]
                          ]
                        }
                      });

                    } else {
                      console.log(`⚠️ Protocolo ${proto} não associado a nenhum chat ativo.`);
                    }
                  } else {
                    console.log('❌ Email não contém protocolo no assunto ou corpo.');
                  }
                } catch (e) {
                  console.error('Erro ao processar email:', e);
                }
              });
            });

            fetch.once('error', error => {
              console.error('Erro no fetch do email:', error);
            });
          }
        });
      });
    });
  });

  imap.once('error', err => {
    console.error('Erro IMAP:', err);
  });

  imap.once('end', () => {
    console.log('Conexão IMAP encerrada. Tentando reconectar em 60 segundos...');
    setTimeout(startEmailMonitor, 60000);
  });

  imap.connect();
}

/* ═══════════════════════════════════════════════════════════════════════
   9. INICIALIZAÇÃO
═══════════════════════════════════════════════════════════════════════ */

async function iniciarBot() {
  await inicializarBancoDados();
  startEmailMonitor();

  console.log('🤖 Bot CAR KX3 com IA iniciado!');
  console.log('🧠 Agente IA integrado com Pareto');
  console.log('🔍 Agente Revisor de Chamados ativo');
  console.log('✏️ Sistema de edição de descrição implementado');
  console.log('💾 Banco de dados PostgreSQL conectado');
  console.log('✅ Funcionalidades ativas:');
  console.log('   • Seleção dinâmica de departamentos via planilha DEPARTAMENTOS');
  console.log('   • Conversação inteligente com IA');
  console.log('   • Sistema de revisão de chamados antes da abertura');
  console.log('   • Edição de descrição principal do chamado');
  console.log('   • Coleta de informações adicionais e anexos');
  console.log('   • Classificação automática avançada');
  console.log('   • Geração de protocolos únicos');
  console.log('   • Registro na planilha Google Sheets');
  console.log('   • Envio de e-mails com anexos do usuário');
  console.log('   • Suporte a fotos, documentos, áudios e vídeos');
  console.log('   • Transcrição automática de mensagens de voz');
  console.log('   • Processamento automático de áudios transcritos');
  console.log('   • Fallback manual para abertura de chamados e consulta de protocolo');
  console.log('   • Monitoramento de respostas de e-mail com atualização de chamados');
  console.log('   • Atualização de status para "Em Andamento" e "Finalizado" no Google Sheets');
  console.log('   • Registro automático de respostas na planilha');
  console.log('   • Encaminhamento de anexos de e-mail para o usuário no Telegram');
  console.log('   • Sistema de cadastro e gerenciamento de e-mails dos usuários');
  console.log('   • Cópia automática do solicitante nos e-mails dos chamados');
  console.log('   • Busca dinâmica de e-mails por departamento na aba DEPARTAMENTOS');
  console.log('🚀 Aguardando mensagens...');
}

iniciarBot();
