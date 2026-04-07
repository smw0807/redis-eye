<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-panel">
      <!-- Header -->
      <div class="modal-header">
        <h2 class="modal-title">Add New Key</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Type selector -->
        <div class="form-section">
          <div class="form-label">Type</div>
          <div class="type-selector">
            <button
              v-for="t in TYPES"
              :key="t"
              class="type-btn"
              :class="[`type-${t}`, { active: selectedType === t }]"
              @click="selectedType = t"
            >
              {{ t }}
            </button>
          </div>
        </div>

        <!-- Key name -->
        <div class="form-section">
          <label class="form-label" for="key-name">Key Name</label>
          <input
            id="key-name"
            v-model="keyName"
            class="input-field mono"
            placeholder="e.g. user:1001:profile"
            @keyup.enter="submit"
          />
        </div>

        <!-- Value (type-specific) -->
        <div class="form-section value-section">
          <div class="form-label">Value</div>

          <!-- String -->
          <textarea
            v-if="selectedType === 'string'"
            v-model="stringValue"
            class="input-field string-value mono"
            placeholder="Enter value"
            rows="4"
          />

          <!-- Hash -->
          <div v-else-if="selectedType === 'hash'" class="field-list">
            <div class="field-list-header">
              <span>Field</span>
              <span>Value</span>
            </div>
            <div v-for="(row, i) in hashFields" :key="i" class="field-row">
              <input v-model="row.field" class="input-field mono" placeholder="field" />
              <input v-model="row.value" class="input-field mono" placeholder="value" />
              <button
                class="remove-btn"
                :disabled="hashFields.length === 1"
                @click="hashFields.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <button class="add-btn" @click="hashFields.push({ field: '', value: '' })">
              + Add field
            </button>
          </div>

          <!-- List -->
          <div v-else-if="selectedType === 'list'" class="field-list">
            <div class="field-list-header field-list-header--single">
              <span>Value (ordered)</span>
            </div>
            <div v-for="(_, i) in listItems" :key="i" class="field-row field-row--single">
              <input v-model="listItems[i]" class="input-field mono" placeholder="value" />
              <button
                class="remove-btn"
                :disabled="listItems.length === 1"
                @click="listItems.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <button class="add-btn" @click="listItems.push('')">+ Add item</button>
          </div>

          <!-- Set -->
          <div v-else-if="selectedType === 'set'" class="field-list">
            <div class="field-list-header field-list-header--single">
              <span>Member (unique)</span>
            </div>
            <div v-for="(_, i) in setMembers" :key="i" class="field-row field-row--single">
              <input v-model="setMembers[i]" class="input-field mono" placeholder="member" />
              <button
                class="remove-btn"
                :disabled="setMembers.length === 1"
                @click="setMembers.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <button class="add-btn" @click="setMembers.push('')">+ Add member</button>
          </div>

          <!-- ZSet -->
          <div v-else-if="selectedType === 'zset'" class="field-list">
            <div class="field-list-header field-list-header--zset">
              <span>Score</span>
              <span>Member</span>
            </div>
            <div v-for="(row, i) in zsetItems" :key="i" class="field-row field-row--zset">
              <input v-model="row.score" class="input-field mono" type="number" placeholder="0" />
              <input v-model="row.member" class="input-field mono" placeholder="member" />
              <button
                class="remove-btn"
                :disabled="zsetItems.length === 1"
                @click="zsetItems.splice(i, 1)"
              >
                ✕
              </button>
            </div>
            <button class="add-btn" @click="zsetItems.push({ member: '', score: '' })">
              + Add member
            </button>
          </div>
        </div>

        <!-- TTL -->
        <div class="form-section">
          <div class="form-label">TTL</div>
          <div class="ttl-options">
            <label class="ttl-radio">
              <input v-model="ttlEnabled" type="radio" :value="false" />
              No expiry
            </label>
            <label class="ttl-radio">
              <input v-model="ttlEnabled" type="radio" :value="true" />
              Expires in
              <input
                v-model.number="ttlSeconds"
                class="input-field ttl-input"
                type="number"
                min="1"
                :disabled="!ttlEnabled"
                placeholder="60"
              />
              seconds
            </label>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="error-msg">{{ error }}</div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const TYPES = ['string', 'hash', 'list', 'set', 'zset'] as const;
