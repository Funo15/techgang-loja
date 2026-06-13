// ============================================================
// EMAILS TRANSACIONAIS
// Nodemailer com SMTP genérico via .env. Se o SMTP não estiver
// configurado, NÃO rebenta: loga um aviso e o fluxo continua.
// Enviados quando o webhook do Stripe confirma o pagamento:
//  - confirmação ao cliente (template HTML da marca)
//  - notificação ao dono com dados completos + links do
//    fornecedor (para o fulfillment manual do dropshipping)
// ============================================================

const nodemailer = require('nodemailer');
const config = require('../config');
const db = require('../db/database');

function smtpConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function criarTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function formatarPreco(centimos) {
  return '€' + (centimos / 100).toFixed(2).replace('.', ',');
}

// Escaping de HTML para dados vindos do utilizador
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Wrapper comum dos emails: header roxo com o logo em texto
function layoutEmail(tituloInterno, conteudo) {
  const roxo = config.cores.acento;
  return `<!DOCTYPE html>
<html lang="pt"><body style="margin:0;padding:0;background:#F3F3F6;font-family:Helvetica,Arial,sans-serif;color:#1B1A21;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:${roxo};border-radius:16px 16px 0 0;padding:22px 28px;">
      <span style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Tech<span style="opacity:0.75;">Gang</span></span>
    </div>
    <div style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:28px;">
      <h1 style="font-size:20px;margin:0 0 14px;letter-spacing:-0.5px;">${tituloInterno}</h1>
      ${conteudo}
    </div>
    <p style="text-align:center;font-size:12px;color:#8A8793;margin-top:14px;">
      ${config.nome} · ${config.emailContacto}
    </p>
  </div>
</body></html>`;
}

// Tabela HTML com os items da encomenda (usada nos dois emails)
function tabelaItems(items) {
  const linhas = items.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #E8E7EE;font-size:14px;">
        ${esc(i.nome)}${i.cor ? ` <span style="color:#8A8793;">· ${esc(i.cor)}</span>` : ''} × ${Number(i.qtd)}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #E8E7EE;font-size:14px;text-align:right;font-weight:700;">
        ${formatarPreco(i.preco_unit * i.qtd)}
      </td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0 14px;">${linhas}</table>`;
}

// Prazo de entrega: o intervalo mais longo entre os produtos da encomenda
function prazoEntrega(items) {
  let maxFim = 0, prazo = '8-12';
  for (const i of items) {
    const row = db.prepare('SELECT tempo_envio_dias FROM products WHERE id = ?').get(i.produto_id);
    if (!row?.tempo_envio_dias) continue;
    const fim = Number(String(row.tempo_envio_dias).split('-').pop());
    if (fim > maxFim) { maxFim = fim; prazo = row.tempo_envio_dias; }
  }
  return prazo;
}

