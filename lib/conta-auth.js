// Autenticação de clientes — sessões em SQLite, passwords com scrypt.

const crypto = require('crypto');
const db = require('../db/database');

const COOKIE = 'tg_cliente';
const SESSION_DAYS = 30;

function gerarSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, buf) => {
      if (err) return reject(err);
      resolve(buf.toString('hex'));
    });
  });
}

async function registar({ nome, email, password }) {
  const salt = gerarSalt();
  const hash = await hashPassword(password, salt);
  try {
    db.prepare('INSERT INTO customers (nome, email, password_hash, salt) VALUES (?, ?, ?, ?)')
      .run(nome.trim(), email.toLowerCase().trim(), hash, salt);
    return { ok: true };
  } catch (e) {
    if (e.message.includes('UNIQUE')) return { ok: false, erro: 'Email já registado.' };
    throw e;
  }
}

async function autenticar(email, password) {
  const c = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  if (!c) return null;
  const hash = await hashPassword(password, c.salt);
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(c.password_hash))) return null;
  return c;
}

function criarSessao(customerId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  db.prepare('INSERT INTO customer_sessions (token, customer_id, expires_at) VALUES (?, ?, ?)')
    .run(token, customerId, expires.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', expires, path: '/' });
}

function getCliente(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const sessao = db.prepare(`
    SELECT c.* FROM customers c
    JOIN customer_sessions s ON s.customer_id = c.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return sessao || null;
}

function terminarSessao(req, res) {
  const token = req.cookies?.[COOKIE];
  if (token) db.prepare('DELETE FROM customer_sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE, { path: '/' });
}

function exigirCliente(req, res, next) {
  const c = getCliente(req);
  if (!c) return res.status(401).json({ erro: 'Não autenticado' });
  req.cliente = c;
  next();
}

async function autenticarOuRegistarGoogle(credential, clientId) {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) throw new Error('Token Google inválido.');
  const p = await r.json();
  if (p.aud !== clientId) throw new Error('Origem não autorizada.');
  if (!p.email_verified || p.email_verified === 'false') throw new Error('Email Google não verificado.');

  const googleId = p.sub;
  const email = p.email.toLowerCase();
  const nome = p.name || email.split('@')[0];

  let c = db.prepare('SELECT * FROM customers WHERE google_id = ?').get(googleId);
  if (!c) {
    c = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    if (c) db.prepare('UPDATE customers SET google_id = ? WHERE id = ?').run(googleId, c.id);
  }
  if (!c) {
    db.prepare('INSERT INTO customers (nome, email, password_hash, salt, google_id) VALUES (?, ?, ?, ?, ?)')
      .run(nome, email, '', '', googleId);
    c = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  }
  return c;
}

module.exports = { registar, autenticar, autenticarOuRegistarGoogle, criarSessao, getCliente, terminarSessao, exigirCliente };
