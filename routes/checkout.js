// ============================================================
// CHECKOUT (Fase 2)
// POST /api/checkout — valida o carrinho NO SERVIDOR (preços
// lidos sempre da BD, nunca do cliente), cria a order com
// estado_pagamento "pendente" e devolve o URL da Stripe
// Checkout Session (modo hosted).
// GET /api/encomendas/:numero — estado mínimo para a página
// /obrigado (sem morada nem dados sensíveis).
// ============================================================

const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const config = require('../config');
const { encomendaCriada } = require('../lib/logger');

// Token de verificação de encomenda: HMAC curto derivado do número.
// Vai no URL da página /obrigado e é exigido na API pública.
function tokenEncomenda(numero) {
  return crypto
    .createHmac('sha256', process.env.ADMIN_PASSWORD || 'tg-fallback-secret')
    .update(numero)
    .digest('hex')
    .slice(0, 24);
}

const router = express.Router();

// Stripe é opcional em dev: sem chave, a encomenda é criada na
// mesma e o cliente segue para /obrigado (estado "pendente").
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const BASE_URL = process.env.BASE_URL || `http://localhost:${config.porta}`;

// ---------- Validações (espelham as do frontend) ----------
const REGRAS = {
  nome: v => typeof v === 'string' && v.trim().length >= 3 || 'Indica o teu nome completo.',
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || '') || 'Email inválido.',
  telefone: v => /^\d{9}$/.test(v || '') || 'O telefone são 9 dígitos (ex: 912345678).',
  morada: v => typeof v === 'string' && v.trim().length >= 5 || 'Indica a morada completa.',
  codigo_postal: v => /^\d{4}-\d{3}$/.test(v || '') || 'Formato: 0000-000.',
  cidade: v => typeof v === 'string' && v.trim().length >= 2 || 'Indica a cidade.',
  pais: v => typeof v === 'string' && v.trim().length >= 2 || 'Indica o país.'
};

function validarCliente(cliente = {}) {
  const erros = {};
  for (const [campo, regra] of Object.entries(REGRAS)) {
    const resultado = regra(cliente[campo]);
    if (resultado !== true) erros[campo] = resultado;
  }
  return erros;
}

// Gera o número de encomenda (começa em 1000 para não revelar volume)
function gerarNumeroEncomenda() {
  const ano = new Date().getFullYear();
  const prefixo = `${config.prefixoEncomenda}-${ano}-`;
  const r = db.prepare('SELECT MAX(CAST(SUBSTR(numero_encomenda, ?) AS INTEGER)) AS m FROM orders WHERE numero_encomenda LIKE ?')
    .get(prefixo.length + 1, `${prefixo}%`);
  const seq = Math.max(r.m || 0, 999) + 1;
  return `${prefixo}${String(seq).padStart(4, '0')}`;
}

