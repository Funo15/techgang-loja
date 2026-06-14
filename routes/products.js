// ============================================================
// API DE PRODUTOS (JSON)
// O frontend consome estes endpoints via fetch().
// Nota: os campos de fornecedor/custo NUNCA são expostos ao
// cliente — são dados internos do negócio.
// ============================================================

const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Campos públicos (sem fornecedor, custo, nem margem)
const CAMPOS_PUBLICOS = `
  id, nome, slug, descricao, preco, preco_promo, categoria,
  imagens, destaque, tempo_envio_dias, disponivel,
  rating, num_avaliacoes, tiktok_views, em_tendencia, cores, specs, variantes
`;

// Converte uma row da BD num objeto pronto para o frontend
function publico(row) {
  return {
    ...row,
    imagens: JSON.parse(row.imagens),
    cores: JSON.parse(row.cores),
    specs: JSON.parse(row.specs),
    variantes: JSON.parse(row.variantes || '[]'),
    disponivel: !!row.disponivel,
    destaque: !!row.destaque,
    em_tendencia: !!row.em_tendencia
  };
}

// GET /api/produtos — lista produtos ativos (filtro opcional ?categoria=)
router.get('/produtos', (req, res) => {
  const { categoria } = req.query;
  let rows;
  if (categoria) {
    rows = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM products WHERE ativo = 1 AND categoria = ? ORDER BY destaque DESC, created_at DESC`).all(categoria);
  } else {
    rows = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM products WHERE ativo = 1 ORDER BY destaque DESC, created_at DESC`).all();
  }
  res.json(rows.map(publico));
});

// GET /api/produtos/destaques — produtos em destaque para a home
router.get('/produtos/destaques', (req, res) => {
  const rows = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM products WHERE ativo = 1 AND destaque = 1 ORDER BY created_at DESC`).all();
  res.json(rows.map(publico));
});

// GET /api/categorias — lista de categorias existentes (para filtros)
router.get('/categorias', (req, res) => {
  const rows = db.prepare(`SELECT DISTINCT categoria FROM products WHERE ativo = 1 ORDER BY categoria`).all();
  res.json(rows.map(r => r.categoria));
});

// GET /api/produtos/:slug — detalhe de um produto
router.get('/produtos/:slug', (req, res) => {
  const row = db.prepare(`SELECT ${CAMPOS_PUBLICOS} FROM products WHERE ativo = 1 AND slug = ?`).get(req.params.slug);
  if (!row) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json(publico(row));
});

module.exports = router;
