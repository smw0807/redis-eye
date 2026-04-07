<template>
  <div class="key-list">
    <!-- Search bar -->
    <div class="search-bar">
      <input
        v-model="searchInput"
        class="input-field search-input"
        placeholder="Search keys…  (glob: user:*, *:session)"
        @keyup.enter="applySearch"
      />
      <button class="btn btn-secondary search-btn" @click="applySearch">Search</button>
    </div>

    <!-- Key count -->
    <div class="key-count">
      <span v-if="items.length > 0">{{ items.length }} keys loaded</span>
      <span v-else-if="loading">Loading…</span>
      <span v-else>No keys found</span>
      <button v-if="!done && !loading" class="btn btn-secondary load-more-btn" @click="loadMore">
        Load more
      </button>
    </div>

    <!-- Key items -->
    <div class="key-items" ref="listEl">
      <button
        v-for="item in items"
        :key="item.key"
        class="key-item"
        :class="{ active: selectedKey === item.key }"
        @click="$emit('select', item.key)"
      >
        <TypeBadge :type="item.type" />
        <span class="key-name mono">{{ item.key }}</span>
      </button>

      <!-- Sentinel for infinite scroll -->
      <div ref="sentinelEl" class="sentinel" />
    </div>

    <div v-if="loading" class="loading-row">
      <span class="spinner" /> Loading…
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import TypeBadge from './TypeBadge.vue'

interface KeyItem {
  key: string
  type: string
}

defineProps<{ selectedKey: string | null }>()
defineEmits<{ (e: 'select', key: string): void }>()

const items = ref<KeyItem[]>([])
const cursor = ref('0')
const done = ref(false)
const loading = ref(false)
const searchInput = ref('')
const matchPattern = ref('*')

const listEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadMore() {
  if (loading.value || done.value) return
  loading.value = true

  try {
    const params = new URLSearchParams({
      cursor: cursor.value,
      match: matchPattern.value,
      count: '100',
    })
    const res = await fetch(`/api/keys?${params}`)
    const data = await res.json()

    items.value.push(...data.items)
    cursor.value = data.cursor
    done.value = data.done
  } catch (e) {
    console.error('Failed to load keys:', e)
  } finally {
    loading.value = false
  }
}

function applySearch() {
  const trimmed = searchInput.value.trim()
  matchPattern.value = trimmed || '*'
  items.value = []
  cursor.value = '0'
  done.value = false
  loadMore()
}

function setupObserver() {
  if (!sentinelEl.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !loading.value && !done.value) {
        loadMore()
      }
    },
    { root: listEl.value, rootMargin: '100px' }
  )
  observer.observe(sentinelEl.value)
}

onMounted(() => {
  loadMore()
  setupObserver()
})

onUnmounted(() => {
  observer?.disconnect()
})

// Re-fetch when parent signals refresh
defineExpose({ refresh: applySearch })
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

.search-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 13px;
}

.search-btn {
  flex-shrink: 0;
}

.key-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-muted);
}

.load-more-btn {
  font-size: 12px;
  padding: 3px 8px;
}

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
}

.key-item:hover {
  background: var(--bg-hover);
}

.key-item.active {
  background: var(--bg-active);
  border-left: 2px solid var(--accent);
}

.key-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
