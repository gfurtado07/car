# 🤖 Bot CAR KX3 - Central de Atendimento ao Representante

**Sistema Inteligente de Atendimento ao Cliente com IA Avançada**

---

## 📋 Índice

1. [Visão Geral do Projeto](#-visão-geral-do-projeto)
2. [Arquitetura e Tecnologias](#-arquitetura-e-tecnologias)
3. [Funcionalidades Implementadas](#-funcionalidades-implementadas)
4. [Configuração e Deploy](#-configuração-e-deploy)
5. [Variáveis de Ambiente](#-variáveis-de-ambiente)
6. [Estrutura do Código](#-estrutura-do-código)
7. [Fluxo de Funcionamento](#-fluxo-de-funcionamento)
8. [Código Completo](#-código-completo)
9. [Serviços Integrados](#-serviços-integrados)
10. [Troubleshooting](#-troubleshooting)
11. [Próximos Passos](#-próximos-passos)

---

## 🎯 Visão Geral do Projeto

O **Bot CAR KX3** é um sistema inteligente completo de atendimento ao cliente desenvolvido para o Telegram, que automatiza todo o ciclo de vida de chamados de suporte com integração de IA avançada.

### **Principais Características:**
- 🧠 **Inteligência Artificial** via agentes Pareto para conversação natural
- 🎤 **Transcrição automática** de áudios com Google Cloud Speech-to-Text
- 📝 **Sistema de revisão** de chamados antes da abertura
- ✏️ **Edição de descrição** com nova revisão da IA
- 📎 **Gestão completa de anexos** (fotos, documentos, áudios, vídeos)
- 📊 **Integração com Google Sheets** para registro e controle
- 📧 **Sistema de e-mail bidirecional** com monitoramento IMAP
- 💾 **Banco PostgreSQL** para persistência de dados
- 🏢 **Seleção dinâmica** de departamentos via planilha
- 🔄 **Deploy automatizado** no Render

---

## 🏗️ Arquitetura e Tecnologias

### **Backend Principal**
- **Node.js** 18+ com Express
- **PostgreSQL** (banco de dados principal)
- **Google Sheets API** (registro de chamados)
- **Nodemailer** (envio de e-mails SMTP)
- **IMAP** (monitoramento de respostas)

### **Inteligência Artificial**
- **Agente IA Pareto Principal** (ID: definido em PARETO_AGENT_ID)
- **Agente IA Revisor Pareto** (ID: definido em PARETO_REVIEW_AGENT_ID)
- **Google Cloud Speech-to-Text API** (transcrição de áudios)
- **FFmpeg** (conversão de formatos de áudio)

### **Comunicação**
- **Telegram Bot API** (interface principal)
- **SMTP/IMAP Gmail** (integração de e-mail)
- **Webhook/Polling** (recebimento de mensagens)

### **Deploy e Hospedagem**
- **Render.com** (hosting principal)
- **GitHub** (versionamento e CI/CD)
- **Variáveis de ambiente** (configuração segura)

---

## ✨ Funcionalidades Implementadas

### **1. Sistema de Conversação Inteligente**
- ✅ Conversação natural com usuários via IA
- ✅ Classificação automática de solicitações por setor
- ✅ Seleção dinâmica do departamento via planilha "DEPARTAMENTOS"
- ✅ Coleta inteligente de informações relevantes
- ✅ Fallback manual quando IA não consegue classificar

### **2. Sistema de Revisão de Chamados**
- ✅ Agente IA revisor analisa descrição antes da abertura
- ✅ Gera resumo formatado e sugestões de melhoria
- ✅ Usuário pode aprovar, editar ou adicionar informações
- ✅ Texto final aprovado é enviado no e-mail e planilha

### **3. Edição Avançada de Descrição**
- ✅ Botão "Editar Descrição Principal" 
- ✅ Reescrita completa do texto principal
- ✅ Nova revisão automática da IA após edição
- ✅ Atualização do resumo em tempo real

### **4. Transcrição de Áudio**
- ✅ Processamento automático de mensagens de voz
- ✅ Conversão OGG → WAV → Transcrição
- ✅ Integração com Google Cloud Speech-to-Text
- ✅ Processamento automático da mensagem transcrita

### **5. Gestão Completa de Anexos**
- ✅ Suporte a fotos, documentos, áudios e vídeos
- ✅ Download e armazenamento temporário
- ✅ Envio automático por e-mail junto com chamados
- ✅ Processamento de anexos de respostas por e-mail
- ✅ Adição de anexos durante revisão do chamado

### **6. Sistema de Protocolos**
- ✅ Geração automática de números únicos
- ✅ Formato: AAAAMMDD-HHMM (ex: 20250131-1430)
- ✅ Rastreamento de protocolos por usuário
- ✅ Consulta de protocolo via comando

### **7. Integração com Google Sheets**
- ✅ Registro automático de chamados
- ✅ Atualização de status (Aberto/Em Andamento/Finalizado)
- ✅ Registro de respostas recebidas
- ✅ Histórico completo de interações
- ✅ Leitura dinâmica da aba "DEPARTAMENTOS"

### **8. Sistema de E-mail Bidirecional**
- ✅ Envio automático para setores via contatos da planilha
- ✅ Monitoramento de respostas via IMAP
- ✅ Encaminhamento automático para usuários
- ✅ Suporte a anexos em ambas direções
- ✅ Atualização automática de status

### **9. Gestão de Usuários**
- ✅ Cadastro automático no PostgreSQL
- ✅ Sistema de e-mail do solicitante
- ✅ Cópia automática em e-mails de chamados
- ✅ Comando para atualização de e-mail (/email)

### **10. Interface de Controle**
- ✅ Botões inline para todas as ações
- ✅ Menu dinâmico de departamentos
- ✅ Comandos especiais e consultas
- ✅ Feedback visual em tempo real

---

## ⚙️ Configuração e Deploy

### **Estrutura de Arquivos**
```
bot-car-kx3/
├── index.js              # Código principal completo
├── package.json           # Dependências do projeto
├── .env                  # Variáveis locais (não commitado)
├── README.md             # Esta documentação
├── .gitignore           # Arquivos ignorados pelo Git
└── docs/                # Documentação adicional
```

### **Deploy no Render**
1. **Conectar Repositório:**
   - Conecta repositório GitHub ao Render
   - Configura build automático

2. **Configurar Variáveis:**
   - Adiciona todas as variáveis de ambiente
   - Configura credenciais JSON como string

3. **Deploy Automático:**
   - Deploy automático a cada push na main
   - Logs de monitoramento em tempo real

4. **Banco de Dados:**
   - PostgreSQL fornecido automaticamente
   - DATABASE_URL configurada automaticamente

---

## 📝 Variáveis de Ambiente

### **Configuração Completa (.env)**

```env
# ===== TELEGRAM BOT =====
TELEGRAM_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ123456789

# ===== GOOGLE CLOUD (JSON COMPLETO) =====
GOOGLE_CREDENTIALS={"type":"service_account","project_id":"seu-projeto","private_key_id":"key-id","private_key":"-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA\n-----END PRIVATE KEY-----\n","client_email":"seu-email@projeto.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/seu-email%40projeto.iam.gserviceaccount.com"}

# ===== GOOGLE SHEETS =====
SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEfGhI
SHEET_NAME=Chamados

# ===== BANCO DE DADOS =====
DATABASE_URL=postgresql://user:password@host:5432/database

# ===== E-MAIL SMTP/IMAP =====
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_aplicativo_16_digitos

IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=seu_email@gmail.com
IMAP_PASS=sua_senha_de_aplicativo_16_digitos

# ===== AGENTES IA PARETO =====
PARETO_API_TOKEN=pareto_token_fornecido_pela_plataforma
PARETO_AGENT_ID=agent_123456789_principal
PARETO_REVIEW_AGENT_ID=agent_987654321_revisor

# ===== AMBIENTE =====
NODE_ENV=production
```

### **Detalhamento das Variáveis**

| Variável | Descrição | Formato/Exemplo |
|----------|-----------|-----------------|
| **TELEGRAM_TOKEN** | Token do bot obtido do @BotFather | `123456789:ABCdef...` |
| **GOOGLE_CREDENTIALS** | JSON completo da Service Account Google | `{"type":"service_account",...}` |
| **SHEET_ID** | ID da planilha Google Sheets (da URL) | `1AbCdEfGhIjKlMn...` |
| **SHEET_NAME** | Nome da aba principal dos chamados | `Chamados` |
| **DATABASE_URL** | URL PostgreSQL completa (Render fornece) | `postgresql://user:pass@host:port/db` |
| **SMTP_HOST** | Servidor SMTP para envio | `smtp.gmail.com` |
| **SMTP_PORT** | Porta SMTP | `587` |
| **SMTP_USER** | E-mail para autenticação SMTP | `seu_email@gmail.com` |
| **SMTP_PASS** | Senha de aplicativo Gmail (16 dígitos) | `abcd efgh ijkl mnop` |
| **IMAP_HOST** | Servidor IMAP para recebimento | `imap.gmail.com` |
| **IMAP_PORT** | Porta IMAP | `993` |
| **IMAP_USER** | E-mail para autenticação IMAP | `seu_email@gmail.com` |
| **IMAP_PASS** | Senha de aplicativo Gmail (16 dígitos) | `abcd efgh ijkl mnop` |
| **PARETO_API_TOKEN** | Token de acesso à API Pareto | `token_pareto_fornecido` |
| **PARETO_AGENT_ID** | ID do agente principal Pareto | `agent_123456789` |
| **PARETO_REVIEW_AGENT_ID** | ID do agente revisor Pareto | `agent_987654321` |
| **NODE_ENV** | Ambiente de execução | `production` |

---

## 🏗️ Estrutura do Código

### **Organização Modular**

```javascript
// 1. CONFIGURAÇÕES INICIAIS
- Conexões com banco, APIs, autenticações
- Inicialização de clientes (Telegram, Google, PostgreSQL)

// 2. CATEGORIAS E ESTADO
- Definição de departamentos temporários
- Maps para controle de estado dos usuários

// 3. FUNÇÕES DE BANCO DE DADOS
- buscarUsuario(), salvarUsuario(), atualizarEmailUsuario()

// 4. TRANSCRIÇÃO DE ÁUDIO
- transcreverComGoogle() - integração Speech-to-Text

// 5. PROCESSAMENTO DE ANEXOS
- processarAnexosEmail() - handle de arquivos

// 6. COMUNICAÇÃO COM IA
- consultarAgenteIA() - agente principal
- consultarAgenteRevisor() - agente de revisão

// 7. PLANILHA E E-MAIL
- Funções Google Sheets
- Envio e monitoramento de e-mails

// 8. PROCESSAMENTO PRINCIPAL
- processarMensagem() - lógica central

// 9. HANDLERS TELEGRAM
- Eventos de texto, foto, documento, áudio, voz
- Callbacks de botões inline

// 10. MONITOR DE E-MAILS
- startEmailMonitor() - IMAP listener

// 11. INICIALIZAÇÃO
- iniciarBot() - startup do sistema
```

---

## 🔄 Fluxo de Funcionamento

### **1. Abertura de Chamado Completa**
```mermaid
graph TD
    A[Usuário: "abrir chamado"] --> B[Verifica e-mail cadastrado]
    B --> C[Solicita e-mail se necessário]
    C --> D[Mostra menu de departamentos]
    D --> E[Usuário seleciona departamento]
    E --> F[Solicita descrição detalhada]
    F --> G[IA Revisor analisa descrição]
    G --> H[Mostra resumo + sugestões]
    H --> I{Usuário escolhe ação}
    I --> J[✅ Confirmar] 
    I --> K[📝 Adicionar info]
    I --> L[✏️ Editar descrição]
    J --> M[Gera protocolo]
    M --> N[Registra na planilha]
    N --> O[Envia e-mail com resumo aprovado]
    O --> P[Confirma para usuário]
    K --> Q[Adiciona informação]
    Q --> R[Nova revisão da IA]
    R --> H
    L --> S[Reescreve descrição]
    S --> T[Nova revisão da IA]
    T --> H
```

### **2. Processamento de Áudio**
```
Áudio recebido → Download OGG → Conversão WAV → 
Google Speech → Transcrição → Processamento normal
```

### **3. Resposta por E-mail**
```
E-mail recebido → Extrai protocolo → Atualiza planilha → 
Atualiza status "Em Andamento" → Encontra chat → 
Envia resposta → Processa anexos → Mostra botões
```

### **4. Finalização**
```
Usuário clica "Finalizar" → Atualiza status → 
Remove protocolo → Confirma finalização
```

---

## 🛠️ Serviços Integrados

### **1. Telegram Bot API**
- **Endpoint:** `https://api.telegram.org/bot{token}`
- **Funcionalidades:** Envio/recebimento de mensagens, anexos, callbacks
- **Configuração:** Token obtido via @BotFather

### **2. Google Cloud Speech-to-Text**
- **API:** `@google-cloud/speech` v5.0.0+
- **Configuração:** Service Account JSON em GOOGLE_CREDENTIALS
- **Formatos:** OGG → WAV → Base64 → Transcrição
- **Idioma:** pt-BR (Português Brasil)

### **3. Google Sheets API**
- **API:** `googleapis` v154.1.0+
- **Planilha Principal:** Aba definida em SHEET_NAME
- **Planilha Departamentos:** Aba "DEPARTAMENTOS" (fixa)
- **Operações:** Leitura, escrita, atualização de células

### **4. Agentes IA Pareto**

#### **Agente Principal (PARETO_AGENT_ID)**
- **Função:** Conversação natural e classificação inicial
- **Endpoint:** `https://tess.pareto.io/api/agents/{id}/execute`
- **Modelo:** tess-5
- **Temperature:** 0.7

#### **Agente Revisor (PARETO_REVIEW_AGENT_ID)**
- **Função:** Revisão e formatação de chamados
- **Endpoint:** `https://tess.pareto.io/api/agents/{id}/execute`  
- **Modelo:** tess-5
- **Temperature:** 0.3 (mais conservador)
- **Output:** JSON com resumo_formatado e sugestões

### **5. Gmail SMTP/IMAP**
- **SMTP:** `smtp.gmail.com:587` (TLS)
- **IMAP:** `imap.gmail.com:993` (SSL)
- **Autenticação:** Senha de aplicativo (16 dígitos)
- **Configuração:** 2FA habilitado obrigatório

### **6. PostgreSQL (Render)**
- **Versão:** 14+
- **SSL:** Obrigatório em produção
- **Tabelas:** `usuarios` (telegram_id, nome, email, timestamps)
- **URL:** Fornecida automaticamente pelo Render

### **7. FFmpeg Audio Processing**
- **Biblioteca:** `@ffmpeg-installer/ffmpeg` v1.1.0+
- **Conversão:** OGG → WAV (LINEAR16, 16kHz, mono)
- **Localização:** Instalação automática para Render

---

## 🐛 Troubleshooting

### **Problemas Comuns e Soluções**

#### **1. Erro de Autenticação Google**
```bash
Error: Could not load the default credentials
```
**Solução:** Verificar GOOGLE_CREDENTIALS como string JSON válida

#### **2. FFmpeg não encontrado**
```bash
Error: ffmpeg not found
```
**Solução:** Usar `@ffmpeg-installer/ffmpeg` e `ffmpeg.setFfmpegPath()`

#### **3. Erro IMAP conexão**
```bash
Error: Connection timeout
```
**Solução:** Verificar credenciais Gmail e senha de aplicativo

#### **4. Agente IA não responde**
```bash
Error: Invalid agent response
```
**Solução:** Verificar PARETO_API_TOKEN e IDs dos agentes

#### **5. Banco PostgreSQL desconecta**
```bash
Error: Connection terminated
```
**Solução:** Implementar reconexão automática com retry

### **Debug e Logs**
```javascript
// Ativar logs detalhados
console.log('📝 Texto final do chamado:', textoChamado);
console.log('🤖 Enviando para IA:', mensagem);
console.log('📧 E-mail enviado para:', emails);
```

---

## 🚀 Próximos Passos

### **Funcionalidades Planejadas**
- [ ] **Dashboard Web** para gestão de chamados
- [ ] **Métricas e Relatórios** de performance
- [ ] **Integração WhatsApp** Business API
- [ ] **Sistema de SLA** com alertas
- [ ] **Chatbot Multiidioma** (EN/ES)
- [ ] **API REST** para integrações externas
- [ ] **Notificações Push** para gestores
- [ ] **Sistema de Feedback** dos usuários

### **Melhorias Técnicas**
- [ ] **Cache Redis** para performance
- [ ] **Logs Estruturados** com Winston
- [ ] **Testes Automatizados** com Jest
- [ ] **Docker** para desenvolvimento local
- [ ] **Monitoramento** com Prometheus
- [ ] **Backup Automatizado** do banco
- [ ] **Rate Limiting** para APIs
- [ ] **Webhooks** para integrações

### **Optimizações de IA**
- [ ] **Context Memory** para conversas longas
- [ ] **Training Data** personalizado
- [ ] **Auto-classificação** mais precisa
- [ ] **Sentiment Analysis** das solicitações
- [ ] **Intent Recognition** avançado

---

## 📊 Estatísticas do Projeto

- **Linhas de Código:** ~1.200+
- **Funcionalidades:** 10 principais
- **Integrações:** 7 serviços externos
- **APIs:** 5 diferentes
- **Tecnologias:** 15+
- **Status:** ✅ **PRODUÇÃO ESTÁVEL**

---

## 📜 Histórico de Versões

### **v1.0 - Base Funcional**
- Sistema básico de chamados
- Integração Telegram + Sheets
- Envio de e-mails

### **v1.1 - IA Integrada**
- Agente Pareto principal
- Conversação natural
- Classificação automática

### **v1.2 - Sistema de Anexos**
- Suporte completo a arquivos
- Processamento de anexos
- Sistema bidirecional

### **v1.3 - Transcrição de Áudio**
- Google Speech-to-Text
- Conversão automática OGG→WAV
- Processamento de voz

### **v1.4 - Sistema de Revisão**
- Agente revisor Pareto
- Resumos formatados
- Aprovação de chamados

### **v1.5 - Edição Avançada** ⭐ **ATUAL**
- Edição de descrição principal
- Nova revisão automática
- Uso do resumo aprovado no e-mail/planilha
- Sistema completo de fluxo

---

## 👥 Créditos

**Desenvolvido por:** Equipe de Desenvolvimento KX3 Galtecom  
**IA Powered by:** Plataforma Pareto  
**Cloud Services:** Google Cloud Platform, Render.com  
**Versão:** 1.5 - Janeiro 2025  

---

## 📞 Suporte

Para suporte técnico ou dúvidas:
- **E-mail:** suporte@galtecom.com.br
- **Telegram:** @suporte_kx3
- **Documentação:** Este README.md

---

*Bot CAR KX3 - Transformando o atendimento ao cliente com Inteligência Artificial* 🚀
