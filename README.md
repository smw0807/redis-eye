# redis-eye

> Lightweight Redis GUI — explore and manage your Redis data with a single `npx` command.

**[한국어 문서 보기](https://github.com/smw0807/redis-eye/blob/main/README.ko.md)**

---

## Quick Start

No installation required — run directly with npx:

```bash
npx redis-eye
```

Or install globally (recommended for repeated use):

```bash
npm install -g redis-eye
redis-eye
```

> **Note:** `npm install redis-eye` (without `-g`) installs locally and does not add `redis-eye` to your PATH. Use `npx` or install with `-g`.

A browser window opens automatically at `http://127.0.0.1:<port>`.

---

## What It Does

redis-eye launches a local web GUI for Redis. Connect to any Redis instance, browse your keys, and edit data — all from the browser, with zero configuration.

![screenshot placeholder](https://github.com/smw0807/redis-eye/blob/main/imgs/main-page.png?raw=true)
![screenshot placeholder](https://github.com/smw0807/redis-eye/blob/main/imgs/dashboard.png?raw=true)
![screenshot placeholder](https://github.com/smw0807/redis-eye/blob/main/imgs/add-key.png?raw=true)

---

## Features

### Connection

- Connect to any Redis server (host, port, password, DB index)
- Save and manage named connection profiles (stored locally)
- Auto-reconnect detection with navigation guard

### Key Browser

- SCAN-based key listing (never uses `KEYS` — safe for production)
- Infinite scroll with lazy loading
- Search by glob pattern (e.g. `user:*`, `session:??:*`)
- Search history dropdown (last 8 patterns)
- Filter by type: String / Hash / List / Set / ZSet
- Filter by TTL: show only keys expiring within 5 minutes
- Real-time TTL countdown with color-coded urgency badges

### Data Viewer & Editor

| Type   | View                                              | Edit                                  |
| ------ | ------------------------------------------------- | ------------------------------------- |
| String | Raw value, JSON pretty-print with expand/collapse | Inline textarea, Format JSON button   |
| Hash   | Field/value table                                 | Add, edit, delete individual fields   |
| List   | Indexed table                                     | Edit items, reorder with move up/down |
| Set    | Tag cloud                                         | —                                     |
| ZSet   | Score/member table                                | —                                     |

### Key Management

- Create keys for all 5 types with type-specific forms
- Rename keys inline (RENAME command)
- Delete single key with confirmation dialog
- Bulk delete — select multiple keys and delete at once
- Edit TTL (extend, set, or make permanent)

### Database & Server Info

- Switch between DB 0–15 with key count preview per database
- Live server info: Redis version, memory usage, connected clients, role, uptime

---

## Requirements

- **Node.js** >= 18
- A running Redis instance (local or remote)

---

## Connection Defaults

| Field    | Default   |
| -------- | --------- |
| Host     | 127.0.0.1 |
| Port     | 6379      |
| Password | (none)    |
| DB       | 0         |

---

## How It Works

```
npx redis-eye
    │
    ├── Scans ports 3000–3010 for an available port
    ├── Starts an Express server (bound to 127.0.0.1 only)
    ├── Serves the pre-built Vue 3 SPA from dist/
    └── Opens your default browser automatically
```

The server binds **only** to `127.0.0.1` — it is never exposed to external networks.

---

## Security Notes

- The server is local-only (`127.0.0.1`). External access is not possible by design.
- Connection passwords are held in server memory only and are never written to disk during an active session.
- Saved profiles store passwords in plaintext in local storage — avoid saving credentials for sensitive production instances.
- All key listing uses `SCAN` (never `KEYS`) to avoid blocking your Redis server.

---

## CLI Options

```bash
redis-eye [--port <number>]
```

| Option   | Description                                   | Default |
| -------- | --------------------------------------------- | ------- |
| `--port` | Override the starting port for auto-detection | `7379`  |

---

## License

MIT

---

**[한국어 문서 보기 →](https://github.com/smw0807/redis-eye/blob/main/README.ko.md)**
