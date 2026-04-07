<template>
  <span class="tag type-badge" :class="`type-${type}`">{{ type }}</span>
</template>

<script setup lang="ts">
defineProps<{ type: string }>()
</script>

<style scoped>
.type-badge {
  font-family: var(--font-mono);
}

.type-string {
  background: color-mix(in srgb, var(--type-string) 15%, transparent);
  color: var(--type-string);
}

.type-hash {
  background: color-mix(in srgb, var(--type-hash) 15%, transparent);
  color: var(--type-hash);
}

.type-list {
  background: color-mix(in srgb, var(--type-list) 15%, transparent);
  color: var(--type-list);
}

.type-set {
  background: color-mix(in srgb, var(--type-set) 15%, transparent);
  color: var(--type-set);
}

.type-zset {
  background: color-mix(in srgb, var(--type-zset) 15%, transparent);
  color: var(--type-zset);
}

.type-unknown {
  background: var(--bg-elevated);
  color: var(--text-muted);
}
</style>
