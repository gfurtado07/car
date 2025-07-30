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

// Pareto IA Agent
const PARETO_API_URL = 'https://tess.pareto.io/api';
const PARETO_TOKEN = process.env.PARETO_API_TOKEN;
const PARETO_AGENT_ID = process.env.PARETO_AGENT_ID;

/* ═══════════════════════════════════════════════════════════
   2. CATEGORIAS DOS SETORES
═══════════════════════════════════════════════════════════ */

const categorias = {
  estoque_logistica: {
    nome: 'Estoque/Logística',
    emails: ['logistica@galtecom.com.br','estoque@galtecom.com.br','financeiro@galtecom.com.br']
  },
  financeiro: {
    nome: 'Financeiro',
    emails: ['contabil@galtecom.com.br','contabil.nav@galtecom.com.br','financeiro@galtecom.com.br']
  },
  comercial: {
    nome: 'Comercial',
    emails: ['gfurtado@galtecom.com.br','financeiro@galtecom.com.br']
  },
  marketing: {
    nome: 'Marketing',
    emails: ['marketing@galtecom.com.br','marketing.nav@galtecom.com.br','gfurtado@galtecom.com.br']
  },
  diretoria: {
    nome: 'Diretoria',
    emails: ['edson@galtecom.com.br','financeiro@galtecom.com.br','gfurtado@galtecom.com.br']
  },
  engenharia: {
    nome: 'Engenharia/Desenvolvimento',
    emails: ['engenharia@galtecom.com.br','desenvolvimento@galtecom.com.br']
  },
  faturamento: {
    nome: 'Faturamento',
    emails: ['adm@galtecom.com.br','financeiro@galtecom.com.br']
  },
  garantia: {
    nome: 'Garantia',
    emails: ['garantia@galtecom.com.br','garantia1@galtecom.com.br','edson@galtecom.com.br']
  }
};

/* ═══════════════════════════════════════════════════════════
   3. ESTADO E HELPERS
═══════════════════════════════════════════════════════════ */

const conversasEmAndamento = new Map();
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
  return new Date().toLocaleString('pt-BR',{ 
    timeZone:'America/Sao_Paulo', 
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit' 
  });
}

function nomeSolicitante(msg) {
  const { first_name='', last_name='', username='' } = msg.from;
  return (first_name||last_name) ? `${first_name} ${last_name}`.trim() :
         username ? `@${username}` : `User ${msg.from.id}`;
}

/* ═══════════════════════════════════════════════════════════
   4. COMUNICAÇÃO COM AGENTE IA (PARETO) - CORRIGIDA
═══════════════════════════════════════════════════════════ */

function tentarParsearJSON(texto) {
  try {
    // Remove quebras de linha e espaços desnecessários
    const textoLimpo = texto.trim();
    
    // Tenta encontrar JSON no texto
    const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Se não encontrou JSON, retorna estrutura padrão
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
      
      // Tentar extrair JSON da resposta
      const jsonResponse = tentarParsearJSON(output);
      
      if (jsonResponse && jsonResponse.resposta_usuario) {
        // Se encontrou JSON válido, usar ele
        console.log('JSON parsado com sucesso:', jsonResponse);
        return jsonResponse;
      } else {
        // Se não encontrou JSON válido, usar resposta como texto simples
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
      valueInputOption:'USER_ENTERED',
      resource:{ values:[[proto,dataHoraBR(),solicitante,categoria,solicitacao,'','Aberto','']] }
    });
    console.log(`Chamado registrado: ${proto}`);
    return true;
  } catch(err) {
    console.error('Erro ao registrar chamado:', err);
    return false;
  }
}

async function baixarArquivoTelegram(fileId, nomeOriginal) {
  return new Promise((resolve, reject) => {
    bot.getFileLink(fileId).then(link=>{
      const filename = `${Date.now()}_${nomeOriginal}`;
      const dest = '/tmp/'+filename;
      const file = fs.createWriteStream(dest);
      https.get(link, resp=>{
        resp.pipe(file);
        file.on('finish',()=>file.close(()=>resolve(dest)));
      }).on('error',err=>{
        fs.unlinkSync(dest);
        reject(err);
      });
    }).catch(reject);
  });
}

async function enviarEmailAbertura(proto, solicitante, categoriaKey, solicitacao, anexos=[], informacoesColetadas={}) {
  const cat = categorias[categoriaKey];
  if (!cat) return false;
  
  // Montar informações adicionais coletadas pela IA
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
    attachments: anexos.map(c=>({ filename:path.basename(c), path:c }))
  };
  
  try {
    await transporter.sendMail(mail);
    anexos.forEach(c=> fs.unlink(c, err => {
      if (err) console.error('Erro ao deletar arquivo:', err);
    }));
    console.log(`E-mail enviado ao setor: ${cat.nome}`);
    return true;
  } catch(err){
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
    
    // Log para debug (não enviar ao usuário)
    console.log('Resposta estruturada da IA:', JSON.stringify(respostaIA, null, 2));
    
    // Atualizar contexto da conversa
    conversa.push({ role: 'user', content: texto });
    conversa.push({ role: 'assistant', content: respostaIA.resposta_usuario });
    conversasEmAndamento.set(chatId, conversa);

    // ENVIAR APENAS A RESPOSTA AMIGÁVEL PARA O USUÁRIO
    await bot.sendMessage(chatId, respostaIA.resposta_usuario);

    // Processar ação recomendada pelo agente
    if (respostaIA.proxima_acao === 'gerar_protocolo' && respostaIA.categoria) {
      const proto = gerarProtocolo();
      const cat = categorias[respostaIA.categoria];
      
      if (cat) {
        // Registrar chamado
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
      // Fallback para menu manual se IA não conseguir classificar
      mostrarMenuCategorias(chatId);
    }
    // Se proxima_acao for 'continuar_conversa' ou 'pedir_mais_info', não fazer nada além de esperar próxima mensagem

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
  const arq = sizes[sizes.length-1];
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
  }}
