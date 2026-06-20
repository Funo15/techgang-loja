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
const db = require('../db/database');

const router = express.Router();
const VIEWS = path.join(__dirname, '..', 'views');
const BASE = (process.env.BASE_URL || 'https://techgang.pt').replace(/\/$/, '');
const OG_IMAGE_DEFAULT = BASE + '/media/p-1781718119907-j3fzj3.webp';

// Escapa para usar em atributos HTML (meta content, title)
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Normaliza e corta uma meta description (~160 chars)
function metaDesc(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}
function imgAbs(u) { return !u ? OG_IMAGE_DEFAULT : (/^https?:/.test(u) ? u : BASE + u); }
// Bloco JSON-LD com nonce (CSP) e < escapado
function jsonLd(obj, nonce) {
  return `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}
// Extras comuns: canonical a partir do caminho do pedido
function seo(req, extra) {
  return { CANONICAL: BASE + req.path.replace(/\/$/, '') || BASE, ...extra };
}

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
function pixelsHtml(nonce) {
  const meta = process.env.META_PIXEL_ID || '';
  const tiktok = process.env.TIKTOK_PIXEL_ID || '';
  if (!meta && !tiktok) return '';
  return `<script nonce="${nonce}">window.PIXELS={meta:"${meta}",tiktok:"${tiktok}"};<\/script>`;
}

// Renderiza uma view: resolve partials e substitui tokens
function render(nomeView, extra = {}) {
  let html = fs.readFileSync(path.join(VIEWS, `${nomeView}.html`), 'utf8');

  // Partials: {{include:header}} → conteúdo de views/partials/header.html
  html = html.replace(/\{\{include:([a-z0-9-]+)\}\}/g, (_, nome) =>
    fs.readFileSync(path.join(VIEWS, 'partials', `${nome}.html`), 'utf8')
  );

  const nonce = extra.NONCE || '';
  // Tokens de branding + extras da página
  const tokens = {
    NOME: config.nome,
    TAGLINE: config.tagline,
    EMAIL: config.emailContacto,
    CSS_VARS: cssVars(),
    CONFIG_JSON: configPublico(),
    PIXELS: pixelsHtml(nonce),
    NONCE: nonce,
    // Defaults SEO (cada rota pode sobrepor via extra)
    META_DESC: escAttr(metaDesc(config.tagline)),
    OG_TYPE: 'website',
    OG_TITLE: escAttr(config.nome),
    OG_IMAGE: OG_IMAGE_DEFAULT,
    CANONICAL: BASE,
    JSONLD: '',
    FONTE_TITULO: config.fontes.titulo.replace(/ /g, '+'),
    FONTE_CORPO: config.fontes.corpo.replace(/ /g, '+'),
    FONTE_MONO: config.fontes.mono.replace(/ /g, '+'),
    ANO: String(new Date().getFullYear()),
    ...extra
  };
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, chave) => tokens[chave] ?? m);
}

// --- Páginas ---
router.get('/', (req, res) => {
  const ld = [
    { "@context": "https://schema.org", "@type": "Organization", name: config.nome, url: BASE, logo: BASE + '/favicon-180.png' },
    { "@context": "https://schema.org", "@type": "WebSite", name: config.nome, url: BASE }
  ];
  res.send(render('home', seo(req, {
    TITULO: `${config.nome} — ${config.tagline}`,
    META_DESC: escAttr(metaDesc(config.tagline)),
    OG_TITLE: escAttr(config.nome),
    CANONICAL: BASE,
    JSONLD: jsonLd(ld, res.locals.nonce),
    NONCE: res.locals.nonce
  })));
});

router.get('/produtos', (req, res) => res.send(render('produtos', seo(req, {
  TITULO: `Todos os Produtos | ${config.nome}`,
  META_DESC: escAttr(`Gadgets e tecnologia escolhidos a dedo na ${config.nome}. Envio com tracking, pagamento seguro e 14 dias para devolver.`),
  OG_TITLE: escAttr(`Produtos | ${config.nome}`),
  NONCE: res.locals.nonce
}))));

router.get('/produto/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE ativo = 1 AND slug = ?').get(req.params.slug);
  if (!p) return res.status(404).send(render('produto', seo(req, { TITULO: `Produto | ${config.nome}`, NONCE: res.locals.nonce })));
  const imagens = JSON.parse(p.imagens || '[]');
  const precoEur = ((p.preco_promo ?? p.preco) / 100).toFixed(2);
  const desc = metaDesc(p.descricao || `${p.nome} — disponível na ${config.nome}. Envio com tracking e 14 dias para devolver.`);
  const ld = {
    "@context": "https://schema.org/", "@type": "Product",
    name: p.nome,
    image: imagens.map(imgAbs),
    description: desc,
    brand: { "@type": "Brand", name: config.nome },
    offers: {
      "@type": "Offer", url: BASE + '/produto/' + p.slug, priceCurrency: 'EUR', price: precoEur,
      availability: p.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };
  if (p.num_avaliacoes > 0) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: String(p.rating), reviewCount: String(p.num_avaliacoes) };
  res.send(render('produto', seo(req, {
    TITULO: escAttr(`${p.nome} | ${config.nome}`),
    META_DESC: escAttr(desc),
    OG_TYPE: 'product',
    OG_TITLE: escAttr(p.nome),
    OG_IMAGE: escAttr(imgAbs(imagens[0])),
    JSONLD: jsonLd(ld, res.locals.nonce),
    NONCE: res.locals.nonce
  })));
});
router.get('/carrinho', (req, res) => res.send(render('carrinho', { TITULO: `Carrinho | ${config.nome}`, NONCE: res.locals.nonce })));
router.get('/checkout', (req, res) => res.send(render('checkout', { TITULO: `Checkout | ${config.nome}`, NONCE: res.locals.nonce })));
router.get('/obrigado', (req, res) => res.send(render('obrigado', { TITULO: `Obrigado | ${config.nome}`, NONCE: res.locals.nonce })));

// Páginas legais
router.get('/termos', (req, res) => res.send(render('termos', seo(req, { TITULO: `Termos e Condições | ${config.nome}`, NONCE: res.locals.nonce }))));
router.get('/privacidade', (req, res) => res.send(render('privacidade', seo(req, { TITULO: `Política de Privacidade | ${config.nome}`, NONCE: res.locals.nonce }))));
router.get('/devolucoes', (req, res) => res.send(render('devolucoes', seo(req, { TITULO: `Trocas e Devoluções | ${config.nome}`, META_DESC: escAttr('Trocas e devoluções até 14 dias, sem complicações. Sabe como na ' + config.nome + '.'), NONCE: res.locals.nonce }))));
router.get('/contactos', (req, res) => res.send(render('contactos', seo(req, { TITULO: `Contactos | ${config.nome}`, META_DESC: escAttr('Fala connosco. Respondemos em menos de 24h úteis. Apoio ao cliente da ' + config.nome + '.'), NONCE: res.locals.nonce }))));

// SEO: sitemap.xml (estático + produtos ativos)
router.get('/sitemap.xml', (req, res) => {
  let prods = [];
  try { prods = db.prepare('SELECT slug FROM products WHERE ativo = 1').all(); } catch {}
  const estaticas = ['', '/produtos', '/contactos', '/termos', '/privacidade', '/devolucoes'];
  const urls = [...estaticas.map(p => BASE + p), ...prods.map(p => BASE + '/produto/' + p.slug)];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>';
  res.type('application/xml').send(xml);
});

// Área de cliente
const { getCliente } = require('../lib/conta-auth');
router.get('/conta', (req, res) => {
  const c = getCliente(req);
  if (c) return res.redirect('/conta/encomendas');
  res.send(render('conta', {
    TITULO: `A minha conta | ${config.nome}`,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    BASE_URL: process.env.BASE_URL || 'http://localhost:3002',
    NONCE: res.locals.nonce
  }));
});
router.get('/conta/encomendas', (req, res) => {
  const c = getCliente(req);
  if (!c) return res.redirect('/conta');
  res.send(render('conta-encomendas', { TITULO: `As minhas encomendas | ${config.nome}`, NONCE: res.locals.nonce }));
});
router.get('/conta/encomenda/:numero', (req, res) => {
  const c = getCliente(req);
  if (!c) return res.redirect('/conta');
  res.send(render('conta-encomenda', { TITULO: `Encomenda | ${config.nome}`, NONCE: res.locals.nonce }));
});

module.exports = router;
