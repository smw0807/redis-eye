'use strict';

const path = require('path');
const express = require('express');

const connectRoute = require('./routes/connect');
const keysRoute = require('./routes/keys');
const keyRoute = require('./routes/key');
const dbRoute = require('./routes/db');
const infoRoute = require('./routes/info');
const pubsubRoute = require('./routes/pubsub');

const app = express();
app.use(express.json());

// API routes
app.use('/api', connectRoute);
app.use('/api', keysRoute);
app.use('/api', keyRoute);
app.use('/api', dbRoute);
app.use('/api', infoRoute);
app.use('/api', pubsubRoute);

// Serve built frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

function start(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve({ server, port }));
    server.on('error', reject);
  });
}

// 직접 실행 시 자동 시작 (nodemon server/index.js)
if (require.main === module) {
  start(3000).then(({ port }) => {
    console.log(`  server running at http://127.0.0.1:${port}`);
  });
}

module.exports = { app, start };
