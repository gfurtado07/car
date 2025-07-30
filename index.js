require('dotenv').config();
const { google } = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const https = require('https');

/* 1. CONFIGURAÇÕES INICIAIS */
// Google Sheets Auth
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

// SMTP / Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* 2. SETORES E CATEGORIAS */
const categorias = {
  estoque_logistica: {
    nome: 'Estoque/Logística',
    emails: ['logistica@galtecom.com.br','estoque@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: ['rastreio','rastrear','pedido','entrega','transportadora','prazo','atraso','envio','remessa','comprovante','mercadoria','chegou','não chegou','onde está'],
    prioridade: 3
  },
  financeiro: {
    nome: 'Financeiro',
    emails: ['contabil@galtecom.com.br','contabil.nav@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: ['segunda via','boleto','prorrogação','pagamento','fatura','cobrança','vencimento','boletos','títulos','prorrogar','dias'],
    prioridade: 2,
    isCoringa: true
  },
  comercial: {
    nome: 'Comercial',
    emails: ['gfurtado@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: ['preços','concorrência','acordado','faturou','bonificação','compensar','valor','reclamando','rádios','próximo pedido'],
    prioridade: 1
  },
  marketing: {
    nome: 'Marketing',
    emails: ['marketing@galtecom.com.br','marketing.nav@galtecom.com.br','gfurtado@galtecom.com.br'],
    palavrasChave: ['fotos','vídeos','produto','flyers','lançamento','fundo branco','diferenciais','câmeras','imagens','material','kc360','krc1610'],
    prioridade: 3
  },
  diretoria: {
    nome: 'Diretoria',
    emails: ['edson@galtecom.com.br','financeiro@galtecom.com.br','gfurtado@galtecom.com.br'],
    palavrasChave: ['reunião','diretoria','proprietário','insatisfeito','resolver','situação','diretor','dono','gerência'],
    prioridade: 1
  },
  engenharia: {
    nome: 'Engenharia/Desenvolvimento',
    emails: ['engenharia@galtecom.com.br','desenvolvimento@galtecom.com.br'],
    palavrasChave: ['manual','instalação','dificuldades','sensor','problemas','funcionamento','técnico','especificação','configuração','krc5000','kxs199a','krc4100'],
    prioridade: 1
  },
  faturamento: {
    nome: 'Faturamento',
    emails: ['adm@galtecom.com.br','financeiro@galtecom.com.br'],
    palavrasChave: ['cfop','cst','faturou','correto','questionando','nota fiscal','6202','6308','fiscal','tributário'],
    prioridade: 1
  },
  garantia: {
    nome: 'Garantia',
    emails: ['garantia@galtecom.com.br','garantia1@galtecom.com.br','edson@galtecom.com.br'],
    palavrasChave: ['garantia','aparelhos','prazo','1 ano','defeito','troca','reparo','fora do prazo','garantir'],
    prioridade: 1
  }
};

/* 3. HELPERS E ESTADO */
const chamadosPendentes = new Map();
const anexosDoUsuario = new Map();

function gerarProtocolo() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0') + '-' +
    String(d.getHours()).padStart(2,'0') +
    String(d.getMinutes()).padStart(2,'0');
}

function dataHoraBR() {
  return new Date().toLocaleString('pt-BR',{ timeZone:'America/Sao_Paulo', day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit' });
}

function nomeSolicitante(msg) {
  const { first_name='', last_name='', username='' } = msg.from;
  return (first_name||last_name) ? `${first_name} ${last_name}`.trim() :
         username ? `@${username}` : `User ${msg.from.id}`;
}

function classificarMensagem(texto) {
  const t = texto.toLowerCase();
  if (t.includes('segunda via') && t.includes('nota fiscal'))
    return { categoria:'financeiro', score:Infinity, confianca:'alta' };

  const scores = {};
  for (const [key,cat] of Object.entries(categorias)) {
    let sc = 0;
    cat.palavrasChave.forEach(p => t.includes(p.toLowerCase()) && (sc += cat.prioridade));
    if (sc>0) scores[key] = sc;
  }
  if (!Object.keys(scores).length) return null;
  const melhor = Object.keys(scores).reduce((a,b)=> scores[a]>scores[b]?a:b);
  return { categoria:melhor, score:scores[melhor], confianca: scores[melhor]>=3?'alta':'baixa' };
}

/* 4. PLANILHA */
async function registrarChamado(proto, solicitante, solicitacao, categoria='Aguardando Classificação') {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${process.env.SHEET_NAME}!A:H`,
      valueInputOption:'USER_ENTERED',
      resource:{ values:[[proto,dataHoraBR(),solicitante,categoria,solicitacao,'','Aberto','']] }
    });
    return true;
  } catch(err) {
    console.error('Sheets append error:', err);
    return false;
  }
}

async function atualizarCategoria(proto, categoriaNome) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range:`${process.env.SHEET_NAME}!A:H`
    });
    const rows = res.data.values||[];
    for (let i=1;i<rows.length;i++){
      if (rows[i][0]===proto){
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range:`${process.env.SHEET_NAME}!D${i+1}`,
          valueInputOption:'USER_ENTERED',
          resource:{ values:[[categoriaNome]] }
        });
        return true;
      }
    }
    return false;
  } catch(err){
    console.error('Sheets update error:', err);
    return false;
  }
}

/* 5. BAIXAR ANEXOS DO TELEGRAM */
async function baixarArquivoTelegram(fileId, nomeOriginal) {
  return new Promise((resolve, reject) => {
    bot.getFileLink(fileId).then(link=>{
      const filename = `${Date.now()}_${nomeOriginal}`;
      const dest = '/tmp/'+filename;
      const file = fs.createWriteStream(dest);
      https.get(link, resp=>{
        resp.pipe(file);
        file.on('finish',()=>{
          file.close(()=>resolve(dest));
        });
      }).on('error',err=>{
        fs.unlinkSync(dest);
        reject(err);
      });
    }).catch(reject);
  });
}

/* 6. ENVIAR E-MAIL */
async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos=[]) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;
  const mail = {
    from: `"CAR KX3" <${process.env.SMTP_USER}>`,
    to: cat.emails.join(', '),
    subject: `Novo chamado – Protocolo ${proto} – ${cat.nome}`,
    text: `Olá equipe ${cat.nome},\n\nChamado: ${proto}\nSolicitante: ${solicitante}\nCategoria: ${cat.nome}\nSolicitação: ${solicitacao}\n\nAtenciosamente, CAR KX3`,
    attachments: anexos.map(c=>({ filename:path.basename(c), path:c }))
  };
  try {
    await transporter.sendMail(mail);
    anexos.forEach(c=> fs.unlink(c, ()=>{}));
    return true;
  } catch(err){
    console.error('Erro envio email:', err);
    return false;
  }
}

/* 7. HANDLERS TELEGRAM */
// Texto
bot.on('text', async msg=>{
  const chatId = msg.chat.id;
  const txt = msg.text;
  const solicitante = nomeSolicitante(msg);
  if (chamadosPendentes.has(chatId)) return;

  const proto = gerarProtocolo();
  await bot.sendMessage(chatId, `🎫 Protocolo: ${proto}\n\nRecebi: "${txt}"\nAnalisando...`);

  const cls = classificarMensagem(txt);
  const anexos = anexosDoUsuario.get(chatId)||[];

  if (cls && cls.confianca==='alta') {
    const cat = categorias[cls.categoria];
    await registrarChamado(proto, solicitante, txt, cat.nome);
    await enviarEmailAbertura(proto, solicitante, cls.categoria, txt, anexos);
    anexosDoUsuario.delete(chatId);
    await bot.sendMessage(chatId, `✅ Chamado ${proto} enviado para ${cat.nome}`);
  }
  else if (cls) {
    await registrarChamado(proto, solicitante, txt);
    chamadosPendentes.set(chatId,{ protocolo:proto, categoriaSugerida:cls.categoria, anexos });
    const cat = categorias[cls.categoria];
    await bot.sendMessage(chatId, `🤖 Pode ser *${cat.nome}*?`, {
      parse_mode:'Markdown',
      reply_markup:{
        inline_keyboard:[
          [{text:'✅ Sim',callback_data:`confirm_${proto}`}],
          [{text:'❌ Não',callback_data:`reject_${proto}`}]
        ]
      }
    });
  }
  else {
    await registrarChamado(proto, solicitante, txt);
    chamadosPendentes.set(chatId,{ protocolo:proto, anexos });
    mostrarMenuCategorias(chatId,proto);
  }
});

// Foto
bot.on('photo', async msg=>{
  const chatId = msg.chat.id;
  const sizes = msg.photo;
  const arq = sizes[sizes.length-1];
  const nome = `foto_${arq.file_unique_id}.jpg`;
  try {
    const caminho = await baixarArquivoTelegram(arq.file_id,nome);
    if (!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId,[]);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId, `📸 Foto salva. Agora envie sua mensagem.`);
  } catch {
    await bot.sendMessage(chatId,'❌ Falha ao baixar foto.');
  }
});

// Documento
bot.on('document',async msg=>{
  const chatId=msg.chat.id, doc=msg.document;
  const nome=doc.file_name||`doc_${doc.file_unique_id}`;
  try {
    const caminho=await baixarArquivoTelegram(doc.file_id,nome);
    if(!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId,[]);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId,`📎 Documento salvo. Agora envie sua mensagem.`);
  }catch{
    await bot.sendMessage(chatId,'❌ Falha ao baixar documento.');
  }
});

// Áudio
bot.on('audio',async msg=>{
  const chatId=msg.chat.id,aud=msg.audio;
  const nome=aud.file_name||`audio_${aud.file_unique_id}.mp3`;
  try {
    const caminho=await baixarArquivoTelegram(aud.file_id,nome);
    if(!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId,[]);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId,`🎵 Áudio salvo. Agora envie sua mensagem.`);
  }catch{
    await bot.sendMessage(chatId,'❌ Falha ao baixar áudio.');
  }
});

// Vídeo
bot.on('video',async msg=>{
  const chatId=msg.chat.id, vid=msg.video;
  const nome=vid.file_name||`video_${vid.file_unique_id}.mp4`;
  try {
    const caminho=await baixarArquivoTelegram(vid.file_id,nome);
    if(!anexosDoUsuario.has(chatId)) anexosDoUsuario.set(chatId,[]);
    anexosDoUsuario.get(chatId).push(caminho);
    await bot.sendMessage(chatId,`🎬 Vídeo salvo. Agora envie sua mensagem.`);
  }catch{
    await bot.sendMessage(chatId,'❌ Falha ao baixar vídeo.');
  }
});

// Callbacks
bot.on('callback_query',async q=>{
  const chatId=q.message.chat.id, data=q.data, pend=chamadosPendentes.get(chatId);
  if(data.startsWith('confirm_')){
    const proto=data.replace('confirm_','');
    if(pend?.categoriaSugerida){
      const ck=pend.categoriaSugerida, cat=categorias[ck];
      await atualizarCategoria(proto,cat.nome);
      await enviarEmailAbertura(proto,nomeSolicitante(q.message),ck,'Confirmado',pend.anexos||[]);
      await bot.editMessageText(`✅ Chamado ${proto} confirmado p/ ${cat.nome}`,{chat_id:chatId,message_id:q.message.message_id});
      chamadosPendentes.delete(chatId); anexosDoUsuario.delete(chatId);
    }
  } else if(data.startsWith('reject_')){
    const proto=data.replace('reject_','');
    await bot.editMessageText('Escolha o setor:',{chat_id:chatId,message_id:q.message.message_id});
    mostrarMenuCategorias(chatId,proto);
  } else if(data.startsWith('cat_')){
    const parts=data.split('_'), proto=parts.pop(), ck=parts.slice(1).join('_'), cat=categorias[ck];
    await atualizarCategoria(proto,cat.nome);
    await enviarEmailAbertura(proto,nomeSolicitante(q.message),ck,'Selecionado',pend?.anexos||[]);
    await bot.editMessageText(`✅ Chamado ${proto} p/ ${cat.nome}`,{chat_id:chatId,message_id:q.message.message_id});
    chamadosPendentes.delete(chatId); anexosDoUsuario.delete(chatId);
  }
  bot.answerCallbackQuery(q.id);
});

function mostrarMenuCategorias(chatId,proto){
  bot.sendMessage(chatId,'Selecione o setor:',{
    reply_markup:{
      inline_keyboard:[
        [{text:'📦 Estoque/Logística',callback_data:`cat_estoque_logistica_${proto}`}],
        [{text:'💰 Financeiro',callback_data:`cat_financeiro_${proto}`}],
        [{text:'🤝 Comercial',callback_data:`cat_comercial_${proto}`}],
        [{text:'📢 Marketing',callback_data:`cat_marketing_${proto}`}],
        [{text:'👔 Diretoria',callback_data:`cat_diretoria_${proto}`}],
        [{text:'🔧 Engenharia',callback_data:`cat_engenharia_${proto}`}],
        [{text:'📊 Faturamento',callback_data:`cat_faturamento_${proto}`}],
        [{text:'🛡️ Garantia',callback_data:`cat_garantia_${proto}`}]
      ]
    }
  });
}

console.log('🤖 Bot CAR KX3 rodando com anexos e e-mails!');
