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
  });
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
  console.log(`PlantUML Editor server running on port ${PORT}`);
});
