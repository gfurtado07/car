require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');

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

// Nodemailer SMTP
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* ═══════════════════════════════════════════════════════════
   2. CATEGORIAS E SETORES
═══════════════════════════════════════════════════════════ */

const categorias = {
  estoque_logistica: {
    nome: 'Estoque/Logística',
    emails: [
      'logistica@galtecom.com.br',
      'estoque@galtecom.com.br',
      'financeiro@galtecom.com.br'
    ],
    palavrasChave: [
      'rastreio','rastrear','pedido','entrega','transportadora',
      'prazo','atraso','envio','remessa',
      'comprovante','mercadoria','chegou','não chegou','onde está'
    ],
    prioridade: 3
  },
  financeiro: {
    nome: 'Financeiro',
    emails: [
      'contabil@galtecom.com.br',
      'contabil.nav@galtecom.com.br',
      'financeiro@galtecom.com.br'
    ],
    palavrasChave: [
      'segunda via','boleto','prorrogação','pagamento','fatura',
      'cobrança','vencimento','boletos','títulos','prorrogar','dias'
    ],
    prioridade: 2,
    isCoringa: true
  },
  comercial: {
    nome: 'Comercial',
    emails: ['gfurtado@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: [
      'preços','concorrência','acordado','faturou','bonificação',
      'compensar','valor','reclamando','rádios','próximo pedido'
    ],
    prioridade: 1
  },
  marketing: {
    nome: 'Marketing',
    emails: [
      'marketing@galtecom.com.br',
      'marketing.nav@galtecom.com.br',
      'gfurtado@galtecom.com.br'
    ],
    palavrasChave: [
      'fotos','vídeos','produto','flyers','lançamento','fundo branco',
      'diferenciais','câmeras','imagens','material','kc360','krc1610'
    ],
    prioridade: 3
  },
  diretoria: {
    nome: 'Diretoria',
    emails: ['edson@galtecom.com.br','financeiro@galtecom.com.br','gfurtado@galtecom.com.br'],
    palavrasChave: [
      'reunião','diretoria','proprietário','insatisfeito','resolver',
      'situação','diretor','dono','gerência'
    ],
    prioridade: 1
  },
  engenharia: {
    nome: 'Engenharia/Desenvolvimento',
    emails: ['engenharia@galtecom.com.br','desenvolvimento@galtecom.com.br'],
    palavrasChave: [
      'manual','instalação','dificuldades','sensor','problemas',
      'funcionamento','técnico','especificação','configuração',
      'krc5000','kxs199a','krc4100'
    ],
    prioridade: 1
  },
  faturamento: {
    nome: 'Faturamento',
    emails: ['adm@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: [
      'cfop','cst','faturou','correto','questionando',
      'nota fiscal','6202','6308','fiscal','tributário'
    ],
    prioridade: 1
  },
  garantia: {
    nome: 'Garantia',
    emails: ['garantia@galtecom.com.br','garantia1@galtecom.com.br','edson@galtecom.com.br'],
    palavrasChave: [
      'garantia','aparelhos','prazo','1 ano','defeito','troca',
      'reparo','fora do prazo','garantir'
    ],
    prioridade: 1
  }
};

/* ═══════════════════════════════════════════════════════════
   3. VARIÁVEIS GLOBAIS E HELPERS
═══════════════════════════════════════════════════════════ */

const chamadosPendentes = new Map();
const anexosDoUsuario = new Map();

function gerarProtocolo() {
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

/* ═══════════════════════════════════════════════════════════
   4. CLASSIFICAÇÃO INTELIGENTE
═══════════════════════════════════════════════════════════ */

function classificarMensagem(texto) {
  const t = texto.toLowerCase();

  // Caso especial: segunda via de nota fiscal
  if (t.includes('segunda via') && t.includes('nota fiscal'))
    return { categoria: 'financeiro', score: Infinity, confianca: 'alta' };

  const scores = {};
  for (const [key, cat] of Object.entries(categorias)) {
    let sc = 0;
    cat.palavrasChave.forEach(p => {
      if (t.includes(p.toLowerCase())) {
        sc += cat.prioridade;
      }
    });
    if (sc > 0) scores[key] = sc;
  }

  if (!Object.keys(scores).length) return null;

  const melhor = Object.keys(scores).reduce((a, b) =>
    scores[a] > scores[b] ? a : b
  );

  return { 
    categoria: melhor, 
    score: scores[melhor], 
    confianca: scores[melhor] >= 3 ? 'alta' : 'baixa' 
  };
}

/* ═══════════════════════════════════════════════════════════
   5. GOOGLE SHEETS
═══════════════════════════════════════════════════════════ */

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
    console.log(`Chamado registrado: ${proto}`);
    return true;
  } catch (err) {
    console.error('Erro ao registrar chamado:', err);
    return false;
  }
}

