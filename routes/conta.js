// Área de cliente: registo, login, encomendas, perfil.

const express = require('express');
const db = require('../db/database');
const auth = require('../lib/conta-auth');
const { limitadorConta } = require('../lib/seguranca');

const router = express.Router();

// ---- API ----

router.post('/registar', limitadorConta, async (req, res) => {
  const { nome, email, password } = req.body || {};
  if (!nome || !email || !password) return res.status(400).json({ erro: 'Preenche todos os campos.' });
  if (password.length < 6) return res.status(400).json({ erro: 'Password mínimo 6 caracteres.' });
  const resultado = await auth.registar({ nome, email, password });
  if (!resultado.ok) return res.status(409).json({ erro: resultado.erro });
  const cliente = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  auth.criarSessao(cliente.id, res);
  res.json({ ok: true });
});

router.post('/entrar', limitadorConta, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ erro: 'Preenche todos os campos.' });
  const cliente = await auth.autenticar(email, password);
  if (!cliente) return res.status(401).json({ erro: 'Email ou password incorretos.' });
  auth.criarSessao(cliente.id, res);
  res.json({ ok: true });
});

router.post('/google', limitadorConta, async (req, res) => {
  // Aceita JSON (popup) e form-urlencoded (redirect mode do Google)
  const credential = req.body?.credential;
  const isRedirect = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
  if (!credential) {
    if (isRedirect) return res.redirect('/conta?erro=google');
    return res.status(400).json({ erro: 'Token em falta.' });
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    if (isRedirect) return res.redirect('/conta?erro=google');
    return res.status(503).json({ erro: 'Login com Google não configurado.' });
  }
  try {
    const cliente = await auth.autenticarOuRegistarGoogle(credential, clientId);
    auth.criarSessao(cliente.id, res);
    if (isRedirect) return res.redirect('/conta/encomendas');
    res.json({ ok: true });
  } catch (err) {
    if (isRedirect) return res.redirect('/conta?erro=google');
    res.status(401).json({ erro: err.message || 'Erro no login com Google.' });
  }
});

router.post('/sair', (req, res) => {
  auth.terminarSessao(req, res);
  res.json({ ok: true });
});

router.get('/eu', (req, res) => {
  const c = auth.getCliente(req);
  if (!c) return res.status(401).json({ erro: 'Não autenticado' });
  res.json({ id: c.id, nome: c.nome, email: c.email, criado_em: c.created_at });
});

router.get('/encomendas', auth.exigirCliente, (req, res) => {
  const encomendas = db.prepare(`
    SELECT numero_encomenda, created_at, total, estado_pagamento, estado_fulfillment,
           tracking_number, tracking_url, items
    FROM orders WHERE email = ? ORDER BY created_at DESC
  `).all(req.cliente.email);
  res.json(encomendas);
});

router.get('/encomendas/:numero', auth.exigirCliente, (req, res) => {
  // Só campos visíveis ao cliente — nunca notas_internas, ip, user_agent,
  // fornecedor_order_id nem a flag de teste.
  const enc = db.prepare(`
    SELECT numero_encomenda, nome_cliente, email, telefone, morada, codigo_postal,
           cidade, pais, items, subtotal, portes, total, metodo_pagamento,
           estado_pagamento, estado_fulfillment, tracking_number, tracking_url, created_at
    FROM orders WHERE numero_encomenda = ? AND email = ?
  `).get(req.params.numero, req.cliente.email);
  if (!enc) return res.status(404).json({ erro: 'Encomenda não encontrada.' });
  res.json(enc);
});

module.exports = router;
