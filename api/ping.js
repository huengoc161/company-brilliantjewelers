export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<!doctype html><title>pong</title><p>pong ' + (process.env.BLOB_READ_WRITE_TOKEN ? 'storage YES' : 'storage NO') + '</p>');
}
