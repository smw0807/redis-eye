#!/usr/bin/env node
'use strict'

const { start } = require('../server/index')

const START_PORT = 3000
const MAX_PORT = 3010

async function findPort(from) {
  for (let port = from; port <= MAX_PORT; port++) {
    try {
      const result = await start(port)
      return result
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(`No available port found between ${from} and ${MAX_PORT}`)
}

;(async () => {
  try {
    const { port } = await findPort(START_PORT)
    const url = `http://127.0.0.1:${port}`
    console.log(`\n  redis-eye is running at ${url}\n`)

    // Dynamic import for ESM-only 'open' package
    const { default: open } = await import('open')
    await open(url)
  } catch (err) {
    console.error('Failed to start redis-eye:', err.message)
    process.exit(1)
  }
})()
