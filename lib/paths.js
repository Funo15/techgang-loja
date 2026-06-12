// Paths persistentes — em Railway usa /data (volume), localmente usa ./local-data
// Nunca guardar DB, uploads ou logs no filesystem efémero do container.

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'local-data');

const PATHS = {
  data:    DATA_DIR,
  db:      path.join(DATA_DIR, 'loja.db'),
  uploads: path.join(DATA_DIR, 'uploads', 'produtos'),
  backups: path.join(DATA_DIR, 'backups'),
  logs:    path.join(DATA_DIR, 'logs')
};

// Criar directórios na inicialização
for (const p of [PATHS.uploads, PATHS.backups, PATHS.logs]) {
  fs.mkdirSync(p, { recursive: true });
}

module.exports = PATHS;
