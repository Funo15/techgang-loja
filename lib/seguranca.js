// Configurações de segurança centralizadas.

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Gera um nonce único por pedido — usado na CSP para permitir scripts inline
// específicos sem recorrer a 'unsafe-inline'. Deve correr ANTES do helmetConfig.
function gerarNonce(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}

const emProducao = !!process.env.PORT; // Railway injeta PORT; localmente não existe

// ── Rate limiters ────────────────────────────────────────────

// API pública — travar scraping sem afetar utilizadores normais
const limitadorGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Demasiados pedidos. Tenta novamente em 15 minutos.' },
  skip: (req) => req.path === '/api/stripe/webhook' // webhook nunca limitado
});

// Login admin — máx 5 por IP em 15 min (instância própria)
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Demasiadas tentativas. Aguarda 15 minutos antes de voltar a tentar.' },
  skipSuccessfulRequests: true
});

// Registo/login de clientes — instância separada para não interferir com admin
const limitadorConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Demasiadas tentativas. Aguarda 15 minutos antes de voltar a tentar.' },
  skipSuccessfulRequests: true
});

// ── Delay progressivo no login admin ────────────────────────

const falhasAdmin = new Map(); // ip → { tentativas, ultimaFalha }
const JANELA_FALHAS = 15 * 60 * 1000; // 15 min
const DELAY_POR_FALHA_MS = 1000; // 1s extra por tentativa (máx 5s)

function registarFalhaAdmin(ip) {
  const agora = Date.now();
  const entrada = falhasAdmin.get(ip) || { tentativas: 0, ultimaFalha: 0 };
  if (agora - entrada.ultimaFalha > JANELA_FALHAS) entrada.tentativas = 0;
  entrada.tentativas++;
  entrada.ultimaFalha = agora;
  falhasAdmin.set(ip, entrada);
}

function limparFalhasAdmin(ip) {
  falhasAdmin.delete(ip);
}

function delayAdmin(req, res, next) {
  const ip = req.ip || '';
  const entrada = falhasAdmin.get(ip);
  if (!entrada || Date.now() - entrada.ultimaFalha > JANELA_FALHAS) return next();
  const delay = Math.min(entrada.tentativas * DELAY_POR_FALHA_MS, 5000);
  if (delay > 0) return setTimeout(next, delay);
  next();
}

// ── Helmet (headers de segurança) ───────────────────────────

const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.nonce}'`, // nonce por pedido (gerarNonce corre antes)
        'https://js.stripe.com',
        'https://connect.facebook.net',
        'https://analytics.tiktok.com',
        'https://accounts.google.com'
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",          // CSS vars injetados pelo servidor
        'https://fonts.googleapis.com'
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://www.facebook.com',
        'https://ae-pic-a1.aliexpress-media.com',
        'https://ae01.alicdn.com',
        'https://ae-pic-b1.aliexpress-media.com',
      ],
      frameSrc: ['https://js.stripe.com', 'https://accounts.google.com'],
      connectSrc: [
        "'self'",
        'https://api.stripe.com',
        'https://analytics.tiktok.com',
        'https://oauth2.googleapis.com'
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://accounts.google.com'], // login Google usa redirect
      frameAncestors: ["'none'"] // anti-clickjacking ao nível da CSP
    }
  },
  crossOriginEmbedderPolicy: false, // evita partir uploads de imagem
  hsts: emProducao
    ? { maxAge: 63072000, includeSubDomains: true } // 2 anos — só em HTTPS
    : false,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true
});

module.exports = { limitadorGeral, limitadorAuth, limitadorConta, delayAdmin, registarFalhaAdmin, limparFalhasAdmin, gerarNonce, helmetConfig };
