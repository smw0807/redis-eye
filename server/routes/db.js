'use strict'

const { Router } = require('express')
const { getClient, isConnected, connect } = require('../redis')

const router = Router()

// GET /api/db — returns key counts per database
router.get('/db', async (_req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  try {
    const client = getClient()
    const raw = await client.info('keyspace')

    // Parse "db0:keys=3,expires=0,avg_ttl=0" lines
    const dbs = []
    for (const line of raw.split('\r\n')) {
      const m = line.match(/^(db\d+):keys=(\d+)/)
      if (m) {
        dbs.push({ db: parseInt(m[1].slice(2), 10), keys: Number(m[2]) })
      }
    }

    // Also return current db
    const currentDb = client.options.db ?? 0
    res.json({ dbs, current: currentDb })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/db/switch — switch to a different db index
router.post('/db/switch', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  const { db } = req.body
  if (db === undefined || db === null) {
    return res.status(400).json({ error: 'db index required' })
  }

  try {
    const client = getClient()
    const { options } = client

    // Re-connect with the same params but different db
    await connect({
      host: options.host,
      port: options.port,
      password: options.password,
      db: Number(db),
    })

    res.json({ ok: true, db: Number(db) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
