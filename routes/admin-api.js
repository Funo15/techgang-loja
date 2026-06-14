// ============================================================
// API DO ADMIN (/api/admin/*) — protegida pelo middleware
// exigirAdmin no server.js. Tudo o que escreve na BD é
// validado aqui (nunca confiar no frontend, nem no nosso).
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db/database');
const config = require('../config');
const { enviarEmailTracking } = require('../lib/email');
const { registarTracking } = require('../lib/track17');
const { encomendaPaga, estadoAlterado } = require('../lib/logger');
const { fazerBackup, limparBackupsAntigos } = require('../lib/backup');

const router = express.Router();

// ------------------------------------------------------------
// DASHBOARD — GET /api/admin/resumo
// ------------------------------------------------------------
router.get('/resumo', (req, res) => {
  const contar = (dias) => db.prepare(`
    SELECT COUNT(*) AS c FROM orders
    WHERE created_at >= datetime('now', ?)
  `).get(`-${dias} days`).c;

  // Receita e lucro: só encomendas pagas dos últimos 30 dias.
  // Lucro estimado = total - custos do fornecedor - portes cobrados a nós
  // (aproximação: usamos os portes da encomenda como custo de envio).
  const pagas30 = db.prepare(`
    SELECT items, total, portes FROM orders
    WHERE estado_pagamento = 'paga' AND created_at >= datetime('now', '-30 days')
  `).all();

  let receita30 = 0, lucro30 = 0;
  const custoProduto = db.prepare('SELECT custo_fornecedor FROM products WHERE id = ?');
  for (const o of pagas30) {
    receita30 += o.total;
    let custos = 0;
    for (const i of JSON.parse(o.items)) {
      custos += (custoProduto.get(i.produto_id)?.custo_fornecedor || 0) * i.qtd;
    }
    lucro30 += o.total - custos - o.portes;
  }

  const porEncomendar = db.prepare(`
    SELECT COUNT(*) AS c FROM orders
    WHERE estado_pagamento = 'paga' AND estado_fulfillment = 'por_encomendar'
  `).get().c;

  const ultimas = db.prepare(`
    SELECT numero_encomenda, nome_cliente, total, estado_pagamento, estado_fulfillment, created_at
    FROM orders ORDER BY created_at DESC LIMIT 10
  `).all();

  const receitaHoje = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS v FROM orders
    WHERE estado_pagamento = 'paga' AND date(created_at) = date('now')
  `).get().v;

  const grafico7dias = (() => {
    const rows = db.prepare(`
      SELECT date(created_at) AS dia, COUNT(*) AS n, COALESCE(SUM(total), 0) AS receita
      FROM orders WHERE created_at >= datetime('now', '-6 days')
      GROUP BY date(created_at) ORDER BY dia
    `).all();
    // Preenche os dias sem encomendas com zeros
    const mapa = Object.fromEntries(rows.map(r => [r.dia, r]));
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      dias.push(mapa[d] || { dia: d, n: 0, receita: 0 });
    }
    return dias;
  })();

  const encomendasHoje = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now')`).get().c;
  const visitantesHoje = db.prepare(`SELECT COUNT(*) AS c FROM daily_visitors WHERE dia = date('now')`).get().c;

  res.json({
    hoje: encomendasHoje,
    dias7: contar(7),
    dias30: contar(30),
    receita30,
    lucro30,
    receitaHoje,
    porEncomendar,
    grafico7dias,
    visitantesHoje,
    conversaoHoje: visitantesHoje > 0 ? +((encomendasHoje / visitantesHoje) * 100).toFixed(1) : 0,
    ultimas
  });
});