async function atualizarCategoria(proto, categoriaNome) {
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
        console.log(`Categoria atualizada: ${proto} -> ${categoriaNome}`);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('Erro ao atualizar categoria:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   6. DOWNLOAD E ANEXOS
═══════════════════════════════════════════════════════════ */

async function baixarArquivoTelegram(fileId, nomeOriginal) {
  return new Promise((resolve, reject) => {
    bot.getFileLink(fileId).then(link => {
      const filename = `${Date.now()}_${nomeOriginal}`;
      const dest = '/tmp/' + filename;
      const file = fs.createWriteStream(dest);
      
      https.get(link, response => {
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(dest));
        });
      }).on('error', err => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).catch(reject);
  });
}

/* ═══════════════════════════════════════════════════════════
   7. ENVIO DE E-MAILS COM ANEXOS
═══════════════════════════════════════════════════════════ */

async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos = []) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;

  const mail = {
    from: `"CAR KX3" <${process.env.SMTP_USER}>`,
    to: cat.emails.join(', '),
    subject: `Novo chamado – Protocolo ${proto} – ${cat.nome}`,
    text: `
Olá equipe ${cat.nome},

Um novo chamado foi aberto na Central de Atendimento ao Representante.

Protocolo: ${proto}
Solicitante: ${solicitante}
Categoria: ${cat.nome}
Solicitação: ${solicitacao}

Por favor, verifiquem e deem seguimento ao chamado.

Atenciosamente,
CAR – Central de Atendimento ao Representante
KX3 Galtecom
`,
    attachments: anexos.map(caminho => ({
      filename: path.basename(caminho),
      path: caminho
    }))
  };

  try {
    await transporter.sendMail(mail);
    
    // Limpar arquivos temporários após envio
    anexos.forEach(caminho => {
      fs.unlink(caminho, err => {
        if (err) console.error('Erro ao deletar arquivo temporário:', err);
      });
    });
    
    console.log(`E-mail enviado ao setor: ${cat.nome}`);
    return true;
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   8. TELEGRAM - RECEBENDO MENSAGENS DE TEXTO
═══════════════════════════════════════════════════════════ */

bot.on('text', async msg => {
  const chatId = msg.chat.id;
  const txt = msg.text;
  const solicitante = nomeSolicitante(msg);

  // Se está aguardando resposta de classificação, ignora
  if (chamadosPendentes.has(chatId)) return;

  try {
    const proto = gerarProtocolo();

    await bot.sendMessage(chatId,
`🎫 *Protocolo:* ${proto}

Olá ${solicitante}!

Recebi sua solicitação:
"${txt}"

⏳ Analisando e direcionando para o setor responsável...`, 
{ parse_mode: 'Markdown' });

    const cls = classificarMensagem(txt);
    const anexos = anexosDoUsuario.get(chatId) || [];

    if (cls && cls.confianca === 'alta') {
      // Classificação automática com alta confiança
      const cat = categorias[cls.categoria];
      await registrarChamado(proto, solicitante, txt, cat.nome);
      await enviarEmailAbertura(proto, solicitante, cls.categoria, txt, anexos);
      anexosDoUsuario.delete(chatId);

      await bot.sendMessage(chatId,
`✅ *Chamado classificado automaticamente*

📋 Protocolo: *${proto}*
🏢 Setor: *${cat.nome}*
📅 Data: ${dataHoraBR()}

📧 E-mail enviado à equipe responsável.
📱 Mantenha este protocolo para acompanhar seu chamado.`, 
{ parse_mode: 'Markdown' });

    } else if (cls) {
      // Baixa confiança - pedir confirmação
      await registrarChamado(proto, solicitante, txt);
      chamadosPendentes.set(chatId, { 
        protocolo: proto, 
        categoriaSugerida: cls.categoria, 
        anexos 
      });

      const cat = categorias[cls.categoria];
      await bot.sendMessage(chatId,
`🤖 Identifiquei que sua solicitação pode ser sobre:

🏢 *${cat.nome}*

Esta classificação está correta?`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Sim, está correto', callback_data: `confirm_${proto}` }],
            [{ text: '❌ Não, escolher outro setor', callback_data: `reject_${proto}` }]
          ]
        }
      });

    } else {
      // Não identificou - mostrar menu
      await registrarChamado(proto, solicitante, txt);
      chamadosPendentes.set(chatId, { protocolo: proto, anexos });
      mostrarMenuCategorias(chatId, proto);
    }

  } catch (error) {
    console.error('Erro no processamento da mensagem:', error);
    await bot.sendMessage(chatId, `❌ Ops! Ocorreu um erro inesperado. Tente novamente em alguns minutos.`);
  }
});

