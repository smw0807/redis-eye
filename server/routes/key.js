'use strict';

const { Router } = require('express');
const { getClient, isConnected } = require('../redis');

const router = Router();

// GET /api/key/:id — fetch type, value, TTL for a single key
// :id is base64-encoded to handle slashes and special chars safely
router.get('/key/:id', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' });
  }

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const client = getClient();

  try {
    const [type, ttl] = await Promise.all([client.type(key), client.pttl(key)]);

    if (type === 'none') {
      return res.status(404).json({ error: 'Key not found' });
    }

    let value;

    switch (type) {
      case 'string':
        value = await client.get(key);
        break;

      case 'hash': {
        const raw = await client.hgetall(key);
        value = raw;
        break;
      }

      case 'list': {
        const len = await client.llen(key);
        // Return up to 500 items
        value = await client.lrange(key, 0, 499);
        if (len > 500) value = { items: value, total: len, truncated: true };
        break;
      }

      case 'set': {
        const slen = await client.scard(key);
        // SSCAN to get up to 500 members
        const [, members] = await client.sscan(key, '0', 'COUNT', 500);
        value = { items: members, total: slen, truncated: slen > 500 };
        break;
      }

      case 'zset': {
        const zlen = await client.zcard(key);
        // Get up to 500 members with scores
        const raw = await client.zrange(key, 0, 499, 'WITHSCORES');
        const items = [];
        for (let i = 0; i < raw.length; i += 2) {
          items.push({ member: raw[i], score: Number(raw[i + 1]) });
        }
        value = { items, total: zlen, truncated: zlen > 500 };
        break;
      }

      default:
        value = null;
    }

    res.json({ key, type, ttl, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/key — create a new key
router.post('/key', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' });
  }

  const { key, type, value, ttl } = req.body;

  if (!key || !type || value === undefined) {
    return res.status(400).json({ error: 'key, type, value are required' });
  }

  const client = getClient();

  try {
    const exists = await client.exists(key);
    if (exists) {
      return res.status(409).json({ error: 'Key already exists' });
    }

    switch (type) {
      case 'string':
        await client.set(key, String(value));
        break;

      case 'hash': {
        if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
          return res.status(400).json({ error: 'Hash value must be a non-empty object' });
        }
        await client.hset(key, ...Object.entries(value).flat());
        break;
      }

      case 'list': {
        if (!Array.isArray(value) || value.length === 0) {
          return res.status(400).json({ error: 'List value must be a non-empty array' });
        }
        await client.rpush(key, ...value.map(String));
        break;
      }

      case 'set': {
        if (!Array.isArray(value) || value.length === 0) {
          return res.status(400).json({ error: 'Set value must be a non-empty array' });
        }
        await client.sadd(key, ...value.map(String));
        break;
      }

      case 'zset': {
        if (!Array.isArray(value) || value.length === 0) {
          return res.status(400).json({ error: 'ZSet value must be a non-empty array' });
        }
        const args = [];
        for (const item of value) {
          if (item.member === undefined || item.score === undefined) {
            return res.status(400).json({ error: 'ZSet items must have member and score' });
          }
          args.push(Number(item.score), String(item.member));
        }
        await client.zadd(key, ...args);
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    if (ttl && Number(ttl) > 0) {
      await client.expire(key, Number(ttl));
    }

    res.json({ ok: true, key, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/key/:id
router.delete('/key/:id', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' });
  }

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const client = getClient();

  try {
    const count = await client.del(key);
    res.json({ ok: true, deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/key/:id/rename — rename a key
router.patch('/key/:id/rename', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const { newKey } = req.body;

  if (!newKey || typeof newKey !== 'string') {
    return res.status(400).json({ error: 'newKey is required' });
  }

  const client = getClient();
  try {
    await client.rename(key, newKey);
    res.json({ ok: true, newKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/key/:id/value — update string value (preserves TTL)
router.put('/key/:id/value', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const { value } = req.body;

  if (value === undefined) return res.status(400).json({ error: 'value is required' });

  const client = getClient();
  try {
    const pttl = await client.pttl(key);
    await client.set(key, String(value));
    if (pttl > 0) await client.pexpire(key, pttl);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/key/:id/ttl — update TTL (ttl=-1 to persist, ttl>0 for seconds)
router.put('/key/:id/ttl', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const { ttl } = req.body;

  const client = getClient();
  try {
    if (Number(ttl) === -1) {
      await client.persist(key);
    } else {
      const seconds = Number(ttl);
      if (isNaN(seconds) || seconds <= 0) {
        return res.status(400).json({ error: 'ttl must be a positive number or -1 to persist' });
      }
      await client.expire(key, seconds);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/key/:id/hash — set/update a hash field
router.put('/key/:id/hash', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const { field, value } = req.body;

  if (!field || value === undefined) {
    return res.status(400).json({ error: 'field and value are required' });
  }

  const client = getClient();
  try {
    await client.hset(key, field, String(value));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/key/:id/hash/:fieldId — delete a hash field (:fieldId is base64url encoded)
router.delete('/key/:id/hash/:fieldId', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const field = Buffer.from(req.params.fieldId, 'base64url').toString('utf8');

  const client = getClient();
  try {
    await client.hdel(key, field);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/key/:id/list/:index — update a list item at index
router.put('/key/:id/list/:index', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const index = parseInt(req.params.index, 10);
  const { value } = req.body;

  if (isNaN(index) || value === undefined) {
    return res.status(400).json({ error: 'index and value are required' });
  }

  const client = getClient();
  try {
    await client.lset(key, index, String(value));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/key/:id/list/move — reorder a list item (from index → to index)
router.post('/key/:id/list/move', async (req, res) => {
  if (!isConnected()) return res.status(400).json({ error: 'Not connected' });

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8');
  const { from, to } = req.body;

  if (from === undefined || to === undefined) {
    return res.status(400).json({ error: 'from and to are required' });
  }
  if (Number(from) === Number(to)) return res.json({ ok: true });

  const client = getClient();
  try {
    const total = await client.llen(key);
    if (total > 500) {
      return res
        .status(400)
        .json({ error: '500개 초과 리스트는 순서 변경이 지원되지 않습니다' });
    }
    const items = await client.lrange(key, 0, -1);
    const [item] = items.splice(Number(from), 1);
    items.splice(Number(to), 0, item);
    const pipeline = client.multi();
    pipeline.del(key);
    if (items.length > 0) pipeline.rpush(key, ...items);
    await pipeline.exec();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
