'use strict';

const Redis = require('ioredis');

let client = null;
let connOptions = null;

/**
 * Connect to Redis with given options.
 * Throws if connection fails within timeout.
 */
async function connect({ host = '127.0.0.1', port = 6379, password, db = 0, tls = false } = {}) {
  if (client) {
    await disconnect();
  }
  connOptions = { host, port: Number(port), db: Number(db) };

  const options = {
    host,
    port: Number(port),
    db: Number(db),
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  };

  if (password) {
    options.password = password;
  }

  if (tls) {
    options.tls = { rejectUnauthorized: false };
  }

  client = new Redis(options);

  // Ensure connection errors don't cause unhandled rejections after connect()
  client.on('error', () => {});

  await client.connect();
  return client;
}

async function disconnect() {
  if (client) {
    try {
      await client.quit();
    } catch (_) {
      client.disconnect();
    }
    client = null;
    connOptions = null;
  }
}

function getClient() {
  return client;
}

function isConnected() {
  return client !== null && client.status === 'ready';
}

function getConnOptions() {
  return connOptions;
}

module.exports = { connect, disconnect, getClient, isConnected, getConnOptions };
