'use strict';

const { Router } = require('express');
const { getClient, isConnected } = require('../redis');

const router = Router();

// GET /api/keys?cursor=0&match=*&count=100
router.get('/keys', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' });
  }

  const cursor = req.query.cursor ?? '0';
  const match = req.query.match ?? '*';
  const count = Math.min(Number(req.query.count ?? 100), 500);

  try {
    const client = getClient();
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', count);

    // Get type and TTL for each key (pipeline for efficiency)
    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.type(key);
      pipeline.pttl(key);
    }
    const results = await pipeline.exec();

    const items = keys.map((key, i) => ({
      key,
      type: results[i * 2]?.[1] ?? 'unknown',
      ttl: results[i * 2 + 1]?.[1] ?? -1,
    }));

    res.json({ cursor: nextCursor, items, done: nextCursor === '0' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/keys/export — export keys with full values (JSON)
router.post('/keys/export', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'keys array is required' });
  }

  const client = getClient();
  try {
    // Fetch type and TTL for all keys in one pipeline
    const metaPipeline = client.pipeline();
    for (const key of keys) {
      metaPipeline.type(key);
      metaPipeline.pttl(key);
    }
    const metaResults = await metaPipeline.exec();

    const entries = keys.map((key, i) => ({
      key,
      type: metaResults[i * 2]?.[1] ?? 'unknown',
      pttl: metaResults[i * 2 + 1]?.[1] ?? -1,
    }));

    // Fetch values concurrently
    const exportData = await Promise.all(
      entries.map(async ({ key, type, pttl }) => {
        const ttl = pttl < 0 ? -1 : Math.ceil(pttl / 1000);
        let value;
        switch (type) {
          case 'string':
            value = await client.get(key);
            break;
          case 'hash':
            value = await client.hgetall(key);
            break;
          case 'list':
            value = await client.lrange(key, 0, 499);
            break;
          case 'set': {
            const [, members] = await client.sscan(key, '0', 'COUNT', 500);
            value = members;
            break;
          }
          case 'zset': {
            const raw = await client.zrange(key, 0, 499, 'WITHSCORES');
            const items = [];
            for (let j = 0; j < raw.length; j += 2) {
              items.push({ member: raw[j], score: Number(raw[j + 1]) });
            }
            value = items;
            break;
          }
          default:
            value = null;
        }
        return { key, type, ttl, value };
      })
    );

    const filename = `redis-export-${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/keys — bulk delete multiple keys
router.delete('/keys', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'keys array is required' });
  }

  const client = getClient();
  try {
    const count = await client.del(...keys);
    res.json({ ok: true, deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
