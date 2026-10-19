// Brief answers for Shine Redefined, stored in a private Vercel Blob store.
// POST: save one submission. GET ?key=…: list submissions for Huệ. GET ?ping=1: status page.
// Auth to the store uses Vercel OIDC (the store is connected to this project), so no token is kept in code.
import { createHash } from 'node:crypto';

// Only the SHA-256 of Huệ's viewing code is stored here, so the public repo does not reveal it
const KEY_HASH = process.env.BRIEF_ADMIN_KEY_HASH || '8ae08cd71d7fe2a2cea351b2ba6f92f504e08d2c5b3ae75b918249a391339fef';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const keyOk = (req) => createHash('sha256').update(String(req.query.key || '')).digest('hex') === KEY_HASH;
const storeReady = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

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
      + (storeReady() ? 'YES' : 'NO') + '. Library: ' + lib + '.</p>');
  }

  if (!storeReady()) return res.status(503).json({ error: 'storage-not-connected' });

  try {
    const { put, list, get, del } = await import('@vercel/blob');

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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
      await put(`brief/${Date.now()}.json`, JSON.stringify(record), {
        access: 'private', contentType: 'application/json', addRandomSuffix: true
      });
      return res.status(200).json({ ok: true });
    }

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
    return res.status(500).json({ error: 'server' });
  }
}
