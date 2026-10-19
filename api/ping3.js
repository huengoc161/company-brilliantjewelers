import { createHash } from 'node:crypto';
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<!doctype html><title>p3</title><p>p3 ' + createHash('sha256').update('a').digest('hex').slice(0, 6) + ' q=' + JSON.stringify(req.query) + '</p>');
}
