<template>
  <div class="key-detail">
    <!-- Empty state -->
    <div v-if="!keyName" class="empty-state">
      <p>Select a key from the list</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state"><span class="spinner" /> Loading key…</div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      {{ error }}
    </div>

    <!-- Key detail -->
    <template v-else-if="detail">
      <div class="detail-header">
        <div class="detail-key-name mono">{{ detail.key }}</div>
        <div class="detail-meta">
          <TypeBadge :type="detail.type" />
          <span class="ttl-badge" :class="{ expired: detail.ttl === -2 }">
            {{ formatTtl(detail.ttl) }}
          </span>
          <button class="btn btn-danger btn-sm" @click="deleteKey">Delete</button>
        </div>
      </div>

      <!-- String -->
      <div v-if="detail.type === 'string'" class="value-section">
        <pre class="value-pre">{{ detail.value }}</pre>
        <div v-if="isJson(detail.value as string)" class="json-view">
          <div class="section-label">Parsed JSON</div>
          <pre class="value-pre json">{{ prettyJson(detail.value as string) }}</pre>
        </div>
      </div>

      <!-- Hash -->
      <div v-else-if="detail.type === 'hash'" class="value-section">
        <div class="section-label">{{ Object.keys(hashValue).length }} fields</div>
        <table class="kv-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, k) in hashValue" :key="k">
              <td class="mono cell-field">{{ k }}</td>
              <td class="mono cell-value">{{ v }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- List -->
      <div v-else-if="detail.type === 'list'" class="value-section">
        <div class="section-label">
          {{ listInfo.total }} items
          <span v-if="listInfo.truncated" class="truncated-note">(showing first 500)</span>
        </div>
        <table class="kv-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in listInfo.items" :key="idx">
              <td class="cell-index">{{ idx }}</td>
              <td class="mono cell-value">{{ item }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Set -->
      <div v-else-if="detail.type === 'set'" class="value-section">
        <div class="section-label">
          {{ setInfo.total }} members
          <span v-if="setInfo.truncated" class="truncated-note">(showing first 500)</span>
        </div>
        <div class="tag-cloud">
          <span v-for="m in setInfo.items" :key="m" class="set-member mono">{{ m }}</span>
        </div>
      </div>

      <!-- ZSet -->
      <div v-else-if="detail.type === 'zset'" class="value-section">
        <div class="section-label">
          {{ zsetInfo.total }} members
          <span v-if="zsetInfo.truncated" class="truncated-note">(showing first 500)</span>
        </div>
        <table class="kv-table">
          <thead>
            <tr>
              <th>Score</th>
              <th>Member</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in zsetInfo.items" :key="item.member">
              <td class="cell-score">{{ item.score }}</td>
              <td class="mono cell-value">{{ item.member }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import TypeBadge from './TypeBadge.vue';

interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  value: unknown;
}

const props = defineProps<{ keyName: string | null }>();
const emit = defineEmits<{ (e: 'deleted', key: string): void }>();

const detail = ref<KeyDetail | null>(null);
const loading = ref(false);
const error = ref('');

function encodeKey(key: string) {
  return btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function fetchDetail(key: string) {
  loading.value = true;
  error.value = '';
  detail.value = null;

  try {
    const res = await fetch(`/api/key/${encodeKey(key)}`);
    const data = await res.json();

    if (!res.ok) {
      error.value = data.error || 'Failed to load key';
    } else {
      detail.value = data;
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Network error';
  } finally {
    loading.value = false;
  }
}

async function deleteKey() {
  if (!detail.value) return;
  if (!confirm(`Delete key "${detail.value.key}"?`)) return;

  try {
    await fetch(`/api/key/${encodeKey(detail.value.key)}`, { method: 'DELETE' });
    emit('deleted', detail.value.key);
    detail.value = null;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Delete failed';
  }
}

function formatTtl(ttl: number) {
  if (ttl === -1) return 'No expiry';
  if (ttl === -2) return 'Expired';
  if (ttl < 1000) return `${ttl} ms`;
  const sec = Math.floor(ttl / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function isJson(v: string) {
  if (!v || (v[0] !== '{' && v[0] !== '[')) return false;
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
}

function prettyJson(v: string) {
  try {
    return JSON.stringify(JSON.parse(v), null, 2);
  } catch {
    return v;
  }
}

const listInfo = computed(() => {
  const v = detail.value?.value;
  if (Array.isArray(v)) return { items: v, total: v.length, truncated: false };
  if (v && typeof v === 'object' && 'items' in v)
    return v as { items: string[]; total: number; truncated: boolean };
  return { items: [], total: 0, truncated: false };
});

const setInfo = computed(() => {
  const v = detail.value?.value as
    | { items: string[]; total: number; truncated: boolean }
    | undefined;
  return v ?? { items: [], total: 0, truncated: false };
});

const zsetInfo = computed(() => {
  const v = detail.value?.value as
    | { items: { member: string; score: number }[]; total: number; truncated: boolean }
    | undefined;
  return v ?? { items: [], total: 0, truncated: false };
});

const hashValue = computed(() => (detail.value?.value ?? {}) as Record<string, string>);

watch(
  () => props.keyName,
  (key) => {
    if (key) fetchDetail(key);
    else {
      detail.value = null;
      error.value = '';
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.key-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.empty-state,
.loading-state,
.error-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 14px;
  gap: 8px;
}

.error-state {
  color: var(--danger);
}

.detail-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-key-name {
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
  color: var(--text-primary);
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ttl-badge {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 1px 8px;
}

.ttl-badge.expired {
  color: var(--danger);
  border-color: var(--danger);
}

.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
  margin-left: auto;
}

.value-section {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.truncated-note {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
}

.value-pre {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: 300px;
  color: var(--text-primary);
}

.value-pre.json {
  color: var(--type-string);
}

/* Tables */
.kv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.kv-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

.kv-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-muted);
  vertical-align: top;
}

.kv-table tr:hover td {
  background: var(--bg-hover);
}

.cell-field {
  color: var(--type-hash);
  width: 30%;
  word-break: break-all;
}

.cell-value {
  word-break: break-all;
}

.cell-index,
.cell-score {
  color: var(--text-muted);
  width: 60px;
  text-align: right;
  font-family: var(--font-mono);
}

/* Set tag cloud */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.set-member {
  display: inline-block;
  padding: 3px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 12px;
  color: var(--type-set);
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
