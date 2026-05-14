const express = require('express');
const { createStorage } = require('../lib/storage');
const createShareRouter = require('../lib/api-routes');

const app = express();

let storage;
try {
  storage = createStorage();
} catch (e) {
  console.error('[api] Storage init failed:', e.message);
  storage = null;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ limit: '2mb' }));

app.get('/api/config', (req, res) => {
  res.json({
    krokiUrl: process.env.KROKI_URL || '',
    krokiProxy: true,
  });
});

function getKrokiBase() {
  const raw = process.env.KROKI_URL || process.env.KROKI_BASE_URL || 'https://kroki.io';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return raw.replace(/\/+$/, '');
  }
}

app.post('/api/kroki/:lang/:format', async (req, res) => {
  const url = `${getKrokiBase()}/${req.params.lang}/${req.params.format}`;
  try {
    const body = typeof req.body === 'string'
      ? req.body
      : (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body || ''));
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await resp.arrayBuffer());
    res.status(resp.status).set('Content-Type', contentType).send(buffer);
  } catch (e) {
    res.status(502).json({ error: 'Kroki proxy failed: ' + e.message });
  }
});

if (storage) {
  app.use(createShareRouter(storage));
} else {
  app.use('/api/share', (req, res) => {
    res.status(503).json({ error: 'Storage unavailable. Configure UPSTASH_REDIS_REST_URL for Vercel deployments.' });
  });
}

module.exports = app;