/* ═══════════════════════════════════════════════════════════
   9. TELEGRAM - RECEBENDO ANEXOS
═══════════════════════════════════════════════════════════ */

// Fotos
bot.on('photo', async msg => {
  const chatId = msg.chat.id;
  const sizes = msg.photo;
  const arquivo = sizes[sizes.length - 1]; // maior resolução
  const fileName = `foto_${arquivo.file_unique_id}.jpg`;
  
  try {
    const caminho = await baixarArquivoTelegram(arquivo.file_id, fileName);
    
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    
    await bot.sendMessage(chatId, `📸 Foto recebida: ${fileName}\n\n💬 Agora envie sua mensagem de texto para finalizar o chamado.`);
  } catch (err) {
    console.error('Erro ao processar foto:', err);
    await bot.sendMessage(chatId, `❌ Não consegui processar sua foto. Tente novamente.`);
  }
});

// Documentos
bot.on('document', async msg => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  const fileName = doc.file_name || `documento_${doc.file_unique_id}`;
  
  try {
    const caminho = await baixarArquivoTelegram(doc.file_id, fileName);
    
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    
    await bot.sendMessage(chatId, `📎 Documento recebido: ${fileName}\n\n💬 Agora envie sua mensagem de texto para finalizar o chamado.`);
  } catch (err) {
    console.error('Erro ao processar documento:', err);
    await bot.sendMessage(chatId, `❌ Não consegui processar seu documento. Tente novamente.`);
  }
});

// Áudios
bot.on('audio', async msg => {
  const chatId = msg.chat.id;
  const audio = msg.audio;
  const fileName = audio.file_name || `audio_${audio.file_unique_id}.mp3`;
  
  try {
    const caminho = await baixarArquivoTelegram(audio.file_id, fileName);
    
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    
    await bot.sendMessage(chatId, `🎵 Áudio recebido: ${fileName}\n\n💬 Agora envie sua mensagem de texto para finalizar o chamado.`);
  } catch (err) {
    console.error('Erro ao processar áudio:', err);
    await bot.sendMessage(chatId, `❌ Não consegui processar seu áudio. Tente novamente.`);
  }
});

// Vídeos
bot.on('video', async msg => {
  const chatId = msg.chat.id;
  const video = msg.video;
  const fileName = video.file_name || `video_${video.file_unique_id}.mp4`;
  
  try {
    const caminho = await baixarArquivoTelegram(video.file_id, fileName);
    
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId, []);
    anexosDoUsuario.get(chatId).push(caminho);
    
    await bot.sendMessage(chatId, `🎬 Vídeo recebido: ${fileName}\n\n💬 Agora envie sua mensagem de texto para finalizar o chamado.`);
  } catch (err) {
    console.error('Erro ao processar vídeo:', err);
    await bot.sendMessage(chatId, `❌ Não consegui processar seu vídeo. Tente novamente.`);
  }
});

