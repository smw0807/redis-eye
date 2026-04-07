<template>
  <div class="key-list">
    <!-- Search bar with history -->
    <div class="search-bar">
      <div class="search-input-wrap">
        <input
          v-model="searchInput"
          class="input-field search-input"
          placeholder="Search keys…  (glob: user:*, *:session)"
          @keyup.enter="applySearch"
          @focus="showHistory = true"
          @blur="onSearchBlur"
        />
        <div v-if="showHistory && searchHistory.length > 0" class="history-dropdown">
          <button
            v-for="h in searchHistory"
            :key="h"
            class="history-item mono"
            @mousedown.prevent="selectHistory(h)"
          >
            {{ h }}
          </button>
        </div>
      </div>
      <button class="btn btn-secondary search-btn" @click="applySearch">Search</button>
    </div>

    <!-- Filters row -->
    <div class="filter-row">
      <div class="type-filter">
        <button
          v-for="t in TYPES"
          :key="t"
          class="type-btn"
          :class="[`type-${t}`, { active: activeType === t }]"
          @click="toggleType(t)"
        >
          {{ t }}
        </button>
      </div>
      <button
        class="type-btn expiring-btn"
        :class="{ active: expiringFilter }"
        @click="expiringFilter = !expiringFilter"
      >
        ⏱ Expiring
      </button>
    </div>

    <!-- Key count / Selection bar -->
    <div class="key-count">
      <template v-if="!selectionMode">
        <span v-if="filteredItems.length > 0">
          {{ filteredItems.length }}{{ activeType ? ` ${activeType}` : ''
          }}{{ expiringFilter ? ' expiring' : '' }} keys
          <template v-if="!done"> loaded</template>
        </span>
        <span v-else-if="loading">Loading…</span>
        <span v-else>No keys found</span>
        <div class="key-count-actions">
          <button
            v-if="!done && !loading"
            class="btn btn-secondary load-more-btn"
            @click="loadMore"
          >
            Load more
          </button>
          <button
            v-if="filteredItems.length > 0"
            class="btn btn-secondary select-btn"
            @click="enterSelectionMode"
          >
            Select
          </button>
        </div>
      </template>

      <template v-else>
        <label class="select-all-label">
          <input
            ref="selectAllRef"
            type="checkbox"
            :checked="allSelected"
            @change="toggleSelectAll"
          />
          <span class="select-all-text">
            {{ selectedCount > 0 ? `${selectedCount} selected` : 'Select all' }}
          </span>
        </label>
        <div class="key-count-actions">
          <button
            v-if="selectedCount > 0"
            class="btn btn-danger select-delete-btn"
            @click="handleBulkDelete"
          >
            Delete ({{ selectedCount }})
          </button>
          <button class="btn btn-secondary select-btn" @click="exitSelectionMode">Cancel</button>
        </div>
      </template>
    </div>

    <!-- Key items -->
    <div ref="listEl" class="key-items">
      <div
        v-for="item in filteredItems"
        :key="item.key"
        class="key-item"
        :class="{
          active: !selectionMode && selectedKey === item.key,
          'is-selected': selectionMode && selectedKeys.has(item.key),
        }"
        role="button"
        tabindex="0"
        @click="onItemClick(item.key)"
        @keydown.enter="onItemClick(item.key)"
        @keydown.space.prevent="onItemClick(item.key)"
      >
        <input
          v-if="selectionMode"
          type="checkbox"
          class="item-checkbox"
          :checked="selectedKeys.has(item.key)"
          @click.stop
          @change="toggleSelection(item.key)"
        />
        <TypeBadge :type="item.type" />
        <span class="key-name mono">{{ item.key }}</span>
        <span v-if="item.expireAt !== -1" class="ttl-badge" :class="getTtlClass(item)">{{
          formatRemainingTtl(item)
        }}</span>
      </div>

      <!-- Sentinel for infinite scroll -->
      <div ref="sentinelEl" class="sentinel" />
    </div>

    <div v-if="loading" class="loading-row"><span class="spinner" /> Loading…</div>

    <ConfirmDialog
      v-if="confirmState"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      type="danger"
      @confirm="onConfirmOk"
      @cancel="onConfirmCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import TypeBadge from './TypeBadge.vue';
import ConfirmDialog from './ConfirmDialog.vue';

interface KeyItem {
  key: string;
  type: string;
  expireAt: number; // Date.now() + ttl, or -1 for no expiry
}

const TYPES = ['string', 'hash', 'list', 'set', 'zset'] as const;
type RedisType = (typeof TYPES)[number];

