// ============================================================
// ROTAS DE PÁGINAS (HTML)
// Mini-renderer de templates: lê a view, injeta partials
// ({{include:nome}}) e substitui tokens {{...}} a partir do
// config.js. Assim o branding nunca fica hardcoded no HTML.
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const router = express.Router();
const VIEWS = path.join(__dirname, '..', 'views');

// Gera o bloco de variáveis CSS a partir das cores do config
function cssVars() {
  const c = config.cores;
  const f = config.fontes;
  return `:root {
    --cor-fundo: ${c.fundo};
    --cor-fundo-elevado: ${c.fundoElevado};
    --cor-linha: ${c.linha};
    --cor-texto: ${c.texto};
    --cor-texto-suave: ${c.textoSuave};
    --cor-acento: ${c.acento};
    --cor-acento-texto: ${c.acentoTexto};
    --cor-acento-claro: ${c.acentoClaro};
    --cor-ink: ${c.ink};
    --cor-ink-texto: ${c.inkTexto};
    --cor-perigo: ${c.perigo};
    --fonte-titulo: '${f.titulo}', sans-serif;
    --fonte-corpo: '${f.corpo}', sans-serif;
    --fonte-mono: '${f.mono}', monospace;
  }`;
}

// Config público para o frontend (só o que o browser precisa)
function configPublico() {
  return JSON.stringify({
    nome: config.nome,
    tagline: config.tagline,
    emailContacto: config.emailContacto,
    moeda: config.moeda,
    portes: config.portes,
    portesGratisAPartirDe: config.portesGratisAPartirDe,
    pixelMeta: process.env.META_PIXEL_ID || null,
    pixelTikTok: process.env.TIKTOK_PIXEL_ID || null
  });
}

// Pixels: IDs injetados como config — o carregamento real é feito por cookies.js
// APENAS após consentimento do utilizador (RGPD).
function pixelsHtml() {
  const meta = process.env.META_PIXEL_ID || '';
  const tiktok = process.env.TIKTOK_PIXEL_ID || '';
  if (!meta && !tiktok) return '';
  return `<script>window.PIXELS={meta:"${meta}",tiktok:"${tiktok}"};<\/script>`;
}

// Renderiza uma view: resolve partials e substitui tokens
function render(nomeView, extra = {}) {
  let html = fs.readFileSync(path.join(VIEWS, `${nomeView}.html`), 'utf8');

  // Partials: {{include:header}} → conteúdo de views/partials/header.html
  html = html.replace(/\{\{include:([a-z0-9-]+)\}\}/g, (_, nome) =>
    fs.readFileSync(path.join(VIEWS, 'partials', `${nome}.html`), 'utf8')
  );

  // Tokens de branding + extras da página
  const tokens = {
    NOME: config.nome,
    TAGLINE: config.tagline,
    EMAIL: config.emailContacto,
    CSS_VARS: cssVars(),
    CONFIG_JSON: configPublico(),
    PIXELS: pixelsHtml(),
    FONTE_TITULO: config.fontes.titulo.replace(/ /g, '+'),
    FONTE_CORPO: config.fontes.corpo.replace(/ /g, '+'),
    FONTE_MONO: config.fontes.mono.replace(/ /g, '+'),
    ANO: String(new Date().getFullYear()),
    ...extra
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, chave) => tokens[chave] ?? m);
}

// --- Páginas ---
router.get('/', (req, res) => res.send(render('home', { TITULO: config.nome })));
router.get('/produtos', (req, res) => res.send(render('produtos', { TITULO: `Produtos | ${config.nome}` })));
router.get('/produto/:slug', (req, res) => res.send(render('produto', { TITULO: config.nome })));
router.get('/carrinho', (req, res) => res.send(render('carrinho', { TITULO: `Carrinho | ${config.nome}` })));
router.get('/checkout', (req, res) => res.send(render('checkout', { TITULO: `Checkout | ${config.nome}` })));
router.get('/obrigado', (req, res) => res.send(render('obrigado', { TITULO: `Obrigado | ${config.nome}` })));

// Páginas legais (conteúdo placeholder nesta fase)
router.get('/termos', (req, res) => res.send(render('termos', { TITULO: `Termos e Condições | ${config.nome}` })));
router.get('/privacidade', (req, res) => res.send(render('privacidade', { TITULO: `Política de Privacidade | ${config.nome}` })));
router.get('/devolucoes', (req, res) => res.send(render('devolucoes', { TITULO: `Trocas e Devoluções | ${config.nome}` })));
router.get('/contactos', (req, res) => res.send(render('contactos', { TITULO: `Contactos | ${config.nome}` })));

// Área de cliente
const { getCliente } = require('../lib/conta-auth');
router.get('/conta', (req, res) => {
  const c = getCliente(req);
  if (c) return res.redirect('/conta/encomendas');
  res.send(render('conta', { TITULO: `A minha conta | ${config.nome}` }));
});
router.get('/conta/encomendas', (req, res) => {
  const c = getCliente(req);
  if (!c) return res.redirect('/conta');
  res.send(render('conta-encomendas', { TITULO: `As minhas encomendas | ${config.nome}` }));
});
router.get('/conta/encomenda/:numero', (req, res) => {
  const c = getCliente(req);
  if (!c) return res.redirect('/conta');
  res.send(render('conta-encomenda', { TITULO: `Encomenda | ${config.nome}` }));
});

module.exports = router;
