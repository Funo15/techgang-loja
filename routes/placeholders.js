// ============================================================
// IMAGENS PLACEHOLDER DOS PRODUTOS
// Gera SVGs às riscas lilás com a etiqueta "# slug · vista N"
// (o visual da referência). Quando houver fotos reais dos
// fornecedores, basta trocar os URLs em products.imagens —
// esta rota continua a funcionar para produtos sem foto.
// ============================================================

const express = require('express');
const router = express.Router();

// GET /img/p/:slug/:n.svg
router.get('/p/:slug/:n.svg', (req, res) => {
  const slug = String(req.params.slug).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  const n = Math.max(1, Math.min(9, parseInt(req.params.n, 10) || 1));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125" viewBox="0 0 900 1125">
  <defs>
    <pattern id="riscas" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="64" height="64" fill="#F4F1FC"/>
      <rect width="32" height="64" fill="#EAE4F9"/>
    </pattern>
  </defs>
  <rect width="900" height="1125" fill="url(#riscas)"/>
  <g font-family="IBM Plex Mono, SFMono-Regular, Menlo, monospace" font-size="26">
    <rect x="${450 - (slug.length + 12) * 8.2}" y="528" width="${(slug.length + 12) * 16.4}" height="56" rx="12" fill="#FFFFFF" opacity="0.6"/>
    <text x="450" y="565" text-anchor="middle" fill="#A89FC9"># ${slug} · vista ${n}</text>
  </g>
</svg>`;

  res.type('image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

module.exports = router;
