<template>
  <div class="dashboard">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="brand">
          <span class="brand-icon">⬡</span>
          <span class="brand-name">redis-eye</span>
        </div>
        <div class="conn-info">
          <span class="conn-dot" />
          <span class="conn-addr mono">{{ connAddr }}</span>
          <span class="conn-db">DB {{ currentDb }}</span>
          <span v-if="readOnly" class="readonly-badge">READ ONLY</span>
        </div>
        <div class="sidebar-actions">
          <div class="db-row">
            <select
              v-if="dbs.length > 0"
              class="db-select input-field"
              :value="currentDb"
              @change="switchDb($event)"
            >
              <option v-for="d in dbs" :key="d.db" :value="d.db">
                db{{ d.db }} ({{ d.keys }})
              </option>
            </select>
            <button class="btn btn-secondary disconnect-btn" @click="disconnect">Disconnect</button>
          </div>
        </div>
      </div>

      <div class="key-list-toolbar">
        <button v-if="!readOnly" class="btn btn-primary add-key-btn" @click="showAddModal = true">+ Add Key</button>
        <button
          class="btn btn-secondary icon-btn"
          title="Pub/Sub Monitor"
          @click="router.push('/pubsub')"
        >
          📡
        </button>
        <button
          class="btn btn-secondary icon-btn"
          title="Refresh key list"
          @click="keyListRef?.refresh()"
        >
          ↻
        </button>
      </div>

      <KeyList ref="keyListRef" :selected-key="selectedKey" :read-only="readOnly" @select="selectKey" @bulk-deleted="onBulkDeleted" />
    </aside>

    <!-- Main content -->
    <main class="main">
      <!-- Info bar -->
      <div v-if="info" class="info-bar">
        <span class="info-item">Redis {{ info.version }}</span>
        <span class="info-sep" />
        <span class="info-item">{{ info.usedMemoryHuman }} used</span>
        <span class="info-sep" />
        <span class="info-item">{{ info.connectedClients }} clients</span>
        <span class="info-sep" />
        <span class="info-item" :class="info.role">{{ info.role }}</span>
      </div>

      <!-- Connection status banner -->
      <div v-if="connStatus !== 'connected'" class="conn-status-banner" :class="connStatus">
        <template v-if="connStatus === 'reconnecting'">
          <span class="conn-status-spinner" />
          <span>Redis 연결이 끊어졌습니다. 재연결 시도 중…</span>
        </template>
        <template v-else-if="connStatus === 'reconnected'">
          <span class="conn-status-icon">✓</span>
          <span>Redis에 재연결되었습니다.</span>
        </template>
      </div>

      <KeyDetail :key-name="selectedKey" :read-only="readOnly" @deleted="onKeyDeleted" @renamed="onKeyRenamed" />
    </main>
  </div>

  <AddKeyModal v-if="showAddModal" @close="showAddModal = false" @created="onKeyCreated" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import KeyList from '../components/KeyList.vue';
import KeyDetail from '../components/KeyDetail.vue';
import AddKeyModal from '../components/AddKeyModal.vue';

interface DbInfo {
  db: number;
  keys: number;
}

interface RedisInfo {
  version: string;
  usedMemoryHuman: string;
  connectedClients: number;
  role: string;
}

const router = useRouter();
const selectedKey = ref<string | null>(null);
const dbs = ref<DbInfo[]>([]);
const currentDb = ref(0);
const info = ref<RedisInfo | null>(null);
const connAddr = ref('');
const keyListRef = ref<InstanceType<typeof KeyList> | null>(null);
const showAddModal = ref(false);
const readOnly = ref(false);
const connStatus = ref<'connected' | 'reconnecting' | 'reconnected'>('connected');
let reconnectedTimer: ReturnType<typeof setTimeout> | null = null;
let statusPoller: ReturnType<typeof setInterval> | null = null;

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      if (connStatus.value === 'reconnecting') {
        connStatus.value = 'reconnected';
        if (reconnectedTimer) clearTimeout(reconnectedTimer);
        reconnectedTimer = setTimeout(() => {
          connStatus.value = 'connected';
        }, 3000);
      }
      if (data.host && !connAddr.value) {
        connAddr.value = `${data.host}:${data.port}`;
      }
    } else {
      if (reconnectedTimer) clearTimeout(reconnectedTimer);
      connStatus.value = 'reconnecting';
    }
  } catch {
    connStatus.value = 'reconnecting';
  }
}

async function fetchInfo() {
  try {
    const res = await fetch('/api/info');
    if (res.ok) info.value = await res.json();
  } catch {
    /* ignore */
  }
}

async function fetchDbs() {
  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      const data = await res.json();
      dbs.value = data.dbs;
      currentDb.value = data.current;
    }
  } catch {
    /* ignore */
  }
}

async function switchDb(event: Event) {
  const db = Number((event.target as HTMLSelectElement).value);
  try {
    await fetch('/api/db/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db }),
    });
    currentDb.value = db;
    selectedKey.value = null;
    keyListRef.value?.refresh();
    fetchDbs();
  } catch {
    /* ignore */
  }
}

async function disconnect() {
  await fetch('/api/disconnect', { method: 'DELETE' });
  sessionStorage.removeItem('redis-eye-readonly');
  router.push('/');
}

function selectKey(key: string) {
  selectedKey.value = key;
}

function onKeyDeleted(_key: string) {
  selectedKey.value = null;
  keyListRef.value?.refresh();
}

function onBulkDeleted(keys: string[]) {
  if (selectedKey.value && keys.includes(selectedKey.value)) {
    selectedKey.value = null;
  }
  fetchDbs();
}

function onKeyRenamed(_oldKey: string, newKey: string) {
  selectedKey.value = newKey;
  keyListRef.value?.refresh();
}

function onKeyCreated(key: string) {
  showAddModal.value = false;
  keyListRef.value?.refresh();
  selectedKey.value = key;
  fetchDbs();
}

onMounted(async () => {
  readOnly.value = sessionStorage.getItem('redis-eye-readonly') === '1';
  await Promise.all([fetchInfo(), fetchDbs()]);

  // Set actual host:port from status
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.host) connAddr.value = `${data.host}:${data.port}`;
  } catch { /* ignore */ }

  statusPoller = setInterval(pollStatus, 5000);
});

onUnmounted(() => {
  if (statusPoller) clearInterval(statusPoller);
  if (reconnectedTimer) clearTimeout(reconnectedTimer);
});
</script>

<style scoped>
.dashboard {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 300px;
  min-width: 220px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 16px;
}

.brand-icon {
  color: var(--danger);
  font-size: 18px;
}

.conn-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.conn-addr {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.conn-db {
  color: var(--text-muted);
  font-size: 11px;
}

.readonly-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 50%, transparent);
  border-radius: 20px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.db-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.db-select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 12px;
}

.disconnect-btn {
  font-size: 12px;
  padding: 4px 10px;
  white-space: nowrap;
}

.key-list-toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.add-key-btn {
  flex: 1;
  font-size: 12px;
  padding: 4px 10px;
  justify-content: center;
}

.icon-btn {
  font-size: 14px;
  padding: 4px 8px;
}

/* Main */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

.info-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  overflow-x: auto;
  white-space: nowrap;
}

.info-sep {
  width: 1px;
  height: 12px;
  background: var(--border);
}

.master {
  color: var(--success);
}

.slave,
.replica {
  color: var(--warning);
}

/* Connection status banner */
.conn-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.conn-status-banner.reconnecting {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 30%, transparent);
}

.conn-status-banner.reconnected {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 30%, transparent);
}

.conn-status-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.conn-status-icon {
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