const HISTORY_KEY = 'redis-eye-search-history';
const MAX_HISTORY = 8;
const EXPIRING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

defineProps<{ selectedKey: string | null }>();
const emit = defineEmits<{
  (e: 'select', key: string): void;
  (e: 'bulkDeleted', keys: string[]): void;
}>();

const items = ref<KeyItem[]>([]);
const cursor = ref('0');
const done = ref(false);
const loading = ref(false);
const searchInput = ref('');
const matchPattern = ref('*');
const activeType = ref<RedisType | null>(null);
const expiringFilter = ref(false);

const now = ref(Date.now());

const searchHistory = ref<string[]>(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'));
const showHistory = ref(false);

const filteredItems = computed(() => {
  let result = items.value;
  if (activeType.value) {
    result = result.filter((i) => i.type === activeType.value);
  }
  if (expiringFilter.value) {
    result = result.filter((i) => {
      if (i.expireAt === -1) return false;
      const remaining = i.expireAt - now.value;
      return remaining > 0 && remaining <= EXPIRING_THRESHOLD_MS;
    });
  }
  return result;
});

// ─── Selection ───────────────────────────────────────────────────────────────

const selectionMode = ref(false);
const selectedKeys = ref(new Set<string>());
const selectAllRef = ref<HTMLInputElement | null>(null);

const selectedCount = computed(() => selectedKeys.value.size);
const allSelected = computed(
  () => filteredItems.value.length > 0 && filteredItems.value.every((i) => selectedKeys.value.has(i.key))
);
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value);

watch([selectedCount, allSelected], () => {
  nextTick(() => {
    if (selectAllRef.value) {
      selectAllRef.value.indeterminate = someSelected.value;
    }
  });
});

function enterSelectionMode() {
  selectionMode.value = true;
  selectedKeys.value = new Set();
}

function exitSelectionMode() {
  selectionMode.value = false;
  selectedKeys.value = new Set();
}

function toggleSelection(key: string) {
  const s = new Set(selectedKeys.value);
  s.has(key) ? s.delete(key) : s.add(key);
  selectedKeys.value = s;
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedKeys.value = new Set();
  } else {
    selectedKeys.value = new Set(filteredItems.value.map((i) => i.key));
  }
}

function onItemClick(key: string) {
  if (selectionMode.value) {
    toggleSelection(key);
  } else {
    emit('select', key);
  }
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
}
const confirmState = ref<ConfirmOptions | null>(null);
let confirmResolve: ((v: boolean) => void) | null = null;

function openConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmState.value = options;
  });
}

function onConfirmOk() {
  confirmState.value = null;
  confirmResolve?.(true);
  confirmResolve = null;
}

function onConfirmCancel() {
  confirmState.value = null;
  confirmResolve?.(false);
  confirmResolve = null;
}

// ─── Bulk delete ──────────────────────────────────────────────────────────────

