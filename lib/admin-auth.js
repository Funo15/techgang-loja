// ============================================================
// AUTENTICAÇÃO DO ADMIN
// Password + 2FA TOTP (Google Authenticator).
// Sessão = cookie HMAC-SHA256 assinado. Mudar a password
// invalida todas as sessões (segredo derivado dela).
// ============================================================

const crypto = require('crypto');

const NOME_COOKIE      = 'tg_admin';
const NOME_PREAUTH     = 'tg_admin_pre';
const DURACAO_MS       = 7 * 24 * 60 * 60 * 1000; // 7 dias
const DURACAO_PREAUTH  = 5 * 60 * 1000;            // 5 minutos

function segredo() {
  return crypto.createHash('sha256')
    .update(`techgang-admin|${process.env.ADMIN_PASSWORD || ''}`)
    .digest();
}

function assinar(texto) {
  return crypto.createHmac('sha256', segredo()).update(texto).digest('hex');
}

function compararSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function passwordCorreta(tentativa) {
  if (!process.env.ADMIN_PASSWORD) return false;
  return compararSeguro(tentativa || '', process.env.ADMIN_PASSWORD);
}

function criarCookie(res) {
  const expira = Date.now() + DURACAO_MS;
  res.cookie(NOME_COOKIE, `${expira}.${assinar(String(expira))}`, {
    httpOnly: true,
    secure: !!process.env.PORT,
    sameSite: 'lax',
    maxAge: DURACAO_MS,
    path: '/'
  });
}

function limparCookie(res) {
  res.clearCookie(NOME_COOKIE, { path: '/' });
}

function sessaoValida(req) {
  const valor = req.cookies?.[NOME_COOKIE];
  if (!valor || !process.env.ADMIN_PASSWORD) return false;
  const [expira, sig] = valor.split('.');
  if (!expira || !sig) return false;
  if (Number(expira) < Date.now()) return false;
  return compararSeguro(sig, assinar(expira));
}

// ── TOTP ────────────────────────────────────────────────────

function totpAtivo() {
  return !!process.env.ADMIN_TOTP_SECRET;
}

function verificarTotp(codigo) {
  if (!totpAtivo()) return false;
  const { authenticator } = require('otplib');
  return authenticator.verify({ token: codigo, secret: process.env.ADMIN_TOTP_SECRET });
}

function gerarSegredoTotp() {
  const { authenticator } = require('otplib');
  return authenticator.generateSecret();
}

// Cookie temporário enquanto aguarda o código TOTP (5 min)
function criarCookiePreAuth(res) {
  const expira = Date.now() + DURACAO_PREAUTH;
  res.cookie(NOME_PREAUTH, `${expira}.${assinar('pre|' + expira)}`, {
    httpOnly: true,
    secure: !!process.env.PORT,
    sameSite: 'lax',
    maxAge: DURACAO_PREAUTH,
    path: '/'
  });
}

function limparCookiePreAuth(res) {
  res.clearCookie(NOME_PREAUTH, { path: '/' });
}

function preAuthValida(req) {
  const valor = req.cookies?.[NOME_PREAUTH];
  if (!valor) return false;
  const [expira, sig] = valor.split('.');
  if (!expira || !sig) return false;
  if (Number(expira) < Date.now()) return false;
  return compararSeguro(sig, assinar('pre|' + expira));
}

// ── Middleware ───────────────────────────────────────────────

function exigirAdmin(req, res, next) {
  if (sessaoValida(req)) return next();
  if (req.path.startsWith('/api') || req.baseUrl.startsWith('/api')) {
    return res.status(401).json({ erro: 'Sessão expirada. Volta a entrar.' });
  }
  res.redirect('/funitocorp/login');
}

module.exports = {
  passwordCorreta, criarCookie, limparCookie, sessaoValida,
  totpAtivo, verificarTotp, gerarSegredoTotp,
  criarCookiePreAuth, limparCookiePreAuth, preAuthValida,
  exigirAdmin
};