// ------------------------------------------------------------
// ENCOMENDAS — listagem com filtros + pesquisa
// ------------------------------------------------------------
function filtrarEncomendas(query) {
  const condicoes = [];
  const params = [];
  if (query.estado_pagamento) { condicoes.push('estado_pagamento = ?'); params.push(query.estado_pagamento); }
  if (query.estado_fulfillment) { condicoes.push('estado_fulfillment = ?'); params.push(query.estado_fulfillment); }
  if (query.esconder_testes === '1') { condicoes.push('teste = 0'); }
  if (query.data_ini) { condicoes.push('date(created_at) >= ?'); params.push(query.data_ini); }
  if (query.data_fim) { condicoes.push('date(created_at) <= ?'); params.push(query.data_fim); }
  if (query.q) {
    condicoes.push('(nome_cliente LIKE ? OR email LIKE ? OR numero_encomenda LIKE ?)');
    const termo = `%${query.q}%`;
    params.push(termo, termo, termo);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`).all(...params);
}

router.get('/encomendas', (req, res) => {
  res.json(filtrarEncomendas(req.query).map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// Export CSV (separador ; e datas PT) — mesmo filtro da listagem
router.get('/encomendas.csv', (req, res) => {
  const rows = filtrarEncomendas(req.query);
  const dataPT = (iso) => {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
  };
  const euro = (c) => (c / 100).toFixed(2).replace('.', ',');
  const limpar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const cabecalho = ['numero', 'data', 'cliente', 'email', 'telefone', 'morada', 'codigo_postal',
    'cidade', 'pais', 'items', 'subtotal_eur', 'portes_eur', 'total_eur',
    'estado_pagamento', 'estado_fulfillment', 'tracking', 'ip', 'user_agent'].join(';');
  const linhas = rows.map(o => {
    const items = JSON.parse(o.items).map(i => `${i.nome}${i.cor ? ` (${i.cor})` : ''} x${i.qtd}`).join(' | ');
    return [o.numero_encomenda, dataPT(o.created_at), limpar(o.nome_cliente), o.email, o.telefone,
      limpar(o.morada), o.codigo_postal, limpar(o.cidade), limpar(o.pais), limpar(items),
      euro(o.subtotal), euro(o.portes), euro(o.total),
      o.estado_pagamento, o.estado_fulfillment, o.tracking_number || '',
      o.ip || '', limpar(o.user_agent || '')].join(';');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="encomendas-techgang.csv"`);
  // BOM para o Excel abrir os acentos corretamente
  res.send('﻿' + [cabecalho, ...linhas].join('\r\n'));
});

// Detalhe completo (inclui custos e margem — só para o admin)
router.get('/encomendas/:numero', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE numero_encomenda = ?').get(req.params.numero);
  if (!o) return res.status(404).json({ erro: 'Encomenda não encontrada' });

  const items = JSON.parse(o.items).map(i => {
    const p = db.prepare(`
      SELECT fornecedor, fornecedor_url, fornecedor_product_id, custo_fornecedor, slug
      FROM products WHERE id = ?
    `).get(i.produto_id) || {};
    return { ...i, ...p };
  });

  const custos = items.reduce((s, i) => s + (i.custo_fornecedor || 0) * i.qtd, 0);
  const margem = o.total - custos - o.portes;
  res.json({
    ...o, items, custos_fornecedor: custos, margem,
    margem_pct: o.total > 0 ? Math.round((margem / o.total) * 100) : 0
  });
});

// Ações de fulfillment (o fluxo do dropshipping)
router.post('/encomendas/:numero/fulfillment', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE numero_encomenda = ?').get(req.params.numero);
  if (!o) return res.status(404).json({ erro: 'Encomenda não encontrada' });

  const { acao, fornecedor_order_id, tracking_number, tracking_url } = req.body || {};

  if (acao === 'encomendada') {
    db.prepare(`
      UPDATE orders SET estado_fulfillment = 'encomendada_fornecedor', fornecedor_order_id = ?
      WHERE numero_encomenda = ?
    `).run(String(fornecedor_order_id || '').slice(0, 80) || null, o.numero_encomenda);
    estadoAlterado(o.numero_encomenda, 'fulfillment', 'encomendada_fornecedor');

  } else if (acao === 'enviada') {
    const numTracking = String(tracking_number || '').trim().slice(0, 80);
    const urlTracking = String(tracking_url || '').trim().slice(0, 300);
    if (!numTracking) return res.status(400).json({ erro: 'Indica o número de tracking.' });
    if (urlTracking && !/^https?:\/\//.test(urlTracking)) {
      return res.status(400).json({ erro: 'O link de tracking tem de começar por http(s)://' });
    }
    db.prepare(`
      UPDATE orders SET estado_fulfillment = 'enviada', tracking_number = ?, tracking_url = ?
      WHERE numero_encomenda = ?
    `).run(numTracking, urlTracking || null, o.numero_encomenda);
    estadoAlterado(o.numero_encomenda, 'fulfillment', 'enviada');
    // Email ao cliente com o link de tracking (não bloqueia a resposta)
    const atualizada = db.prepare('SELECT * FROM orders WHERE numero_encomenda = ?').get(o.numero_encomenda);
    enviarEmailTracking(atualizada).catch(err => console.error(`[admin] email tracking: ${err.message}`));
    registarTracking(numTracking).catch(() => {});

  } else if (acao === 'entregue') {
    db.prepare(`UPDATE orders SET estado_fulfillment = 'entregue' WHERE numero_encomenda = ?`).run(o.numero_encomenda);
    estadoAlterado(o.numero_encomenda, 'fulfillment', 'entregue');

  } else {
    return res.status(400).json({ erro: 'Ação inválida.' });
  }

  res.json({ ok: true });
});

