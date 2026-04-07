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
        </div>
        <div class="sidebar-actions">
          <select
            v-if="dbs.length > 0"
            class="db-select input-field"
            :value="currentDb"
            @change="switchDb($event)">
            <option v-for="d in dbs" :key="d.db" :value="d.db">
              db{{ d.db }} ({{ d.keys }})
            </option>
          </select>
          <button
            class="btn btn-primary add-key-btn"
            @click="showAddModal = true">
            + New
          </button>
          <button
            class="btn btn-secondary icon-btn"
            title="Refresh key list"
            @click="keyListRef?.refresh()">
            ↻
          </button>
          <button class="btn btn-secondary disconnect-btn" @click="disconnect">
            Disconnect
          </button>
        </div>
      </div>

      <KeyList
        ref="keyListRef"
        :selected-key="selectedKey"
        @select="selectKey" />
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

      <KeyDetail :key-name="selectedKey" @deleted="onKeyDeleted" />
    </main>
  </div>

  <AddKeyModal
    v-if="showAddModal"
    @close="showAddModal = false"
    @created="onKeyCreated" />
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue';
import {useRouter} from 'vue-router';
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
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({db}),
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
  await fetch('/api/disconnect', {method: 'DELETE'});
  router.push('/');
}

function selectKey(key: string) {
  selectedKey.value = key;
}

function onKeyDeleted(_key: string) {
  selectedKey.value = null;
  keyListRef.value?.refresh();
}

function onKeyCreated(key: string) {
  showAddModal.value = false;
  keyListRef.value?.refresh();
  selectedKey.value = key;
  fetchDbs();
}

onMounted(async () => {
  await Promise.all([fetchInfo(), fetchDbs()]);

  // Try to get connection address from info
  if (info.value) {
    connAddr.value = 'connected';
  }
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

.sidebar-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.db-select {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
}

.add-key-btn {
  font-size: 12px;
  padding: 4px 10px;
}

.icon-btn {
  font-size: 14px;
  padding: 4px 8px;
}

.disconnect-btn {
  font-size: 12px;
  padding: 4px 10px;
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
</style>
