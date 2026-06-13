// ============================================================
// TECHGANG — SERVIDOR (Fase 1: Fundação)
// Express + SQLite + frontend vanilla servido daqui.
// ============================================================

require('dotenv').config(); // .env primeiro — Stripe/SMTP dependem disto

const express = require('express');
const path = require('path');
const config = require('./config');
const { limitadorGeral, gerarNonce, helmetConfig } = require('./lib/seguranca');
const PATHS = require('./lib/paths');
const { erro500 } = require('./lib/logger');
const { agendarBackupDiario, limparPendentesAntigos } = require('./lib/backup');

// Handlers globais — logar e sair limpo em vez de ficar num estado indefinido
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  process.exit(1);
});

// Inicializa a BD (cria schema + seed na primeira execução)
require('./db/database');

const app = express();

// Nonce por pedido (antes do Helmet — a CSP usa res.locals.nonce)
app.use(gerarNonce);
app.use(helmetConfig);

// Confiar no proxy do Railway para req.ip correto
app.set('trust proxy', 1);

// Webhook do Stripe ANTES do express.json(): a verificação da
// assinatura precisa do raw body, não do JSON já parseado.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripe-webhook'));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(require('cookie-parser')());

// Rate limiting geral na API pública (webhook é skipped automaticamente)
app.use('/api', limitadorGeral);

// Ficheiros estáticos (css, js, imagens)
app.use(express.static(path.join(__dirname, 'public')));
// Imagens de produtos — servidas do volume persistente
app.use('/media', express.static(PATHS.uploads));

// Rotas
app.use('/img', require('./routes/placeholders'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/checkout'));

// Visitantes ao vivo
const visitantes = require('./lib/visitantes');
app.post('/api/ping', (req, res) => {
  visitantes.registar(req, { pagina: req.body.pagina, temCarrinho: req.body.temCarrinho });
  res.json({ ok: true });
});

// Área de cliente
app.use('/api/conta', require('./routes/conta'));

// Admin: API e páginas protegidas por password (.env ADMIN_PASSWORD)
const { exigirAdmin } = require('./lib/admin-auth');
app.get('/api/admin/live', exigirAdmin, (req, res) => visitantes.subscrever(res));
app.use('/api/admin', exigirAdmin, require('./routes/admin-api'));
app.use('/funitocorp', require('./routes/admin-pages'));
app.use('/', require('./routes/pages'));

// Health check — para monitorização externa (Railway, UptimeRobot, etc.)
app.get('/health', (req, res) => res.json({ ok: true }));

// 404 simples para rotas desconhecidas
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ erro: 'Rota não encontrada' });
  res.status(404).send(`<p style="font-family:sans-serif;padding:2rem">Página não encontrada. <a href="/">Voltar à ${config.nome}</a></p>`);
});

// Handler de erros 500 — nunca expõe stack traces em produção
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  erro500(req, err);
  console.error('[500]', err.message);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ erro: 'Erro interno. Tenta novamente.' });
  }
  res.status(500).send(`
    <!doctype html><html lang="pt"><head><meta charset="utf-8">
    <title>Erro — ${config.nome}</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
    .box{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
    h1{color:#6C4BE0;margin-bottom:.5rem}a{color:#6C4BE0}</style></head>
    <body><div class="box"><h1>Ups, algo correu mal</h1>
    <p>Estamos a trabalhar para resolver. <a href="/">Voltar à loja</a></p></div></body></html>
  `);
});

const porta = process.env.PORT || config.porta;
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1'; // Railway usa 0.0.0.0
app.listen(porta, host, () => {
  console.log(`${config.nome} a correr em http://localhost:${porta}`);
  agendarBackupDiario();
  // Limpar encomendas pendentes antigas de hora em hora
  limparPendentesAntigos();
  setInterval(limparPendentesAntigos, 60 * 60 * 1000);
});
