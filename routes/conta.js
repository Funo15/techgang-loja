// Área de cliente: registo, login, encomendas, perfil.

const express = require('express');
const db = require('../db/database');
const auth = require('../lib/conta-auth');

const router = express.Router();

// ---- API ----

router.post('/registar', async (req, res) => {
  const { nome, email, password } = req.body || {};
  if (!nome || !email || !password) return res.status(400).json({ erro: 'Preenche todos os campos.' });
  if (password.length < 6) return res.status(400).json({ erro: 'Password mínimo 6 caracteres.' });
  const resultado = await auth.registar({ nome, email, password });
  if (!resultado.ok) return res.status(409).json({ erro: resultado.erro });
  const cliente = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.toLowerCase().trim());
  auth.criarSessao(cliente.id, res);
  res.json({ ok: true });
});

router.post('/entrar', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ erro: 'Preenche todos os campos.' });
  const cliente = await auth.autenticar(email, password);
  if (!cliente) return res.status(401).json({ erro: 'Email ou password incorretos.' });
  auth.criarSessao(cliente.id, res);
  res.json({ ok: true });
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
  const enc = db.prepare('SELECT * FROM orders WHERE numero_encomenda = ? AND email = ?')
    .get(req.params.numero, req.cliente.email);
  if (!enc) return res.status(404).json({ erro: 'Encomenda não encontrada.' });
  res.json(enc);
});

module.exports = router;
