// ============================================================
// AUTENTICAÇÃO DO ADMIN
// Password única no .env (ADMIN_PASSWORD). Sessão = cookie
// httpOnly assinado manualmente com HMAC-SHA256 (sem dependências
// de sessão): valor "expiraEm.assinatura". Mudar a password
// invalida todas as sessões (o segredo deriva dela).
// ============================================================

const crypto = require('crypto');

const NOME_COOKIE = 'tg_admin';
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function segredo() {
  // Derivado da password: trocá-la corta as sessões ativas
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

// Middleware: protege /admin/* (HTML → redirect) e /api/admin/* (JSON → 401)
function exigirAdmin(req, res, next) {
  if (sessaoValida(req)) return next();
  if (req.path.startsWith('/api') || req.baseUrl.startsWith('/api')) {
    return res.status(401).json({ erro: 'Sessão expirada. Volta a entrar.' });
  }
  res.redirect('/admin/login');
}

module.exports = { passwordCorreta, criarCookie, limparCookie, sessaoValida, exigirAdmin };
