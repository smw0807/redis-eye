'use strict'

const { Router } = require('express')
const { getClient, isConnected } = require('../redis')

const router = Router()

// GET /api/key/:id — fetch type, value, TTL for a single key
// :id is base64-encoded to handle slashes and special chars safely
router.get('/key/:id', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8')
  const client = getClient()

  try {
    const [type, ttl] = await Promise.all([
      client.type(key),
      client.pttl(key),
    ])

    if (type === 'none') {
      return res.status(404).json({ error: 'Key not found' })
    }

    let value

    switch (type) {
      case 'string':
        value = await client.get(key)
        break

      case 'hash': {
        const raw = await client.hgetall(key)
        value = raw
        break
      }

      case 'list': {
        const len = await client.llen(key)
        // Return up to 500 items
        value = await client.lrange(key, 0, 499)
        if (len > 500) value = { items: value, total: len, truncated: true }
        break
      }

      case 'set': {
        const slen = await client.scard(key)
        // SSCAN to get up to 500 members
        const [, members] = await client.sscan(key, '0', 'COUNT', 500)
        value = { items: members, total: slen, truncated: slen > 500 }
        break
      }

      case 'zset': {
        const zlen = await client.zcard(key)
        // Get up to 500 members with scores
        const raw = await client.zrange(key, 0, 499, 'WITHSCORES')
        const items = []
        for (let i = 0; i < raw.length; i += 2) {
          items.push({ member: raw[i], score: Number(raw[i + 1]) })
        }
        value = { items, total: zlen, truncated: zlen > 500 }
        break
      }

      default:
        value = null
    }

    res.json({ key, type, ttl, value })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/key/:id
router.delete('/key/:id', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  const key = Buffer.from(req.params.id, 'base64url').toString('utf8')
  const client = getClient()

  try {
    const count = await client.del(key)
    res.json({ ok: true, deleted: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
