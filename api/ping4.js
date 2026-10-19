export default async function handler(req, res) {
  let msg;
  try { const m = await import('@vercel/blob'); msg = 'blob OK ' + Object.keys(m).slice(0, 5).join(','); }
  catch (e) { msg = 'blob ERROR ' + String(e && e.message).slice(0, 300); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<!doctype html><title>p4</title><p>' + msg.replace(/</g, '&lt;') + '</p>');
}
