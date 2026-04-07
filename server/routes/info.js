'use strict'

const { Router } = require('express')
const { getClient, isConnected } = require('../redis')

const router = Router()

// GET /api/info
router.get('/info', async (_req, res) => {
  if (!isConnected()) {
    return res.status(400).json({ error: 'Not connected' })
  }

  try {
    const client = getClient()
    const raw = await client.info()

    // Parse INFO output into key-value pairs
    const info = {}
    for (const line of raw.split('\r\n')) {
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf(':')
      if (idx === -1) continue
      info[line.slice(0, idx)] = line.slice(idx + 1)
    }

    res.json({
      version: info['redis_version'],
      mode: info['redis_mode'],
      os: info['os'],
      uptimeSeconds: Number(info['uptime_in_seconds']),
      connectedClients: Number(info['connected_clients']),
      usedMemoryHuman: info['used_memory_human'],
      maxmemoryHuman: info['maxmemory_human'],
      totalCommandsProcessed: Number(info['total_commands_processed']),
      role: info['role'],
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
