// CJ Dropshipping API — criação automática de ordens.
// Chaves em CJ_API_KEY e CJ_EMAIL no .env.
// Docs: https://developers.cjdropshipping.com/

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const key = process.env.CJ_API_KEY;
  const email = process.env.CJ_EMAIL;
  if (!key || !email) return null;

  try {
    const res = await fetch(`${BASE}/authentication/getAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: key })
    });
    const data = await res.json();
    if (data.result && data.data?.accessToken) {
      _token = data.data.accessToken;
      _tokenExpiry = Date.now() + (data.data.expiresIn || 3600) * 1000 - 60000;
      return _token;
    }
    console.warn('[CJ] falha ao obter token:', data.message);
    return null;
  } catch (err) {
    console.error('[CJ] erro de autenticação:', err.message);
    return null;
  }
}

// Cria uma ordem no CJ com os items da encomenda TechGang
async function criarOrdemCJ(order) {
  if (!process.env.CJ_API_KEY || !process.env.CJ_EMAIL) {
    console.log('[CJ] CJ_API_KEY/CJ_EMAIL não configuradas — ordem não criada automaticamente');
    return null;
  }

  const token = await getToken();
  if (!token) return null;

  const db = require('../db/database');
  const items = JSON.parse(order.items);

  // Mapear items para o formato CJ
  const produtos = items.map(i => {
    const p = db.prepare('SELECT fornecedor_product_id, cores FROM products WHERE id = ?').get(i.produto_id);
    return {
      vid: p?.fornecedor_product_id || '',
      quantity: i.qtd
    };
  }).filter(i => i.vid);

  if (produtos.length === 0) {
    console.warn('[CJ] nenhum produto tem fornecedor_product_id — ordem não criada');
    return null;
  }

  const payload = {
    orderNumber: order.numero_encomenda,
    shippingCountry: order.pais === 'Portugal' ? 'PT' : order.pais,
    shippingZip: order.codigo_postal,
    shippingPhone: order.telefone || '',
    shippingName: order.nome_cliente,
    shippingAddress: order.morada,
    shippingCity: order.cidade,
    products: produtos
  };

  try {
    const res = await fetch(`${BASE}/shopping/order/createOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.result) {
      console.log(`[CJ] ordem ${order.numero_encomenda} criada no CJ: ${data.data?.orderId}`);
      return data.data?.orderId;
    }
    console.warn(`[CJ] falha ao criar ordem: ${data.message}`);
    return null;
  } catch (err) {
    console.error('[CJ] erro ao criar ordem:', err.message);
    return null;
  }
}

module.exports = { criarOrdemCJ };
