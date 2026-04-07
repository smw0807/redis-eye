'use strict'

const path = require('path')
const express = require('express')

const connectRoute = require('./routes/connect')
const keysRoute = require('./routes/keys')
const keyRoute = require('./routes/key')
const dbRoute = require('./routes/db')
const infoRoute = require('./routes/info')

const app = express()
app.use(express.json())

// API routes
app.use('/api', connectRoute)
app.use('/api', keysRoute)
app.use('/api', keyRoute)
app.use('/api', dbRoute)
app.use('/api', infoRoute)

// Serve built frontend
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

function start(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve({ server, port }))
    server.on('error', reject)
  })
}

module.exports = { app, start }
