/************************************************************
 *  CAR KX3 Bot – Telegram + Google Sheets + Email
 ***********************************************************/
require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');


/* 1. CONFIGURAÇÃO GOOGLE SHEETS E TELEGRAM */
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
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

/* 2. SMTP */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

/* 3. CATEGORIAS, HELPERS E CLASSIFICAÇÃO – IGUAL JÁ IMPLANTADO */
const categorias = {
  // ... (MANTENHA como no código anterior, não altere a lista!)
  estoque_logistica: { /* ... igual ao código anterior ... */ },
  financeiro: { /* ... */ },
  comercial: { /* ... */ },
  marketing: { /* ... */ },
  diretoria: { /* ... */ },
  engenharia: { /* ... */ },
  faturamento: { /* ... */ },
  garantia: { /* ... */ }
};

const chamadosPendentes = new Map();
const anexosDoUsuario = new Map();

function gerarProtocolo() { /* ... igual ao anterior ... */ 
  const d = new Date();
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0')
  );
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
  return first_name || last_name ? `${first_name} ${last_name}`.trim() :
         username ? `@${username}` : `User ${msg.from.id}`;
}
function classificarMensagem(texto) {
  const t = texto.toLowerCase();
  if (t.includes('segunda via') && t.includes('nota fiscal'))
    return { categoria: 'financeiro', score: Infinity, confianca: 'alta' };

  const scores = {};
  for (const [key, cat] of Object.entries(categorias)) {
    let sc = 0;
    cat.palavrasChave.forEach(p =>
      t.includes(p.toLowerCase()) && (sc += cat.prioridade)
    );
    if (sc > 0) scores[key] = sc;
  }
  if (!Object.keys(scores).length) return null;
  const melhor = Object.keys(scores).reduce((a, b) =>
    scores[a] > scores[b] ? a : b
  );
  return { categoria: melhor, score: scores[melhor], confianca: scores[melhor] >= 3 ? 'alta' : 'baixa' };
}

/* ------- PLANILHA E E-MAIL ------- */
async function registrarChamado(proto, solicitante, solicitacao, categoria = 'Aguardando Classificação') {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          proto, dataHoraBR(), solicitante, categoria,
          solicitacao, '', 'Aberto', ''
        ]]
      }
    });
    return true;
  } catch (err) {
    console.error('Sheets append error:', err);
    return false;
  }
}
async function atualizarCategoria(proto, categoriaNome) { /* igual código anterior */ 
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`
    });
    const rows = res.data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === proto) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: `${process.env.SHEET_NAME}!D${i + 1}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[categoriaNome]] }
        });
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Sheets update error:', err);
    return false;
  }
}

/* ------- ANEXOS: DOWNLOAD E USO ------- */
async function baixarArquivoTelegram(fileId, nome_original) {
  return new Promise((resolve, reject) => {
    bot.getFileLink(fileId).then(link => {
      const filename = `${Date.now()}_${nome_original}`;
      const dest = '/tmp/' + filename;
      const file = fs.createWriteStream(dest);
      https.get(link, response => {
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      }).on('error', err => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).catch(reject);
  });
}

/* ------- E-MAIL COM ANEXOS ------- */
async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos = []) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;
  const mail = {
    from: `"CAR KX3" <${process.env.SMTP_USER}>`,
    to: cat.emails.join(', '),
    subject: `Novo chamado – Protocolo ${proto} – ${cat.nome}`,
    text: `
Olá equipe ${cat.nome},

Um novo chamado foi aberto.

Protocolo : ${proto}
Solicitante: ${solicitante}
Categoria  : ${cat.nome}
Solicitação: ${solicitacao}

Por favor, verifiquem e deem seguimento.

CAR – Central de Atendimento ao Representante
`,
    attachments: anexos.map(x => ({
      filename: path.basename(x),
      path: x
    }))
  };
  try {
    await transporter.sendMail(mail);
    anexos.forEach(x => fs.unlink(x, err => {}));
    console.log(`Email enviado ao setor ${cat.nome}`);
    return true;
  } catch (err) {
    console.error('Erro envio email:', err);
    return false;
  }
}

/* ------- TELEGRAM ------- */

