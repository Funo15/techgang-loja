// ============================================================
// PÁGINAS DO ADMIN (/admin/*)
// /admin/login é a única página pública; todas as outras
// passam pelo middleware exigirAdmin (cookie assinado).
// Reutiliza o mini-renderer de pages.js via require.
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { passwordCorreta, criarCookie, limparCookie, sessaoValida, exigirAdmin } = require('../lib/admin-auth');

const router = express.Router();
const VIEWS = path.join(__dirname, '..', 'views');

// Renderer próprio (igual ao de pages.js, mas para views/admin/*)
function render(nomeView, extra = {}) {
  let html = fs.readFileSync(path.join(VIEWS, 'admin', `${nomeView}.html`), 'utf8');
  html = html.replace(/\{\{include:([a-z0-9-]+)\}\}/g, (_, nome) =>
    fs.readFileSync(path.join(VIEWS, 'partials', `${nome}.html`), 'utf8')
  );
  const c = config.cores;
  const f = config.fontes;
  const tokens = {
    NOME: config.nome,
    TAGLINE: config.tagline,
    CSS_VARS: `:root{--cor-fundo:${c.fundo};--cor-fundo-elevado:${c.fundoElevado};--cor-linha:${c.linha};--cor-texto:${c.texto};--cor-texto-suave:${c.textoSuave};--cor-acento:${c.acento};--cor-acento-texto:${c.acentoTexto};--cor-perigo:${c.perigo};--fonte-titulo:'${f.titulo}',sans-serif;--fonte-corpo:'${f.corpo}',sans-serif;--fonte-mono:'${f.mono}',monospace;}`,
    FONTE_TITULO: f.titulo.replace(/ /g, '+'),
    FONTE_CORPO: f.corpo.replace(/ /g, '+'),
    FONTE_MONO: f.mono.replace(/ /g, '+'),
    ANO: String(new Date().getFullYear()),
    ...extra
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, chave) => tokens[chave] ?? m);
}

// --- Login (público) ---
router.get('/login', (req, res) => {
  if (sessaoValida(req)) return res.redirect('/admin');
  res.send(render('login', { TITULO: `Admin | ${config.nome}` }));
});

router.post('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ erro: 'ADMIN_PASSWORD não está definida no .env.' });
  }
  if (!passwordCorreta(req.body?.password)) {
    return res.status(401).json({ erro: 'Password errada.' });
  }
  criarCookie(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  limparCookie(res);
  res.json({ ok: true });
});

// --- Páginas protegidas ---
router.use(exigirAdmin);
router.get('/', (req, res) => res.send(render('dashboard', { TITULO: `Admin | ${config.nome}` })));
router.get('/encomendas', (req, res) => res.send(render('encomendas', { TITULO: `Encomendas | Admin ${config.nome}` })));
router.get('/encomendas/:numero', (req, res) => res.send(render('encomenda', { TITULO: `${req.params.numero} | Admin ${config.nome}` })));
router.get('/produtos', (req, res) => res.send(render('produtos', { TITULO: `Produtos | Admin ${config.nome}` })));
router.get('/produtos/novo', (req, res) => res.send(render('produto-form', { TITULO: `Novo produto | Admin ${config.nome}` })));
router.get('/produtos/:id', (req, res) => res.send(render('produto-form', { TITULO: `Editar produto | Admin ${config.nome}` })));

module.exports = router;