// Envia os dois emails de uma encomenda paga. Nunca lança erro
// para fora — falhas de email não podem travar o webhook.
async function enviarEmailsEncomenda(order) {
  if (!smtpConfigurado()) {
    console.log(`[email] email não enviado (SMTP não configurado) — encomenda ${order.numero_encomenda}`);
    return;
  }

  const items = JSON.parse(order.items);
  const prazo = prazoEntrega(items);
  const transporter = criarTransporter();
  const resumoTotais = `
    <table style="width:100%;font-size:14px;">
      <tr><td>Subtotal</td><td style="text-align:right;">${formatarPreco(order.subtotal)}</td></tr>
      <tr><td>Envio</td><td style="text-align:right;">${order.portes === 0 ? 'Grátis' : formatarPreco(order.portes)}</td></tr>
      <tr><td style="font-weight:800;padding-top:6px;">Total</td><td style="text-align:right;font-weight:800;font-size:18px;padding-top:6px;">${formatarPreco(order.total)}</td></tr>
    </table>`;

  // --- Email ao cliente ---
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || config.emailContacto,
      to: order.email,
      subject: `Encomenda ${order.numero_encomenda} confirmada 🎉`,
      html: layoutEmail(`Obrigado, ${esc(order.nome_cliente.split(' ')[0])}!`, `
        <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
          O teu pagamento foi confirmado. A encomenda
          <strong>${order.numero_encomenda}</strong> está a ser preparada —
          prazo de entrega estimado: <strong>${prazo} dias</strong>, com tracking incluído.
        </p>
        ${tabelaItems(items)}
        ${resumoTotais}`)
    });
    console.log(`[email] confirmação enviada a ${order.email} (${order.numero_encomenda})`);
  } catch (err) {
    console.error(`[email] falha ao enviar confirmação ao cliente: ${err.message}`);
  }

  // --- Email ao dono (fulfillment manual) ---
  const admin = process.env.EMAIL_ADMIN;
  if (!admin) return;
  try {
    // Links do fornecedor de cada produto para encomendar rápido
    const linhasFornecedor = items.map(i => {
      const p = db.prepare('SELECT fornecedor, fornecedor_url, fornecedor_product_id FROM products WHERE id = ?').get(i.produto_id);
      const urlFornecedor = /^https?:\/\//.test(p?.fornecedor_url || '') ? p.fornecedor_url : '#';
      return `<li style="font-size:13px;margin-bottom:6px;">
        ${esc(i.nome)}${i.cor ? ` (${esc(i.cor)})` : ''} × ${Number(i.qtd)} —
        ${esc(p?.fornecedor || '?')} · ref ${esc(p?.fornecedor_product_id || '?')} ·
        <a href="${esc(urlFornecedor)}" style="color:${config.cores.acento};">abrir no fornecedor</a>
      </li>`;
    }).join('');

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || config.emailContacto,
      to: admin,
      subject: `💰 Venda: ${order.numero_encomenda} — ${formatarPreco(order.total)}`,
      html: layoutEmail(`Nova encomenda paga: ${order.numero_encomenda}`, `
        ${tabelaItems(items)}
        ${resumoTotais}
        <h2 style="font-size:15px;margin:18px 0 6px;">Encomendar ao fornecedor</h2>
        <ul style="padding-left:18px;margin:0 0 14px;">${linhasFornecedor}</ul>
        <h2 style="font-size:15px;margin:18px 0 6px;">Dados de envio</h2>
        <p style="font-size:13px;line-height:1.7;margin:0;">
          ${esc(order.nome_cliente)}<br>
          ${esc(order.morada)}<br>
          ${esc(order.codigo_postal)} ${esc(order.cidade)}, ${esc(order.pais)}<br>
          ${esc(order.email)}${order.telefone ? ` · ${esc(order.telefone)}` : ''}
        </p>`)
    });
    console.log(`[email] notificação de venda enviada a ${admin} (${order.numero_encomenda})`);
  } catch (err) {
    console.error(`[email] falha ao enviar notificação ao dono: ${err.message}`);
  }
}

// Email ao cliente quando o tracking é inserido (encomenda enviada)
async function enviarEmailTracking(order) {
  if (!smtpConfigurado()) {
    console.log(`[email] email não enviado (SMTP não configurado) — tracking da ${order.numero_encomenda}`);
    return;
  }
  try {
    const items = JSON.parse(order.items);
    await criarTransporter().sendMail({
      from: process.env.EMAIL_FROM || config.emailContacto,
      to: order.email,
      subject: `A tua encomenda ${order.numero_encomenda} já vai a caminho 📦`,
      html: layoutEmail(`Já vai a caminho, ${esc(order.nome_cliente.split(' ')[0])}!`, `
        <p style="font-size:14px;line-height:1.6;margin:0 0 14px;">
          A encomenda <strong>${order.numero_encomenda}</strong> foi enviada.
          Podes segui-la aqui:
        </p>
        <p style="margin:0 0 18px;">
          <a href="${order.tracking_url || '#'}"
             style="display:inline-block;background:${config.cores.acento};color:#fff;font-weight:700;font-size:14px;padding:10px 22px;border-radius:10px;text-decoration:none;">
            Seguir encomenda${order.tracking_number ? ` · ${order.tracking_number}` : ''}
          </a>
        </p>
        ${tabelaItems(items)}`)
    });
    console.log(`[email] tracking enviado a ${order.email} (${order.numero_encomenda})`);
  } catch (err) {
    console.error(`[email] falha ao enviar tracking: ${err.message}`);
  }
}

module.exports = { enviarEmailsEncomenda, enviarEmailTracking, smtpConfigurado };
