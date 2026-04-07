'use strict'

const { Router } = require('express')
const { getClient, isConnected } = require('../redis')

const router = Router()

// GET /api/keys?cursor=0&match=*&count=100
router.get('/keys', async (req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  const cursor = req.query.cursor ?? '0'
  const match = req.query.match ?? '*'
  const count = Math.min(Number(req.query.count ?? 100), 500)

  try {
    const client = getClient()
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', count)

    // Get type for each key (pipeline for efficiency)
    const pipeline = client.pipeline()
    for (const key of keys) {
      pipeline.type(key)
    }
    const typeResults = await pipeline.exec()

    const items = keys.map((key, i) => ({
      key,
      type: typeResults[i]?.[1] ?? 'unknown',
    }))

    res.json({ cursor: nextCursor, items, done: nextCursor === '0' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