type RedisType = (typeof TYPES)[number];

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created', key: string): void;
}>();

const selectedType = ref<RedisType>('string');
const keyName = ref('');
const error = ref('');
const submitting = ref(false);

// TTL
const ttlEnabled = ref(false);
const ttlSeconds = ref(60);

// Type-specific values
const stringValue = ref('');
const hashFields = ref([{ field: '', value: '' }]);
const listItems = ref(['']);
const setMembers = ref(['']);
const zsetItems = ref([{ member: '', score: '' }]);

async function submit() {
  error.value = '';

  const key = keyName.value.trim();
  if (!key) {
    error.value = 'Key name is required';
    return;
  }

  if (ttlEnabled.value && (!ttlSeconds.value || ttlSeconds.value < 1)) {
    error.value = 'TTL must be at least 1 second';
    return;
  }

  let value: unknown;

  switch (selectedType.value) {
    case 'string':
      value = stringValue.value;
      break;

    case 'hash': {
      const obj: Record<string, string> = {};
      for (const row of hashFields.value) {
        if (!row.field.trim()) {
          error.value = 'Field name cannot be empty';
          return;
        }
        obj[row.field.trim()] = row.value;
      }
      if (Object.keys(obj).length === 0) {
        error.value = 'Add at least one field';
        return;
      }
      value = obj;
      break;
    }

    case 'list': {
      const items = listItems.value.filter((v) => v.trim() !== '');
      if (items.length === 0) {
        error.value = 'Add at least one item';
        return;
      }
      value = items;
      break;
    }

    case 'set': {
      const members = setMembers.value.filter((v) => v.trim() !== '');
      if (members.length === 0) {
        error.value = 'Add at least one member';
        return;
      }
      value = members;
      break;
    }

    case 'zset': {
      const items = [];
      for (const row of zsetItems.value) {
        if (!row.member.trim()) {
          error.value = 'Member cannot be empty';
          return;
        }
        if (row.score === '' || isNaN(Number(row.score))) {
          error.value = 'Score must be a valid number';
          return;
        }
        items.push({ member: row.member.trim(), score: Number(row.score) });
      }
      if (items.length === 0) {
        error.value = 'Add at least one member';
        return;
      }
      value = items;
      break;
    }
  }

  submitting.value = true;
  try {
    const res = await fetch('/api/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        type: selectedType.value,
        value,
        ttl: ttlEnabled.value ? ttlSeconds.value : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      error.value = data.error || 'Failed to create key';
      return;
    }
    emit('created', key);
  } catch {
    error.value = 'Network error';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 520px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  transition:
    color 0.15s,
    background 0.15s;
}

.close-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Type selector */
.type-selector {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.type-btn {
  padding: 3px 12px;
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

.type-btn:not(.active):hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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

/* String textarea */
.string-value {
  resize: vertical;
  min-height: 80px;
}

/* Field lists (hash, list, set, zset) */
.field-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-list-header {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 6px;
  padding: 0 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-list-header--single {
  grid-template-columns: 1fr 28px;
}

.field-list-header--zset {
  grid-template-columns: 90px 1fr 28px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr 28px;
  gap: 6px;
  align-items: center;
}

.field-row--single {
  grid-template-columns: 1fr 28px;
}

.field-row--zset {
  grid-template-columns: 90px 1fr 28px;
}

.remove-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
  flex-shrink: 0;
}

.remove-btn:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-muted);
  border-color: var(--danger);
}

.remove-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.add-btn {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 5px 12px;
  cursor: pointer;
  margin-top: 2px;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.add-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

/* TTL */
.ttl-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ttl-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.ttl-input {
  width: 80px;
  padding: 4px 8px;
  font-size: 13px;
  text-align: center;
}

/* Error */
.error-msg {
  padding: 8px 12px;
  background: var(--danger-muted);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
</style>
