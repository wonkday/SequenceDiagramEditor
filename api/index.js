const express = require('express');
const { createStorage } = require('../lib/storage');
const createShareRouter = require('../lib/api-routes');

const app = express();
const storage = createStorage();

app.use(express.json({ limit: '2mb' }));
app.use(express.text({ limit: '2mb' }));
app.use(createShareRouter(storage));

module.exports = app;
