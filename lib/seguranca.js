// Configurações de segurança centralizadas.

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

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
        "'unsafe-inline'",          // CSS vars + config inline (window.LOJA)
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
        'https://www.facebook.com', // Meta Pixel noscript pixel
        'blob:'
      ],
      frameSrc: ['https://js.stripe.com', 'https://accounts.google.com'],
      connectSrc: [
        "'self'",
        'https://api.stripe.com',
        'https://analytics.tiktok.com',
        'https://oauth2.googleapis.com'
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
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

module.exports = { limitadorGeral, limitadorAuth, limitadorConta, delayAdmin, registarFalhaAdmin, limparFalhasAdmin, helmetConfig };
