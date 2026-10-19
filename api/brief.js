// Saves brief answers to Vercel Blob (POST) and lists them for Huệ (GET with ?key=)
import { put, list } from '@vercel/blob';
import { createHash } from 'node:crypto';

// Only the SHA-256 of Huệ's viewing code is stored here, so the public repo does not reveal it
const KEY_HASH = process.env.BRIEF_ADMIN_KEY_HASH || '8ae08cd71d7fe2a2cea351b2ba6f92f504e08d2c5b3ae75b918249a391339fef';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'storage-not-connected' });
  try {
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
        access: 'public', contentType: 'application/json', addRandomSuffix: true
      });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'GET') {
      const given = createHash('sha256').update(String(req.query.key || '')).digest('hex');
      if (given !== KEY_HASH) return res.status(401).json({ error: 'unauthorized' });
      const { blobs } = await list({ prefix: 'brief/' });
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const items = await Promise.all(blobs.slice(0, 30).map(async (b) => {
        const r = await fetch(b.url, { cache: 'no-store' });
        return r.ok ? r.json() : null;
      }));
      return res.status(200).json({ items: items.filter(Boolean) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server' });
  }
}
