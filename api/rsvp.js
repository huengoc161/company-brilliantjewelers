// RSVP submissions from the landing page.
// POST: save one RSVP to the private Vercel Blob store and append it to Huệ's Google Sheet (through its Apps Script web app).
// GET ?key=…: download every saved RSVP as CSV, a backup if the sheet ever misses a row.
import { createHash } from 'node:crypto';

// Same viewing code as the brief results page; only its SHA-256 lives in this public repo
const KEY_HASH = process.env.BRIEF_ADMIN_KEY_HASH || '8ae08cd71d7fe2a2cea351b2ba6f92f504e08d2c5b3ae75b918249a391339fef';
// Web app URL of the Apps Script bound to the "Shine Redefined – RSVP" sheet
const SHEET_URL = process.env.RSVP_SHEET_URL || '';

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const keyOk = (req) => createHash('sha256').update(String(req.query.key || '')).digest('hex') === KEY_HASH;
const storeReady = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
const COLS = ['submittedAt', 'name', 'phone', 'email', 'language', 'source', 'consent'];
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
    catch (e) { return res.status(400).json({ error: 'invalid' }); }
    const record = {
      submittedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' }),
      name: clip(body.name, 120),
      phone: clip(body.phone, 40),
      email: clip(body.email, 200),
      language: clip(body.language, 40),
      source: clip(body.source, 40),
      consent: body.consent ? 'Yes' : 'No'
    };
    if (!record.name || !record.phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) || record.consent !== 'Yes') {
      return res.status(400).json({ error: 'invalid' });
    }
    // Save and forward independently, so one failing does not lose the RSVP
    let saved = false, sheet = false;
    if (storeReady()) {
      try {
        const { put } = await import('@vercel/blob');
        await put(`rsvp/${Date.now()}.json`, JSON.stringify(record), {
          access: 'private', contentType: 'application/json', addRandomSuffix: true
        });
        saved = true;
      } catch (e) { console.error('store', e); }
    }
    if (SHEET_URL) {
      try {
        const r = await fetch(SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
        sheet = r.ok;
        if (!r.ok) console.error('sheet', r.status);
      } catch (e) { console.error('sheet', e); }
    }
    if (!saved && !sheet) return res.status(503).json({ error: 'not-saved' });
    return res.status(200).json({ ok: true, saved, sheet });
  }

  if (req.method === 'GET') {
    if (!keyOk(req)) return res.status(401).json({ error: 'unauthorized' });
    if (!storeReady()) return res.status(503).json({ error: 'storage-not-connected' });
    try {
      const { list, get } = await import('@vercel/blob');
      const blobs = [];
      let cursor;
      do {
        const page = await list({ prefix: 'rsvp/', cursor });
        blobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      blobs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      const rows = await Promise.all(blobs.map(async (b) => {
        const r = await get(b.pathname, { access: 'private', useCache: false });
        return r && r.statusCode === 200 ? JSON.parse(await new Response(r.stream).text()) : null;
      }));
      const csv = [COLS.join(',')].concat(rows.filter(Boolean).map((x) => COLS.map((c) => csvCell(x[c])).join(','))).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="shine-redefined-rsvp.csv"');
      return res.status(200).send('﻿' + csv);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'server' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method' });
}
