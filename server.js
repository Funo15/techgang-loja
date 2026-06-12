// ============================================================
// TECHGANG — SERVIDOR (Fase 1: Fundação)
// Express + SQLite + frontend vanilla servido daqui.
// ============================================================

require('dotenv').config(); // .env primeiro — Stripe/SMTP dependem disto

const express = require('express');
const path = require('path');
const config = require('./config');
const { limitadorGeral, helmetConfig } = require('./lib/seguranca');

// Inicializa a BD (cria schema + seed na primeira execução)
require('./db/database');

const app = express();

// Headers de segurança (antes de tudo)
app.use(helmetConfig);

// Confiar no proxy do Railway para req.ip correto
app.set('trust proxy', 1);

// Webhook do Stripe ANTES do express.json(): a verificação da
// assinatura precisa do raw body, não do JSON já parseado.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripe-webhook'));

app.use(express.json({ limit: '100kb' }));
app.use(require('cookie-parser')());

// Rate limiting geral na API pública (webhook é skipped automaticamente)
app.use('/api', limitadorGeral);

// Ficheiros estáticos (css, js, imagens)
app.use(express.static(path.join(__dirname, 'public')));

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
app.use('/admin', require('./routes/admin-pages'));
app.use('/', require('./routes/pages'));

// 404 simples para rotas desconhecidas
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ erro: 'Rota não encontrada' });
  res.status(404).send(`<p style="font-family:sans-serif;padding:2rem">Página não encontrada. <a href="/">Voltar à ${config.nome}</a></p>`);
});

const porta = process.env.PORT || config.porta;
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1'; // Railway usa 0.0.0.0
app.listen(porta, host, () => {
  console.log(`${config.nome} a correr em http://localhost:${porta}`);
});