// Notas internas
router.post('/encomendas/:numero/notas', (req, res) => {
  const notas = String(req.body?.notas_internas ?? '').slice(0, 5000);
  const r = db.prepare('UPDATE orders SET notas_internas = ? WHERE numero_encomenda = ?')
    .run(notas, req.params.numero);
  if (r.changes === 0) return res.status(404).json({ erro: 'Encomenda não encontrada' });
  res.json({ ok: true });
});

router.post('/encomendas/bulk', (req, res) => {
  const { numeros = [], acao } = req.body || {};
  if (!Array.isArray(numeros) || numeros.length === 0) return res.status(400).json({ erro: 'Nenhuma encomenda selecionada.' });
  const acoes = { apagar: 'DELETE FROM orders WHERE numero_encomenda = ?', teste: 'UPDATE orders SET teste = 1 WHERE numero_encomenda = ?', nao_teste: 'UPDATE orders SET teste = 0 WHERE numero_encomenda = ?' };
  if (!acoes[acao]) return res.status(400).json({ erro: 'Ação inválida.' });
  const stmt = db.prepare(acoes[acao]);
  db.transaction((lista) => lista.forEach(n => stmt.run(n)))(numeros);
  res.json({ ok: true, afetadas: numeros.length });
});

router.delete('/encomendas/:numero', (req, res) => {
  const r = db.prepare('DELETE FROM orders WHERE numero_encomenda = ?').run(req.params.numero);
  if (r.changes === 0) return res.status(404).json({ erro: 'Encomenda não encontrada' });
  res.json({ ok: true });
});

router.post('/encomendas/:numero/teste', (req, res) => {
  const o = db.prepare('SELECT teste FROM orders WHERE numero_encomenda = ?').get(req.params.numero);
  if (!o) return res.status(404).json({ erro: 'Encomenda não encontrada' });
  const novoValor = o.teste ? 0 : 1;
  db.prepare('UPDATE orders SET teste = ? WHERE numero_encomenda = ?').run(novoValor, req.params.numero);
  res.json({ ok: true, teste: novoValor });
});

// ------------------------------------------------------------
// PRODUTOS — gestão completa (inclui campos de dropshipping)
// ------------------------------------------------------------
router.get('/produtos', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY ativo DESC, created_at DESC').all();
  res.json(rows.map(p => ({ ...p, imagens: JSON.parse(p.imagens), cores: JSON.parse(p.cores), specs: JSON.parse(p.specs), variantes: JSON.parse(p.variantes || '[]') })));
});

router.get('/produtos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json({ ...p, imagens: JSON.parse(p.imagens), cores: JSON.parse(p.cores), specs: JSON.parse(p.specs), variantes: JSON.parse(p.variantes || '[]') });
});

// Validação dos dados de produto (criar e editar usam a mesma)
function validarProduto(b) {
  const erros = {};
  if (!b.nome || String(b.nome).trim().length < 2) erros.nome = 'Nome obrigatório.';
  const preco = Number(b.preco);
  if (!Number.isInteger(preco) || preco <= 0) erros.preco = 'Preço em cêntimos (inteiro > 0).';
  if (b.preco_promo != null && b.preco_promo !== '') {
    const promo = Number(b.preco_promo);
    if (!Number.isInteger(promo) || promo <= 0 || promo >= preco) erros.preco_promo = 'Promo tem de ser > 0 e menor que o preço.';
  }
  if (!b.categoria || String(b.categoria).trim().length < 2) erros.categoria = 'Categoria obrigatória.';
  if (b.custo_fornecedor != null && b.custo_fornecedor !== '') {
    const custo = Number(b.custo_fornecedor);
    if (!Number.isInteger(custo) || custo < 0) erros.custo_fornecedor = 'Custo em cêntimos (inteiro ≥ 0).';
  }
  for (const campo of ['cores', 'specs', 'imagens', 'variantes']) {
    if (b[campo] != null && !Array.isArray(b[campo])) erros[campo] = 'Formato inválido.';
  }
  return erros;
}