async function handleBulkDelete() {
  if (selectedCount.value === 0) return;

  const keys = [...selectedKeys.value];
  const ok = await openConfirm({
    title: 'Delete Keys',
    message: `Are you sure you want to delete ${keys.length} key${keys.length > 1 ? 's' : ''}?`,
    confirmText: 'Delete',
  });
  if (!ok) return;

  try {
    const res = await fetch('/api/keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
    if (res.ok) {
      emit('bulkDeleted', keys);
      exitSelectionMode();
      applySearch();
    }
  } catch (e) {
    console.error('Bulk delete failed:', e);
  }
}

// ─── Key list loading ─────────────────────────────────────────────────────────

const listEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

function toggleType(t: RedisType) {
  activeType.value = activeType.value === t ? null : t;
}

function getRemainingMs(item: KeyItem): number {
  if (item.expireAt === -1) return -1;
  return Math.max(0, item.expireAt - now.value);
}

function formatRemainingTtl(item: KeyItem): string {
  const ms = getRemainingMs(item);
  if (ms === -1) return '';
  if (ms === 0) return 'expired';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getTtlClass(item: KeyItem): string {
  const ms = getRemainingMs(item);
  if (ms <= 0) return 'ttl-expired';
  if (ms < 30_000) return 'ttl-urgent';
  if (ms < EXPIRING_THRESHOLD_MS) return 'ttl-warning';
  return 'ttl-normal';
}

function saveToHistory(pattern: string) {
  if (!pattern || pattern === '*') return;
  const updated = [pattern, ...searchHistory.value.filter((h) => h !== pattern)].slice(
    0,
    MAX_HISTORY
  );
  searchHistory.value = updated;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function selectHistory(pattern: string) {
  searchInput.value = pattern;
  showHistory.value = false;
  applySearch();
}

function onSearchBlur() {
  setTimeout(() => {
    showHistory.value = false;
  }, 150);
}

async function loadMore() {
  if (loading.value || done.value) return;
  loading.value = true;

  try {
    const params = new URLSearchParams({
      cursor: cursor.value,
      match: matchPattern.value,
      count: '100',
    });
    const res = await fetch(`/api/keys?${params}`);
    const data = await res.json();

    const fetchedAt = Date.now();
    items.value.push(
      ...data.items.map((item: { key: string; type: string; ttl: number }) => ({
        key: item.key,
        type: item.type,
        expireAt: item.ttl === -1 ? -1 : item.ttl < 0 ? 0 : fetchedAt + item.ttl,
      }))
    );
    cursor.value = data.cursor;
    done.value = data.done;
  } catch (e) {
    console.error('Failed to load keys:', e);
  } finally {
    loading.value = false;
  }
}

function applySearch() {
  const trimmed = searchInput.value.trim();
  saveToHistory(trimmed);
  matchPattern.value = trimmed || '*';
  items.value = [];
  cursor.value = '0';
  done.value = false;
  showHistory.value = false;
  exitSelectionMode();
  loadMore();
}

function setupObserver() {
  if (!sentinelEl.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !loading.value && !done.value) {
        loadMore();
      }
    },
    { root: listEl.value, rootMargin: '100px' }
  );
  observer.observe(sentinelEl.value);
}

onMounted(() => {
  loadMore();
  setupObserver();
  tickInterval = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  observer?.disconnect();
  if (tickInterval) clearInterval(tickInterval);
});

defineExpose({ refresh: applySearch });
</script>

<style scoped>
.key-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.search-bar {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}

.search-input-wrap {
  flex: 1;
  position: relative;
}

.search-input {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 13px;
}

.search-btn {
  flex-shrink: 0;
}

.history-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
}

.history-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-muted);
  color: var(--text-secondary);
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.1s,
    color 0.1s;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Filters row */
.filter-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.type-filter {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}

.type-btn {
  padding: 2px 10px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.type-btn.type-string.active {
  background: color-mix(in srgb, var(--type-string) 20%, transparent);
  color: var(--type-string);
  border-color: var(--type-string);
}
.type-btn.type-hash.active {
  background: color-mix(in srgb, var(--type-hash) 20%, transparent);
  color: var(--type-hash);
  border-color: var(--type-hash);
}
.type-btn.type-list.active {
  background: color-mix(in srgb, var(--type-list) 20%, transparent);
  color: var(--type-list);
  border-color: var(--type-list);
}
.type-btn.type-set.active {
  background: color-mix(in srgb, var(--type-set) 20%, transparent);
  color: var(--type-set);
  border-color: var(--type-set);
}
.type-btn.type-zset.active {
  background: color-mix(in srgb, var(--type-zset) 20%, transparent);
  color: var(--type-zset);
  border-color: var(--type-zset);
}

.expiring-btn.active {
  background: color-mix(in srgb, var(--warning) 20%, transparent);
  color: var(--warning);
  border-color: var(--warning);
}

.type-btn:not(.active):hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Key count / selection bar */
.key-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-muted);
  gap: 6px;
}

.key-count-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.load-more-btn {
  font-size: 12px;
  padding: 3px 8px;
}

.select-btn {
  font-size: 12px;
  padding: 3px 8px;
}

.select-delete-btn {
  font-size: 12px;
  padding: 3px 8px;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex: 1;
  min-width: 0;
}

.select-all-label input[type='checkbox'] {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--accent);
}

.select-all-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Key items */
.key-items {
  flex: 1;
  overflow-y: auto;
}

.key-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-muted);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
  outline: none;
}

.key-item:hover {
  background: var(--bg-hover);
}

.key-item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.key-item.active {
  background: var(--bg-active);
  border-left: 2px solid var(--accent);
}

.key-item.is-selected {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.key-item.is-selected:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.item-checkbox {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--accent);
}

.key-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* TTL badge */
.ttl-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  letter-spacing: 0.02em;
}

.ttl-normal {
  color: var(--text-muted);
  background: var(--bg-elevated);
}
.ttl-warning {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 15%, transparent);
}
.ttl-urgent {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 15%, transparent);
}
.ttl-expired {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  opacity: 0.7;
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  color: var(--text-secondary);
  font-size: 13px;
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

.sentinel {
  height: 1px;
}
</style>
