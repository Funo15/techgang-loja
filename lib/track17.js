// Integração 17track — regista números de tracking automaticamente.
// API gratuita até 100/mês. Chave em TRACK17_API_KEY no .env.
// Docs: https://api.17track.net/en/doc

async function registarTracking(trackingNumber) {
  const key = process.env.TRACK17_API_KEY;
  if (!key) {
    console.log('[17track] TRACK17_API_KEY não configurada — tracking não registado');
    return null;
  }

  try {
    const res = await fetch('https://api.17track.net/track/v2.2/register', {
      method: 'POST',
      headers: { '17token': key, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ number: trackingNumber }])
    });
    const data = await res.json();
    if (data.code === 0) {
      console.log(`[17track] tracking ${trackingNumber} registado`);
      return true;
    }
    console.warn('[17track] resposta inesperada:', JSON.stringify(data));
    return false;
  } catch (err) {
    console.error('[17track] erro:', err.message);
    return false;
  }
}

module.exports = { registarTracking };
