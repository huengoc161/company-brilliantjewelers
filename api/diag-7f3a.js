// Temporary diagnostics for the brief email/storage setup. Remove after checking.
import { createHash } from 'node:crypto';
const KEY_HASH = '8ae08cd71d7fe2a2cea351b2ba6f92f504e08d2c5b3ae75b918249a391339fef';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const names = Object.keys(process.env).filter((k) => /BLOB|OIDC|RESEND|BRIEF/i.test(k)).sort();
  let mail = 'not tried';
  const ok = createHash('sha256').update(String(req.query.key || '')).digest('hex') === KEY_HASH;
  if (ok && process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Shine Redefined Brief <onboarding@resend.dev>', to: ['huengoc161@gmail.com'],
        subject: '[Shine Redefined] Kiểm tra gửi email', html: '<p>Email kiểm tra từ website brief.</p>' })
    });
    mail = r.status + ' ' + (await r.text()).slice(0, 300);
  }
  const keyLen = (process.env.RESEND_API_KEY || '').length;
  res.status(200).send('<!doctype html><title>diag</title><p>ENV: ' + (names.join(', ') || 'none')
    + ' | RESEND key length: ' + keyLen + ' starts re_: ' + String((process.env.RESEND_API_KEY || '').startsWith('re_'))
    + ' | MAIL: ' + mail.replace(/</g, '&lt;') + '</p>');
}
