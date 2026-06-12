// Visitantes ao vivo — memória simples, sem BD.
// Cada ping regista { pagina, temCarrinho, ts }. Expire após 90 segundos.

const EXPIRAR = 90 * 1000;
const visitas = new Map(); // chave: ip+ua (anónimo)

let db;
function getDb() {
  if (!db) db = require('../db/database');
  return db;
}

function registar(req, { pagina, temCarrinho }) {
  const chave = (req.ip || '') + (req.headers['user-agent'] || '').slice(0, 40);
  visitas.set(chave, { pagina, temCarrinho: !!temCarrinho, ts: Date.now() });
  // Persiste visitante único do dia para taxa de conversão
  try {
    getDb().prepare('INSERT OR IGNORE INTO daily_visitors (hash, dia) VALUES (?, date("now"))').run(chave);
  } catch {}
}

function contar() {
  const agora = Date.now();
  let total = 0, checkout = 0, comCarrinho = 0;
  for (const [k, v] of visitas) {
    if (agora - v.ts > EXPIRAR) { visitas.delete(k); continue; }
    total++;
    if (v.pagina === 'checkout') checkout++;
    if (v.temCarrinho) comCarrinho++;
  }
  return { total, checkout, comCarrinho };
}

// SSE — admin subscreve e recebe actualizações a cada 5s
const subscritores = new Set();

function subscrever(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const enviar = () => {
    const dados = contar();
    res.write(`data: ${JSON.stringify(dados)}\n\n`);
  };

  enviar();
  const timer = setInterval(enviar, 5000);
  subscritores.add(timer);

  res.on('close', () => {
    clearInterval(timer);
    subscritores.delete(timer);
  });
}

module.exports = { registar, contar, subscrever };