// Só aceita URLs http(s) — bloqueia javascript:/data: que seriam renderizadas
// como links clicáveis no admin (self-XSS).
function urlSegura(valor, maxLen = 300) {
  const s = String(valor || '').trim().slice(0, maxLen);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : null;
}

function gerarSlug(nome, idAtual = null) {
  const base = String(nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'produto';
  let slug = base, n = 2;
  while (true) {
    const existente = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
    if (!existente || existente.id === idAtual) return slug;
    slug = `${base}-${n++}`;
  }
}

function camposProduto(b, slug) {
  return {
    nome: String(b.nome).trim(),
    slug,
    descricao: String(b.descricao || '').slice(0, 2000),
    preco: Number(b.preco),
    preco_promo: b.preco_promo != null && b.preco_promo !== '' ? Number(b.preco_promo) : null,
    categoria: String(b.categoria).trim().toLowerCase(),
    imagens: JSON.stringify(b.imagens || []),
    destaque: b.destaque ? 1 : 0,
    fornecedor: String(b.fornecedor || '').slice(0, 60) || null,
    fornecedor_url: urlSegura(b.fornecedor_url, 300),
    fornecedor_product_id: String(b.fornecedor_product_id || '').slice(0, 80) || null,
    custo_fornecedor: b.custo_fornecedor != null && b.custo_fornecedor !== '' ? Number(b.custo_fornecedor) : null,
    tempo_envio_dias: String(b.tempo_envio_dias || '8-12').slice(0, 20),
    disponivel: b.disponivel ? 1 : 0,
    rating: Math.min(5, Math.max(0, Number(b.rating) || 4.8)),
    num_avaliacoes: Math.max(0, parseInt(b.num_avaliacoes, 10) || 0),
    tiktok_views: String(b.tiktok_views || '').slice(0, 20) || null,
    em_tendencia: b.em_tendencia ? 1 : 0,
    cores: JSON.stringify(b.cores || []),
    specs: JSON.stringify(b.specs || []),
    variantes: JSON.stringify(b.variantes || [])
  };
}

router.post('/produtos', (req, res) => {
  const erros = validarProduto(req.body || {});
  if (Object.keys(erros).length) return res.status(400).json({ erros });
  const c = camposProduto(req.body, gerarSlug(req.body.nome));
  const r = db.prepare(`
    INSERT INTO products (nome, slug, descricao, preco, preco_promo, categoria, imagens, ativo, destaque,
      fornecedor, fornecedor_url, fornecedor_product_id, custo_fornecedor, tempo_envio_dias, disponivel,
      rating, num_avaliacoes, tiktok_views, em_tendencia, cores, specs, variantes)
    VALUES (@nome, @slug, @descricao, @preco, @preco_promo, @categoria, @imagens, 1, @destaque,
      @fornecedor, @fornecedor_url, @fornecedor_product_id, @custo_fornecedor, @tempo_envio_dias, @disponivel,
      @rating, @num_avaliacoes, @tiktok_views, @em_tendencia, @cores, @specs, @variantes)
  `).run(c);
  res.json({ ok: true, id: r.lastInsertRowid, slug: c.slug });
});

router.put('/produtos/:id', (req, res) => {
  const id = Number(req.params.id);
  const existente = db.prepare('SELECT id, slug FROM products WHERE id = ?').get(id);
  if (!existente) return res.status(404).json({ erro: 'Produto não encontrado' });
  const erros = validarProduto(req.body || {});
  if (Object.keys(erros).length) return res.status(400).json({ erros });
  const c = camposProduto(req.body, gerarSlug(req.body.nome, id));
  db.prepare(`
    UPDATE products SET nome=@nome, slug=@slug, descricao=@descricao, preco=@preco, preco_promo=@preco_promo,
      categoria=@categoria, imagens=@imagens, destaque=@destaque, fornecedor=@fornecedor,
      fornecedor_url=@fornecedor_url, fornecedor_product_id=@fornecedor_product_id,
      custo_fornecedor=@custo_fornecedor, tempo_envio_dias=@tempo_envio_dias, disponivel=@disponivel,
      rating=@rating, num_avaliacoes=@num_avaliacoes, tiktok_views=@tiktok_views,
      em_tendencia=@em_tendencia, cores=@cores, specs=@specs, variantes=@variantes
    WHERE id = @id
  `).run({ ...c, id });
  res.json({ ok: true, slug: c.slug });
});

// Toggles rápidos na tabela + soft delete (ativo=0, NUNCA apagar da BD)
router.patch('/produtos/:id/preco', (req, res) => {
  const id = Number(req.params.id);
  const preco = Math.round(Number(req.body?.preco) * 100);
  const promoRaw = req.body?.preco_promo;
  const preco_promo = promoRaw ? Math.round(Number(promoRaw) * 100) : null;
  if (!Number.isFinite(preco) || preco < 0) return res.status(400).json({ erro: 'Preço inválido.' });
  if (preco_promo !== null && (!Number.isFinite(preco_promo) || preco_promo < 0)) return res.status(400).json({ erro: 'Preço promo inválido.' });
  const r = db.prepare('UPDATE products SET preco = ?, preco_promo = ? WHERE id = ?').run(preco, preco_promo, id);
  if (r.changes === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json({ ok: true, preco, preco_promo });
});

router.patch('/produtos/:id/toggle', (req, res) => {
  const campo = req.body?.campo;
  if (!['disponivel', 'destaque', 'ativo'].includes(campo)) {
    return res.status(400).json({ erro: 'Campo inválido.' });
  }
  const r = db.prepare(`UPDATE products SET ${campo} = 1 - ${campo} WHERE id = ?`).run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
  const valor = db.prepare(`SELECT ${campo} AS v FROM products WHERE id = ?`).get(Number(req.params.id)).v;
  res.json({ ok: true, valor: !!valor });
});

router.delete('/produtos/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json({ ok: true });
});

// ------------------------------------------------------------
// IMPORTAR PRODUTO (bookmarklet AliExpress)
// ------------------------------------------------------------
const PATHS = require('../lib/paths');
const PASTA_UPLOADS = PATHS.uploads;

const DOMINIOS_IMAGEM_PERMITIDOS = [
  'ae01.alicdn.com',
  'ae-pic-a1.aliexpress-media.com',
  'ae-pic-b1.aliexpress-media.com',
  'ae-pic-c1.aliexpress-media.com',
  'img.alicdn.com',
  'cbu01.alicdn.com',
];

function urlPermitida(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return DOMINIOS_IMAGEM_PERMITIDOS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}

function downloadUrl(url, tentativa = 0) {
  if (!urlPermitida(url)) return Promise.reject(new Error('Domínio não permitido: ' + url));
  const https = require('https');
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://pt.aliexpress.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      }
    };
    https.get(url, opts, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && tentativa < 2) {
        const loc = res.headers.location;
        if (!urlPermitida(loc)) return reject(new Error('Redirect para domínio não permitido'));
        return downloadUrl(loc, tentativa + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      let total = 0;
      res.on('data', c => {
        total += c.length;
        if (total > 15 * 1024 * 1024) { res.destroy(); return reject(new Error('Imagem demasiado grande')); }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function slugificar(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80);
}

router.post('/importar-produto', async (req, res) => {
  const { nome, descricao, preco, preco_promo, categoria, cores, variantes, imagens_urls, specs,
    fornecedor_url, fornecedor_product_id, custo_fornecedor, tempo_envio_dias,
    rating, num_avaliacoes, destaque } = req.body || {};

  if (!nome || !preco) return res.status(400).json({ erro: 'Nome e preço são obrigatórios.' });

  // Validação numérica (cêntimos) — não confiar nos valores enviados
  const precoInt = Number(preco);
  if (!Number.isInteger(precoInt) || precoInt <= 0) {
    return res.status(400).json({ erro: 'Preço inválido (cêntimos, inteiro > 0).' });
  }
  let promoInt = null;
  if (preco_promo != null && preco_promo !== '') {
    promoInt = Number(preco_promo);
    if (!Number.isInteger(promoInt) || promoInt <= 0 || promoInt >= precoInt) {
      return res.status(400).json({ erro: 'Promo tem de ser > 0 e menor que o preço.' });
    }
  }
  let custoInt = null;
  if (custo_fornecedor != null && custo_fornecedor !== '') {
    custoInt = Number(custo_fornecedor);
    if (!Number.isInteger(custoInt) || custoInt < 0) {
      return res.status(400).json({ erro: 'Custo inválido (cêntimos, inteiro ≥ 0).' });
    }
  }

  // Descarregar e processar imagens
  const urls = [];
  for (const url of (imagens_urls || []).slice(0, 8)) {
    try {
      const buf = await downloadUrl(url);
      const nome_f = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      await sharp(buf)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(PASTA_UPLOADS, nome_f));
      urls.push('/media/' + nome_f);
    } catch (e) {
      console.error('[importar] imagem falhou:', e.message);
    }
  }

  // Slug único
  let slug = slugificar(nome);
  const existe = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
  if (existe) slug = slug + '-' + Date.now().toString(36);

  const r = db.prepare(`
    INSERT INTO products
      (nome, slug, descricao, preco, preco_promo, categoria, imagens, ativo, destaque,
       fornecedor, fornecedor_url, fornecedor_product_id, custo_fornecedor,
       tempo_envio_dias, disponivel, rating, num_avaliacoes, cores, specs, variantes)
    VALUES (?,?,?,?,?,?,?,1,?,  'AliExpress',?,?,?,  ?,1,?,?,?,?,?)
  `).run(
    String(nome).slice(0, 200),
    slug,
    String(descricao || '').slice(0, 2000),
    precoInt,
    promoInt,
    String(categoria || 'Geral').slice(0, 60),
    JSON.stringify(urls),
    destaque ? 1 : 0,
    urlSegura(fornecedor_url, 500),
    String(fornecedor_product_id || '').slice(0, 100),
    custoInt,
    String(tempo_envio_dias || '8-15').slice(0, 20),
    Math.min(5, Math.max(0, Number(rating) || 4.8)),
    Math.max(0, parseInt(num_avaliacoes, 10) || 0),
    JSON.stringify(Array.isArray(cores) ? cores : []),
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variantes) ? variantes : [])
  );

  res.json({ ok: true, id: r.lastInsertRowid, slug });
});

// ------------------------------------------------------------
// UPLOAD DE IMAGENS — multer (memória) + sharp (máx 1200px, q80)
// ------------------------------------------------------------

const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8,
  'image/png':  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
  'image/gif':  (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  'image/avif': (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70, // ftyp box
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype));
  }
});

