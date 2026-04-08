'use strict';

const { Router } = require('express');
const Redis = require('ioredis');
const { getConnOptions, isConnected, getClient } = require('../redis');

const router = Router();

// GET /api/pubsub/subscribe?channel=xxx  — SSE stream
router.get('/pubsub/subscribe', (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected to Redis' });
  }

  const { channel } = req.query;
  if (!channel) {
    return res.status(400).json({ error: 'channel parameter is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const opts = getConnOptions();
  const subOpts = {
    host: opts.host,
    port: opts.port,
    db: opts.db,
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  if (opts.password) subOpts.password = opts.password;
  if (opts.tls) subOpts.tls = { rejectUnauthorized: false };

  const subscriber = new Redis(subOpts);
  subscriber.on('error', () => {});

  subscriber.connect()
    .then(() => subscriber.subscribe(channel))
    .catch((err) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

  subscriber.on('message', (ch, message) => {
    res.write(`data: ${JSON.stringify({ channel: ch, message, ts: Date.now() })}\n\n`);
  });

  // Heartbeat — keeps proxy from closing idle connections
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.quit().catch(() => subscriber.disconnect());
  });
});

// POST /api/pubsub/publish  — publish a test message
router.post('/pubsub/publish', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected to Redis' });
  }

  const { channel, message } = req.body;
  if (!channel || message === undefined || message === null) {
    return res.status(400).json({ error: 'channel and message are required' });
  }

  try {
    const receivers = await getClient().publish(channel, String(message));
    res.json({ ok: true, receivers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
