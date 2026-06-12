// ============================================================
// WEBHOOK DO STRIPE
// Recebe checkout.session.completed e marca a encomenda como
// paga + dispara os emails. IMPORTANTE: esta rota precisa do
// RAW body para verificar a assinatura — é montada no server.js
// com express.raw() ANTES do express.json().
// Testar localmente:
//   stripe listen --forward-to localhost:3002/api/stripe/webhook
// ============================================================

const db = require('../db/database');
const { enviarEmailsEncomenda } = require('../lib/email');
const { criarOrdemCJ } = require('../lib/cj');

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

function webhookStripe(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ erro: 'Stripe não configurado' });
  }

  // Verificação da assinatura (req.body é um Buffer, vindo do express.raw)
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[webhook] assinatura inválida: ${err.message}`);
    return res.status(400).json({ erro: 'Assinatura inválida' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const numero = session.metadata?.numero_encomenda;
    if (!numero) {
      console.error('[webhook] checkout.session.completed sem numero_encomenda no metadata');
      return res.json({ received: true });
    }

    const metodo = (session.payment_method_types || []).join(',') || 'stripe';
    const resultado = db.prepare(`
      UPDATE orders SET estado_pagamento = 'paga', metodo_pagamento = ?
      WHERE numero_encomenda = ? AND estado_pagamento = 'pendente'
    `).run(metodo, numero);

    if (resultado.changes === 1) {
      console.log(`[webhook] encomenda ${numero} marcada como paga (${metodo})`);
      // Emails em background — a resposta ao Stripe não espera por eles
      const order = db.prepare('SELECT * FROM orders WHERE numero_encomenda = ?').get(numero);
      enviarEmailsEncomenda(order).catch(err =>
        console.error(`[webhook] erro nos emails da ${numero}: ${err.message}`)
      );
      criarOrdemCJ(order).catch(err =>
        console.error(`[webhook] erro CJ da ${numero}: ${err.message}`)
      );
    } else {
      // Repetição do webhook ou encomenda desconhecida — idempotente
      console.log(`[webhook] ${numero}: nada a atualizar (já paga ou inexistente)`);
    }
  }

  res.json({ received: true });
}

module.exports = webhookStripe;
