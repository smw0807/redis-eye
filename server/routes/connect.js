'use strict';

const { Router } = require('express');
const { connect, disconnect, isConnected, getConnOptions } = require('../redis');

const router = Router();

// POST /api/connect
router.post('/connect', async (req, res) => {
  const { host = '127.0.0.1', port = 6379, password, db = 0, tls = false } = req.body;

  try {
    await connect({ host, port, password, db, tls });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// DELETE /api/disconnect
router.delete('/disconnect', async (_req, res) => {
  try {
    await disconnect();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/status
router.get('/status', (_req, res) => {
  const opts = getConnOptions();
  res.json({
    connected: isConnected(),
    host: opts?.host ?? null,
    port: opts?.port ?? null,
    db: opts?.db ?? null,
  });
});

module.exports = router;
