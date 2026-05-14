const express = require('express');
const path = require('path');
const { createStorage, FileStorage } = require('./lib/storage');
const createShareRouter = require('./lib/api-routes');

const app = express();
const PORT = process.env.PORT || 8001;
const PUBLIC_DIR = path.join(__dirname, 'public');

const storage = createStorage();

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

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'puml.html'));
});

app.get('/gliffy', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'gliffy.html'));
});

app.use(express.static(PUBLIC_DIR, {
  index: false,
  extensions: ['html'],
}));

app.use(createShareRouter(storage));

if (storage instanceof FileStorage) {
  const runCleanup = () => storage.cleanup();
  setInterval(runCleanup, 3600000);
  runCleanup();
}

app.listen(PORT, () => {
  console.log(`Sequence Diagram Editor server running on port ${PORT}`);
});