/* ═══════════════════════════════════════════════════════════
   10. TELEGRAM - CALLBACK QUERIES (BOTÕES)
═══════════════════════════════════════════════════════════ */

bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;
  const pend = chamadosPendentes.get(chatId);

  try {
    if (data.startsWith('confirm_')) {
      const proto = data.replace('confirm_', '');
      if (pend?.categoriaSugerida) {
        const catKey = pend.categoriaSugerida;
        const cat = categorias[catKey];
        await atualizarCategoria(proto, cat.nome);
        await enviarEmailAbertura(proto, nomeSolicitante(q.message), catKey, 'Confirmado pelo usuário', pend.anexos || []);
        
        await bot.editMessageText(
`✅ *Classificação confirmada!*

📋 Protocolo: *${proto}*
🏢 Setor: *${cat.nome}*
📧 E-mail enviado à equipe responsável.`, {
          chat_id: chatId,
          message_id: q.message.message_id,
          parse_mode: 'Markdown'
        });
        
        chamadosPendentes.delete(chatId);
        anexosDoUsuario.delete(chatId);
      }

    } else if (data.startsWith('reject_')) {
      const proto = data.replace('reject_', '');
      await bot.editMessageText('🤖 *Escolha o setor correto para sua solicitação:*', {
        chat_id: chatId,
        message_id: q.message.message_id,
        parse_mode: 'Markdown'
      });
      mostrarMenuCategorias(chatId, proto);

    } else if (data.startsWith('cat_')) {
      const parts = data.split('_');
      const proto = parts.pop();
      const catKey = parts.slice(1).join('_');
      const cat = categorias[catKey];
      
      await atualizarCategoria(proto, cat.nome);
      await enviarEmailAbertura(proto, nomeSolicitante(q.message), catKey, 'Selecionado pelo usuário', pend?.anexos || []);
      
      await bot.editMessageText(
`✅ *Chamado classificado!*

📋 Protocolo: *${proto}*
🏢 Setor: *${cat.nome}*
📧 E-mail enviado à equipe responsável.`, {
        chat_id: chatId,
        message_id: q.message.message_id,
        parse_mode: 'Markdown'
      });
      
      chamadosPendentes.delete(chatId);
      anexosDoUsuario.delete(chatId);
    }

  } catch (error) {
    console.error('Erro no callback query:', error);
    await bot.sendMessage(chatId, '❌ Erro ao processar sua resposta. Tente novamente.');
  }

  await bot.answerCallbackQuery(q.id);
});

/* ═══════════════════════════════════════════════════════════
   11. MENU DE CATEGORIAS
═══════════════════════════════════════════════════════════ */

function mostrarMenuCategorias(chatId, proto) {
  bot.sendMessage(chatId, '🤖 *Não consegui identificar automaticamente o tipo da sua solicitação.*\n\nPor favor, selecione o setor mais adequado:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Estoque/Logística', callback_data: `cat_estoque_logistica_${proto}` }],
        [{ text: '💰 Financeiro', callback_data: `cat_financeiro_${proto}` }],
        [{ text: '🤝 Comercial', callback_data: `cat_comercial_${proto}` }],
        [{ text: '📢 Marketing', callback_data: `cat_marketing_${proto}` }],
        [{ text: '👔 Diretoria', callback_data: `cat_diretoria_${proto}` }],
        [{ text: '🔧 Engenharia/Desenvolvimento', callback_data: `cat_engenharia_${proto}` }],
        [{ text: '📊 Faturamento', callback_data: `cat_faturamento_${proto}` }],
        [{ text: '🛡️ Garantia', callback_data: `cat_garantia_${proto}` }]
      ]
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   12. INICIALIZAÇÃO
═══════════════════════════════════════════════════════════ */

console.log('🤖 Bot CAR KX3 iniciado com sucesso!');
console.log('✅ Funcionalidades ativas:');
console.log('   • Geração de protocolos únicos');
console.log('   • Registro automático na planilha');
console.log('   • Classificação inteligente por palavras-chave');
console.log('   • Envio de e-mails ao setor responsável');
console.log('   • Suporte a anexos (fotos, documentos, áudios, vídeos)');
console.log('📞 Aguardando mensagens...');
