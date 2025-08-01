const { google } = require('googleapis');
const config = require('../config');

let sheetsClient = null;

/**
 * Inicializa cliente do Google Sheets
 */
async function inicializarSheets() {
  if (sheetsClient) return sheetsClient;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: config.googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets conectado');
    return sheetsClient;
  } catch (error) {
    console.error('❌ Erro ao conectar Google Sheets:', error);
    throw error;
  }
}

/**
 * Adiciona um novo chamado na planilha
 */
async function adicionarChamado(dadosChamado) {
  try {
    if (!sheetsClient) await inicializarSheets();

    // Estrutura da linha que será inserida (ajustar conforme sua planilha)
    const linha = [
      dadosChamado.data_hora,           // A - Data/Hora
      dadosChamado.protocolo,           // B - Protocolo
      dadosChamado.nome,                // C - Nome
      dadosChamado.empresa,             // D - Empresa
      dadosChamado.telefone,            // E - Telefone
      dadosChamado.email,               // F - Email
      dadosChamado.departamento,        // G - Departamento
      dadosChamado.assunto,             // H - Assunto
      dadosChamado.descricao,           // I - Descrição
      dadosChamado.prioridade,          // J - Prioridade
      'Aberto',                         // K - Status (padrão)
      dadosChamado.telegram_id          // L - ID Telegram (para referência)
    ];

    const request = {
      spreadsheetId: config.sheetId,
      range: `${config.sheetName}!A:L`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [linha]
      }
    };

    const response = await sheetsClient.spreadsheets.values.append(request);
    
    console.log('✅ Chamado salvo no Google Sheets:', dadosChamado.protocolo);
    return response.data;

  } catch (error) {
    console.error('❌ Erro ao salvar no Google Sheets:', error);
    throw error;
  }
}

/**
 * Busca chamados de um usuário específico
 */
async function buscarChamadosUsuario(telegramId) {
  try {
    if (!sheetsClient) await inicializarSheets();

    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range: `${config.sheetName}!A:L`
    });

    const rows = response.data.values || [];
    
    // Filtra chamados do usuário (coluna L = telegram_id)
    const chamadosUsuario = rows.filter(row => 
      row[11] && row[11].toString() === telegramId.toString()
    );

    return chamadosUsuario.map(row => ({
      data_hora: row[0],
      protocolo: row[1],
      nome: row[2],
      empresa: row[3],
      telefone: row[4],
      email: row[5],
      departamento: row[6],
      assunto: row[7],
      descricao: row[8],
      prioridade: row[9],
      status: row[10]
    }));

  } catch (error) {
    console.error('❌ Erro ao buscar chamados:', error);
    return [];
  }
}

module.exports = {
  inicializarSheets,
  adicionarChamado,
  buscarChamadosUsuario
};
