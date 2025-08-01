const { v4: uuidv4 } = require('uuid');
const sheetsService = require('./sheetsService');
const { salvarChamado, buscarChamadosPorUsuario } = require('../utils/helpers');

/**
 * Gera protocolo único para o chamado
 */
function gerarProtocolo() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CAR${timestamp}${random}`;
}

/**
 * Valida dados do chamado
 */
function validarDadosChamado(dados) {
  const erros = [];

  if (!dados.nome || dados.nome.trim().length < 2) {
    erros.push('Nome deve ter pelo menos 2 caracteres');
  }

  if (!dados.empresa || dados.empresa.trim().length < 2) {
    erros.push('Empresa deve ser informada');
  }

  if (!dados.telefone || dados.telefone.length < 10) {
    erros.push('Telefone deve ter pelo menos 10 dígitos');
  }

  if (!dados.email || !dados.email.includes('@')) {
    erros.push('Email deve ser válido');
  }

  if (!dados.departamento || !['técnico', 'comercial', 'financeiro', 'suporte'].includes(dados.departamento.toLowerCase())) {
    erros.push('Departamento deve ser: técnico, comercial, financeiro ou suporte');
  }

  if (!dados.assunto || dados.assunto.trim().length < 5) {
    erros.push('Assunto deve ter pelo menos 5 caracteres');
  }

  if (!dados.descricao || dados.descricao.trim().length < 10) {
    erros.push('Descrição deve ter pelo menos 10 caracteres');
  }

  if (!dados.prioridade || !['baixa', 'média', 'alta', 'urgente'].includes(dados.prioridade.toLowerCase())) {
    erros.push('Prioridade deve ser: baixa, média, alta ou urgente');
  }

  return erros;
}

/**
 * Cria um novo chamado completo
 */
async function criarChamado(dadosBrutos, telegramId) {
  try {
    console.log('🎫 Criando novo chamado...');

    // Valida dados
    const erros = validarDadosChamado(dadosBrutos);
    if (erros.length > 0) {
      throw new Error(`Dados inválidos: ${erros.join(', ')}`);
    }

    // Monta objeto do chamado
    const chamado = {
      protocolo: gerarProtocolo(),
      data_hora: new Date().toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      nome: dadosBrutos.nome.trim(),
      empresa: dadosBrutos.empresa.trim(),
      telefone: dadosBrutos.telefone.replace(/\D/g, ''), // Remove não-dígitos
      email: dadosBrutos.email.toLowerCase().trim(),
      departamento: dadosBrutos.departamento.toLowerCase(),
      assunto: dadosBrutos.assunto.trim(),
      descricao: dadosBrutos.descricao.trim(),
      prioridade: dadosBrutos.prioridade.toLowerCase(),
      status: 'aberto',
      telegram_id: telegramId
    };

    console.log('📋 Dados do chamado validados:', chamado.protocolo);

    // Salva no Google Sheets
    await sheetsService.adicionarChamado(chamado);

    // Salva backup no PostgreSQL
    await salvarChamado(chamado);

    console.log('✅ Chamado criado com sucesso:', chamado.protocolo);

    return {
      sucesso: true,
      protocolo: chamado.protocolo,
      chamado: chamado
    };

  } catch (error) {
    console.error('❌ Erro ao criar chamado:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Lista chamados de um usuário
 */
async function listarChamadosUsuario(telegramId) {
  try {
    const chamados = await sheetsService.buscarChamadosUsuario(telegramId);
    return chamados;
  } catch (error) {
    console.error('❌ Erro ao listar chamados:', error);
    return [];
  }
}

module.exports = {
  criarChamado,
  listarChamadosUsuario,
  gerarProtocolo,
  validarDadosChamado
};
