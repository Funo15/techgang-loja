// Logging estruturado para segurança e negócio.
// Escreve em ficheiros no volume persistente.
// NUNCA escreve: passwords, tokens de sessão, dados de cartão.

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');

const MAX_TAMANHO = 10 * 1024 * 1024; // 10 MB antes de rodar

function linha(nivel, tipo, dados) {
  const entrada = { ts: new Date().toISOString(), nivel, tipo, ...dados };
  return JSON.stringify(entrada) + '\n';
}

function escrever(ficheiro, texto) {
  try {
    // Rotação simples: renomeia para .old quando passa 10 MB
    if (fs.existsSync(ficheiro)) {
      const stat = fs.statSync(ficheiro);
      if (stat.size > MAX_TAMANHO) {
        fs.renameSync(ficheiro, ficheiro + '.old');
      }
    }
    fs.appendFileSync(ficheiro, texto);
  } catch (err) {
    // Falha de log não deve matar o servidor
    console.error(`[logger] erro ao escrever ${ficheiro}: ${err.message}`);
  }
}

// Caminho para os ficheiros de log
const SEG_LOG = path.join(PATHS.logs, 'security.log');
const NEG_LOG = path.join(PATHS.logs, 'business.log');

// ── Segurança ────────────────────────────────────────────────

function logSeguranca(tipo, dados) {
  escrever(SEG_LOG, linha('SEG', tipo, dados));
}

// Atalhos usados nos routes
function loginFalhou(ip, identificador) {
  logSeguranca('login_falhou', { ip, id: identificador });
}

function webhookInvalido(ip, motivo) {
  logSeguranca('webhook_invalido', { ip, motivo });
}

function erro500(req, err) {
  logSeguranca('erro_500', { ip: req.ip, method: req.method, path: req.path, msg: err.message });
}

// ── Negócio ─────────────────────────────────────────────────

function logNegocio(tipo, dados) {
  escrever(NEG_LOG, linha('NEG', tipo, dados));
}

function encomendaCriada(numero, total) {
  logNegocio('encomenda_criada', { numero, total });
}

function encomendaPaga(numero, metodo) {
  logNegocio('encomenda_paga', { numero, metodo });
}

function estadoAlterado(numero, campo, valor) {
  logNegocio('estado_alterado', { numero, campo, valor });
}

function backupConcluido(nome) {
  logNegocio('backup', { nome });
}

module.exports = {
  logSeguranca, loginFalhou, webhookInvalido, erro500,
  logNegocio, encomendaCriada, encomendaPaga, estadoAlterado, backupConcluido,
  SEG_LOG, NEG_LOG
};