// ---------- POST /api/checkout ----------
router.post('/checkout', async (req, res) => {
  const { cliente = {}, items = [] } = req.body || {};

  // 1) Dados do cliente
  const erros = validarCliente(cliente);
  if (Object.keys(erros).length > 0) {
    return res.status(400).json({ erros });
  }

  // 2) Items: quantidades inteiras positivas, produtos ativos e disponíveis
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ erro: 'O carrinho está vazio.' });
  }
  const buscarProduto = db.prepare('SELECT * FROM products WHERE id = ? AND ativo = 1');
  const itemsValidados = [];
  for (const item of items) {
    const qtd = item?.qtd;
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) {
      return res.status(400).json({ erro: 'Quantidade inválida num dos artigos.' });
    }
    const p = buscarProduto.get(Number(item.id));
    if (!p) return res.status(400).json({ erro: 'Um dos produtos já não está à venda. Atualiza o carrinho.' });
    if (!p.disponivel) return res.status(400).json({ erro: `"${p.nome}" está temporariamente esgotado.` });

    // Preço SEMPRE da BD — ignora qualquer valor enviado pelo cliente
    itemsValidados.push({
      produto_id: p.id,
      nome: p.nome,
      cor: typeof item.cor === 'string' ? item.cor.slice(0, 30) : null,
      qtd,
      preco_unit: p.preco_promo ?? p.preco
    });
  }

  // 3) Totais (regras de portes do config.js)
  const subtotal = itemsValidados.reduce((s, i) => s + i.preco_unit * i.qtd, 0);
  const portes = subtotal >= config.portesGratisAPartirDe ? 0 : config.portes;
  const total = subtotal + portes;

  // 4) Cria a encomenda (estado_pagamento "pendente")
  const numero = gerarNumeroEncomenda();
  db.prepare(`
    INSERT INTO orders
      (numero_encomenda, nome_cliente, email, telefone, morada, codigo_postal,
       cidade, pais, items, subtotal, portes, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    numero, cliente.nome.trim(), cliente.email.trim(), cliente.telefone,
    cliente.morada.trim(), cliente.codigo_postal, cliente.cidade.trim(),
    cliente.pais.trim(), JSON.stringify(itemsValidados), subtotal, portes, total
  );

  encomendaCriada(numero, total);

  // 5) Sem Stripe configurado: modo dev — segue para /obrigado na mesma
  if (!stripe) {
    console.warn(`[checkout] STRIPE_SECRET_KEY não configurada — encomenda ${numero} criada sem pagamento (modo dev).`);
    return res.json({ url: `/obrigado?enc=${numero}&t=${tokenEncomenda(numero)}` });
  }

  // 6) Stripe Checkout Session (hosted)
  const lineItems = itemsValidados.map(i => ({
    price_data: {
      currency: 'eur',
      product_data: { name: i.cor ? `${i.nome} — ${i.cor}` : i.nome },
      unit_amount: i.preco_unit
    },
    quantity: i.qtd
  }));
  if (portes > 0) {
    lineItems.push({
      price_data: { currency: 'eur', product_data: { name: 'Envio' }, unit_amount: portes },
      quantity: 1
    });
  }

  const params = {
    mode: 'payment',
    line_items: lineItems,
    customer_email: cliente.email.trim(),
    metadata: { numero_encomenda: numero },
    success_url: `${BASE_URL}/obrigado?enc=${numero}&t=${tokenEncomenda(numero)}`,
    cancel_url: `${BASE_URL}/checkout`
  };

  try {
    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (err) {
    console.error(`[checkout] erro Stripe na encomenda ${numero}: [${err.type}] ${err.message}`);
    res.status(502).json({ erro: 'Não foi possível iniciar o pagamento. Tenta novamente.' });
  }
});

// ---------- GET /api/encomendas/:numero ----------
// Exige token de verificação (?t=...) OU sessão de cliente autenticada.
router.get('/encomendas/:numero', (req, res) => {
  const row = db.prepare(`
    SELECT numero_encomenda, estado_pagamento, items, subtotal, portes, total, created_at, email
    FROM orders WHERE numero_encomenda = ?
  `).get(req.params.numero);
  if (!row) return res.status(404).json({ erro: 'Encomenda não encontrada' });

  // Verificar autorização: token HMAC no URL ou cliente autenticado dono da encomenda
  const { getCliente } = require('../lib/conta-auth');
  const cliente = getCliente(req);
  const tokenFornecido = String(req.query.t || '');
  const tokenEsperado = tokenEncomenda(row.numero_encomenda);
  const tokenValido = tokenFornecido.length === tokenEsperado.length &&
    crypto.timingSafeEqual(Buffer.from(tokenFornecido), Buffer.from(tokenEsperado));
  const clienteAutorizado = cliente && cliente.email === row.email;

  if (!tokenValido && !clienteAutorizado) {
    return res.status(403).json({ erro: 'Acesso não autorizado.' });
  }

  const { email: _, ...dadosPublicos } = row; // nunca expor o email neste endpoint
  const items = JSON.parse(dadosPublicos.items);
  // Prazo de entrega: o intervalo mais longo entre os produtos
  let prazo = '8-12', maxFim = 0;
  for (const i of items) {
    const p = db.prepare('SELECT tempo_envio_dias FROM products WHERE id = ?').get(i.produto_id);
    const fim = Number(String(p?.tempo_envio_dias || '').split('-').pop());
    if (fim > maxFim) { maxFim = fim; prazo = p.tempo_envio_dias; }
  }
  res.json({ ...dadosPublicos, items, prazo_envio_dias: prazo });
});

module.exports = router;