router.post('/upload', upload.array('imagens', 6), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ erro: 'Nenhuma imagem válida recebida.' });
  // Validar magic bytes reais — o fileFilter do multer só verifica o Content-Type do header
  const invalidas = req.files.filter(f => {
    const check = MAGIC[f.mimetype];
    return !check || f.buffer.length < 12 || !check(f.buffer);
  });
  if (invalidas.length > 0) return res.status(400).json({ erro: 'Uma ou mais imagens são inválidas.' });
  const urls = [];
  for (const f of req.files) {
    const nome = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
    try {
      await sharp(f.buffer)
        .rotate() // respeita a orientação EXIF
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(PASTA_UPLOADS, nome));
      urls.push(`/media/${nome}`);
    } catch (err) {
      console.error(`[admin] upload falhou: ${err.message}`);
    }
  }
  if (!urls.length) return res.status(400).json({ erro: 'Não foi possível processar as imagens.' });
  res.json({ urls });
});

// ------------------------------------------------------------
// BACKUPS — forçar backup manual + listagem
// ------------------------------------------------------------
router.post('/backup', async (req, res) => {
  try {
    const { nome } = await fazerBackup();
    limparBackupsAntigos();
    res.json({ ok: true, nome });
  } catch (err) {
    console.error(`[admin] backup manual falhou: ${err.message}`);
    res.status(500).json({ erro: 'Backup falhou. Verifica os logs.' });
  }
});

router.get('/backups', (req, res) => {
  const PATHS = require('../lib/paths');
  const fs = require('fs');
  try {
    const ficheiros = fs.readdirSync(PATHS.backups)
      .filter(f => f.startsWith('loja-') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(require('path').join(PATHS.backups, f));
        return { nome: f, tamanho: stat.size, data: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.data.localeCompare(a.data));
    res.json(ficheiros);
  } catch {
    res.json([]);
  }
});

router.get('/clientes', (req, res) => {
  const clientes = db.prepare(`
    SELECT c.id, c.nome, c.email, c.google_id, c.created_at,
           COUNT(o.id) AS num_encomendas,
           SUM(CASE WHEN o.estado_pagamento = 'paga' THEN o.total ELSE 0 END) AS total_gasto
    FROM customers c
    LEFT JOIN orders o ON o.email = c.email
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(clientes);
});

module.exports = router;