/* ------- RECEBENDO TEXTOS ------- */
bot.on('text', async msg => {
  const chatId = msg.chat.id;
  const txt = msg.text;
  const solicitante = nomeSolicitante(msg);
  if (chamadosPendentes.has(chatId)) return;

  const proto = gerarProtocolo();

  await bot.sendMessage(chatId,
`🎫 *Protocolo:* ${proto}

Olá ${solicitante}!
Recebi sua solicitação:
"${txt}"

⏳ Analisando setor responsável...`, { parse_mode: 'Markdown' });

  const cls = classificarMensagem(txt);

  // Verifica se recebeu anexos antes (guardar na memória temporária)
  const anexos = anexosDoUsuario.get(chatId) || [];
  if (cls && cls.confianca === 'alta') {
    const cat = categorias[cls.categoria];
    await registrarChamado(proto, solicitante, txt, cat.nome);
    await enviarEmailAbertura(proto, solicitante, cls.categoria, txt, anexos);
    anexosDoUsuario.delete(chatId);
    await bot.sendMessage(chatId,
`✅ *Chamado classificado automaticamente*
📋 Protocolo: *${proto}
🏢 Setor: ${cat.nome}*

📧 E-mail enviado à equipe responsável.`, { parse_mode: 'Markdown' });
  } else if (cls) {
    await registrarChamado(proto, solicitante, txt);
    chamadosPendentes.set(chatId, { protocolo: proto, categoriaSugerida: cls.categoria, anexos });
    await bot.sendMessage(chatId,
`🤖 Identifiquei que o assunto pode ser *${categorias[cls.categoria].nome}*.
Esta classificação está correta?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Sim', callback_data: `confirm_${proto}` }],
            [{ text: '❌ Não', callback_data: `reject_${proto}` }]
          ]
        }
      });
  } else {
    await registrarChamado(proto, solicitante, txt);
    chamadosPendentes.set(chatId, { protocolo: proto, anexos });
    mostrarMenuCategorias(chatId, proto);
  }
});

/* ------- RECEBENDO ANEXOS ------- */
async function handleAttachment(msg, tipo, campoArquivo) {
  const chatId = msg.chat.id;
  const arquivo = msg[campoArquivo];

  if (!arquivo) return;

  // Determina o nome do arquivo original ou um nome padrão
  let nome = arquivo.file_name || (tipo + '_' + arquivo.file_unique_id);

  // Baixa o arquivo do Telegram
  try {
    const p = await baixarArquivoTelegram(arquivo.file_id, nome);

    // Adiciona na lista temporária de anexos desse usuário
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(p);

    await bot.sendMessage(chatId, `📎 Arquivo recebido: ${nome}\n(Envie sua mensagem/texto para finalizar o chamado.)`);
  } catch {
    await bot.sendMessage(chatId, `❌ Não consegui baixar o arquivo "${nome}".`);
  }
}

// Fotos
bot.on('photo', async msg => {
  // "msg.photo" é um array (várias resoluções); pegue a de maior tamanho
  const sizes = msg.photo;
  const arquivo = sizes[sizes.length - 1]; // pega a maior resolução
  // Defina um nome de arquivo genérico para imagem
  const fileName = `foto_${arquivo.file_unique_id}.jpg`;
  // Use handleAttachment com os parâmetros genéricos
  try {
    const p = await baixarArquivoTelegram(arquivo.file_id, fileName);
    const chatId = msg.chat.id;
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(p);
    await bot.sendMessage(chatId, `📎 Foto recebida: ${fileName}\n(Envie sua mensagem de texto para finalizar o chamado.)`);
  } catch {
    await bot.sendMessage(msg.chat.id, `❌ Não consegui baixar sua foto!`);
  }
});
// Documentos
bot.on('document', msg => handleAttachment(msg, 'documento', 'document'));
// Áudio
bot.on('audio', msg => handleAttachment(msg, 'audio', 'audio'));
// Vídeo
bot.on('video', msg => handleAttachment(msg, 'video', 'video'));

/* ------- CALLBACK/BOTÕES ------- */
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const pend = chamadosPendentes.get(chatId);

  if (data.startsWith('confirm_')) {
    const proto = data.replace('confirm_', '');
    if (pend?.categoriaSugerida) {
      const catKey = pend.categoriaSugerida;
      const cat = categorias[catKey];
      await atualizarCategoria(proto, cat.nome);
      await enviarEmailAbertura(proto, nomeSolicitante(q.message), catKey, '—', pend.anexos || []);
      await bot.editMessageText(
        `✅ Classificação confirmada!

Protocolo: *${proto}
Setor: ${cat.nome}*

📧 E-mail enviado à equipe responsável.`,
        { chat_id: chatId, message_id: q.message.message_id, parse_mode: 'Markdown' });
      chamadosPendentes.delete(chatId);
      anexosDoUsuario.delete(chatId);
    }
  } else if (data.startsWith('reject_')) {
    const proto = data.replace('reject_', '');
    await bot.editMessageText('Por favor, escolha o setor correto:',
      { chat_id: chatId, message_id: q.message.message_id });
    mostrarMenuCategorias(chatId, proto);
  } else if (data.startsWith('cat_')) {
    const parts = data.split('_');
    const proto = parts.pop();
    const catKey = parts.slice(1).join('_');
    const cat = categorias[catKey];
    await atualizarCategoria(proto, cat.nome);
    await enviarEmailAbertura(proto, nomeSolicitante(q.message), catKey, '—', pend?.anexos || []);
    await bot.editMessageText(
      `✅ Chamado classificado!

Protocolo: *${proto}
Setor: ${cat.nome}*

📧 E-mail enviado à equipe responsável.`,
      { chat_id: chatId, message_id: q.message.message_id, parse_mode: 'Markdown' });
    chamadosPendentes.delete(chatId);
    anexosDoUsuario.delete(chatId);
  }
  bot.answerCallbackQuery(q.id);
});

/* ------- MENU DE CATEGORIAS ------- */
function mostrarMenuCategorias(chatId, proto) {
  bot.sendMessage(chatId, 'Selecione o setor:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Estoque/Logística', callback_data: `cat_estoque_logistica_${proto}` }],
        [{ text: '💰 Financeiro', callback_data: `cat_financeiro_${proto}` }],
        [{ text: '🤝 Comercial', callback_data: `cat_comercial_${proto}` }],
        [{ text: '📢 Marketing', callback_data: `cat_marketing_${proto}` }],
        [{ text: '👔 Diretoria', callback_data: `cat_diretoria_${proto}` }],
        [{ text: '🔧 Engenharia', callback_data: `cat_engenharia_${proto}` }],
        [{ text: '📊 Faturamento', callback_data: `cat_faturamento_${proto}` }],
        [{ text: '🛡️ Garantia', callback_data: `cat_garantia_${proto}` }]
      ]
    }
  });
}

console.log('🤖 Bot CAR KX3 rodando (agora recebe anexos)!');
