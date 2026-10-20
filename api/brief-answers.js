// Brief answers for Shine Redefined, stored in a private Vercel Blob store.
// POST: save one submission. GET ?key=…: list submissions for Huệ. GET ?ping=1: status page.
// Auth to the store uses Vercel OIDC (the store is connected to this project), so no token is kept in code.
import { createHash } from 'node:crypto';

// Only the SHA-256 of Huệ's viewing code is stored here, so the public repo does not reveal it
const KEY_HASH = process.env.BRIEF_ADMIN_KEY_HASH || '8ae08cd71d7fe2a2cea351b2ba6f92f504e08d2c5b3ae75b918249a391339fef';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const keyOk = (req) => createHash('sha256').update(String(req.query.key || '')).digest('hex') === KEY_HASH;
const storeReady = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
const envNames = () => Object.keys(process.env).filter((k) => /BLOB|OIDC|STORE/i.test(k)).join(' + ') || '[none]';

const NOTIFY_TO = process.env.BRIEF_NOTIFY_TO || 'hue.nguyen@ravopos.com';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Email Huệ a readable copy of one submission through Resend
async function sendMail(record) {
  const groups = [];
  record.answers.forEach((x) => {
    let g = groups[groups.length - 1];
    if (!g || g.name !== x.section) { g = { name: x.section, ticks: [], rows: [] }; groups.push(g); }
    if (x.type === 'check') { if (x.a) g.ticks.push(x.q); } else if (x.a) g.rows.push(x);
  });
  const when = new Date(record.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
  const sections = groups.map((g) => {
    const ticks = g.ticks.map((t) => `<li style="margin:2px 0">✓ ${esc(t)}</li>`).join('');
    const rows = g.rows.map((r) => `<tr><td style="padding:6px 10px 6px 0;color:#6b6457;vertical-align:top;width:40%">${esc(r.q)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(r.a)}</td></tr>`).join('');
    const empty = !ticks && !rows ? '<p style="color:#9a9285;font-style:italic;margin:4px 0">Chưa điền mục này.</p>' : '';
    return `<h3 style="margin:22px 0 6px;font-size:16px;color:#7a5b1c">${esc(g.name)}</h3>`
      + (ticks ? `<ul style="margin:0 0 6px;padding-left:4px;list-style:none">${ticks}</ul>` : '')
      + (rows ? `<table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>` : '') + empty;
  }).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#16140f;max-width:680px">`
    + `<p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7a5b1c">Shine Redefined · Brief landing page</p>`
    + `<h2 style="margin:6px 0 4px">${esc(record.name)} vừa gửi brief</h2>`
    + `<p style="margin:0;color:#6b6457">Gửi lúc ${esc(when)} (giờ Việt Nam). Xem tất cả lần gửi tại `
    + `<a href="https://company-brilliantjewelers.vercel.app/brief/ket-qua/">trang kết quả</a>.</p>${sections}</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.BRIEF_MAIL_FROM || 'Shine Redefined Brief <onboarding@resend.dev>',
      to: [NOTIFY_TO],
      subject: `[Shine Redefined] Brief mới từ ${record.name}`,
      html
    })
  });
  if (!r.ok) console.error('resend', r.status, await r.text());
  return r.ok;
}

async function readPrivate(get, pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'GET' && req.query.ping) {
    let lib = 'OK';
    try { await import('@vercel/blob'); } catch (e) { lib = 'ERROR ' + clip(e && e.message, 200); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<!doctype html><title>Brief status</title><p>Brief API is running. Storage connected: '
      + (storeReady() ? 'YES' : 'NO') + '. Library: ' + lib + '. Variables: ' + envNames() + '. Email: ' + (process.env.RESEND_API_KEY ? 'YES' : 'NO') + '.</p>');
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
    catch (e) { return res.status(400).json({ error: 'invalid' }); }
    if (!body.name || !Array.isArray(body.answers) || body.answers.length > 600) {
      return res.status(400).json({ error: 'invalid' });
    }
    const record = {
      name: clip(body.name, 120),
      submittedAt: new Date().toISOString(),
      answers: body.answers.map((x) => ({
        section: clip(x && x.section, 200),
        q: clip(x && x.q, 300),
        type: x && x.type === 'check' ? 'check' : 'text',
        a: clip(x && x.a, 4000)
      }))
    };
    // Save and notify independently, so one failing does not lose the answers
    let saved = false, mailed = false;
    if (storeReady()) {
      try {
        const { put } = await import('@vercel/blob');
        await put(`brief/${Date.now()}.json`, JSON.stringify(record), {
          access: 'private', contentType: 'application/json', addRandomSuffix: true
        });
        saved = true;
      } catch (e) { console.error('store', e); }
    }
    if (process.env.RESEND_API_KEY) {
      try { mailed = await sendMail(record); } catch (e) { console.error('mail', e); }
    }
    if (!saved && !mailed) return res.status(503).json({ error: 'storage-not-connected' });
    return res.status(200).json({ ok: true, saved, mailed });
  }

  if (!storeReady() && !req.query.selftest) return res.status(503).json({ error: 'storage-not-connected' });

  try {
    const { put, list, get, del } = await import('@vercel/blob');

    if (req.method === 'GET') {
      if (!keyOk(req)) return res.status(401).json({ error: 'unauthorized' });

      if (req.query.selftest) {
        // Write, read back and delete one test record
        const t = await put('selftest/check.json', JSON.stringify({ at: Date.now() }), {
          access: 'private', contentType: 'application/json', addRandomSuffix: true
        });
        const back = await readPrivate(get, t.pathname);
        await del(t.url);
        const { blobs } = await list({ prefix: 'brief/' });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send('<!doctype html><title>Self test</title><p>Write OK. Read back: '
          + (back ? 'OK' : 'FAIL') + '. Saved briefs: ' + blobs.length + '.</p>');
      }

      const { blobs } = await list({ prefix: 'brief/' });
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const items = await Promise.all(blobs.slice(0, 30).map((b) => readPrivate(get, b.pathname).catch(() => null)));
      return res.status(200).json({ items: items.filter(Boolean) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error(e);
    if (req.query && req.query.selftest && keyOk(req)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send('<!doctype html><title>Self test</title><p>Self test failed: '
        + clip(e && (e.name + ': ' + e.message), 400).replace(/</g, '&lt;') + '</p>');
    }
    return res.status(500).json({ error: 'server' });
  }
}
