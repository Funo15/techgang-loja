// Backups automáticos da BD SQLite usando better-sqlite3 .backup()
// (backup online: seguro com WAL ativo, nunca faz cp a quente)

const fs = require('fs');
const path = require('path');
const PATHS = require('./paths');
const { enviarParaR2 } = require('./backup-r2');
const { backupConcluido } = require('./logger');

const RETER_DIAS = 14;

function dataNome() {
  // loja-2026-06-12T14-30-00.db (filesystem-safe)
  return `loja-${new Date().toISOString().replace(/:/g, '-').slice(0, 19)}.db`;
}

async function fazerBackup(rotulo, { offsite = true } = {}) {
  // Importação lazy para evitar ciclos na inicialização
  const db = require('../db/database');
  const nome = rotulo ? `loja-${rotulo}.db` : dataNome();
  const destino = path.join(PATHS.backups, nome);
  await db.backup(destino);
  backupConcluido(nome);

  if (offsite) {
    // Erro no R2 não cancela o backup local
    enviarParaR2(destino).catch(err =>
      console.error(`[backup-r2] erro ao enviar offsite: ${err.message}`)
    );
  }

  return { nome, caminho: destino };
}

function limparBackupsAntigos() {
  const limite = Date.now() - RETER_DIAS * 24 * 60 * 60 * 1000;
  let removidos = 0;
  try {
    for (const f of fs.readdirSync(PATHS.backups)) {
      if (!f.startsWith('loja-') || !f.endsWith('.db')) continue;
      const caminho = path.join(PATHS.backups, f);
      const stat = fs.statSync(caminho);
      if (stat.mtimeMs < limite) {
        fs.unlinkSync(caminho);
        removidos++;
      }
    }
  } catch (err) {
    console.error(`[backup] erro ao limpar antigos: ${err.message}`);
  }
  return removidos;
}

function agendarBackupDiario() {
  const agora = new Date();
  // Próxima execução às 03:00
  const proximo = new Date(agora);
  proximo.setHours(3, 0, 0, 0);
  if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);

  const ms = proximo - agora;
  setTimeout(async () => {
    try {
      const { nome } = await fazerBackup();
      const removidos = limparBackupsAntigos();
      console.log(`[backup] diário concluído: ${nome} (${removidos} antigos removidos)`);
    } catch (err) {
      console.error(`[backup] erro no backup diário: ${err.message}`);
    }
    // Reagendar para o dia seguinte (intervalo de 24h)
    setInterval(async () => {
      try {
        const { nome } = await fazerBackup();
        const removidos = limparBackupsAntigos();
        console.log(`[backup] diário concluído: ${nome} (${removidos} antigos removidos)`);
      } catch (err) {
        console.error(`[backup] erro no backup diário: ${err.message}`);
      }
    }, 24 * 60 * 60 * 1000);
  }, ms);

  console.log(`[backup] agendado para ${proximo.toISOString()}`);
}

module.exports = { fazerBackup, limparBackupsAntigos, agendarBackupDiario };
