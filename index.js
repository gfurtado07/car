require('dotenv').config(); // carregar variáveis do .env

const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.telegramToken, { polling: true });
const { inicializarBancoDados } = require('./utils/helpers');
const { startEmailMonitor } = require('./services/emailService');

async function iniciarBot() {
  try {
    await inicializarBancoDados();
    startEmailMonitor();

    console.log('🤖 Bot CAR KX3 com IA iniciado!');
    console.log('🚀 Integrado com Pareto AI');
    console.log('🗄️ Banco de dados PostgreSQL conectado');
    console.log('⌛ Aguardando mensagens...');
  } catch (error) {
    console.error('Erro ao iniciar o Bot:', error);
    process.exit(1);
  }
}

iniciarBot();

module.exports = bot; // exporta a instância para outros módulos
