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
        <!-- Key name (inline rename) -->
        <div class="detail-key-name-row">
          <template v-if="!editingKeyName">
            <div class="key-name-group">
              <div class="detail-key-name mono" :title="detail.key">{{ detail.key }}</div>
              <button class="btn-icon" title="Rename key" @click="startEditKeyName">✎</button>
            </div>
          </template>
          <template v-else>
            <input
              ref="keyNameInput"
              v-model="pendingKeyName"
              class="inline-input key-input mono"
              @keydown.enter="saveKeyName"
              @keydown.esc="cancelEditKeyName"
            />
            <button class="btn btn-primary btn-xs" :disabled="saving" @click="saveKeyName">
              Save
            </button>
            <button class="btn btn-secondary btn-xs" @click="cancelEditKeyName">Cancel</button>
          </template>
        </div>

        <div class="detail-meta">
          <TypeBadge :type="detail.type" />

          <!-- TTL (inline edit) -->
          <template v-if="!editingTtl">
            <span
              class="ttl-badge"
              :class="{ expired: detail.ttl === -2, 'ttl-editable': detail.ttl !== -2 }"
              :title="detail.ttl !== -2 ? 'Edit TTL' : undefined"
              @click="detail.ttl !== -2 && startEditTtl()"
            >
              {{ formatTtl(detail.ttl) }}
            </span>
          </template>
          <template v-else>
            <div class="ttl-editor">
              <input
                ref="ttlInput"
                v-model="pendingTtl"
                type="number"
                min="1"
                placeholder="seconds"
                class="inline-input ttl-input"
                @keydown.enter="saveTtl"
                @keydown.esc="cancelEditTtl"
              />
              <button class="btn btn-primary btn-xs" :disabled="saving" @click="saveTtl">
                Set
              </button>
              <button class="btn btn-secondary btn-xs" :disabled="saving" @click="persistTtl">
                Persist
              </button>
              <button class="btn btn-secondary btn-xs" @click="cancelEditTtl">Cancel</button>
            </div>
          </template>

          <button class="btn btn-danger btn-sm" @click="deleteKey">Delete</button>
        </div>

        <div v-if="saveError" class="save-error">{{ saveError }}</div>
      </div>

      <!-- String -->
      <div v-if="detail.type === 'string'" class="value-section">
        <template v-if="!editingString">
          <div class="section-header">
            <div class="section-label">Value</div>
            <div class="section-actions">
              <button
                v-if="isJson(detail.value as string)"
                class="btn btn-secondary btn-xs"
                @click="jsonExpanded = !jsonExpanded"
              >
                {{ jsonExpanded ? '▼ Collapse JSON' : '▶ Expand JSON' }}
              </button>
              <button class="btn btn-secondary btn-xs" @click="startEditString">Edit</button>
            </div>
          </div>
          <pre class="value-pre">{{ detail.value }}</pre>
          <template v-if="isJson(detail.value as string) && jsonExpanded">
            <div class="section-label" style="margin-top: 10px">Parsed JSON</div>
            <pre class="value-pre json">{{ prettyJson(detail.value as string) }}</pre>
          </template>
        </template>
        <template v-else>
          <div class="section-header">
            <div class="section-label">Editing Value</div>
            <div class="section-actions">
              <button
                class="btn btn-secondary btn-xs"
                :disabled="!isJson(pendingString)"
                @click="formatJsonInEditor"
              >
                Format JSON
              </button>
              <button class="btn btn-primary btn-xs" :disabled="saving" @click="saveStringValue">
                Save
              </button>
              <button class="btn btn-secondary btn-xs" @click="cancelEditString">Cancel</button>
            </div>
          </div>
          <textarea v-model="pendingString" class="value-textarea" rows="12" />
        </template>
      </div>

      <!-- Hash -->
      <div v-else-if="detail.type === 'hash'" class="value-section">
        <div class="section-header">
          <div class="section-label">{{ Object.keys(hashValue).length }} fields</div>
          <button class="btn btn-secondary btn-xs" @click="startAddHashField">+ Add Field</button>
        </div>
        <table class="kv-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
              <th class="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, k) in hashValue" :key="k">
              <td class="mono cell-field">{{ k }}</td>
              <td class="mono cell-value">
                <template v-if="editingHashField === String(k)">
                  <input
                    v-model="pendingHashValue"
                    class="inline-input w-full"
                    @keydown.enter="saveHashField(String(k))"
                    @keydown.esc="cancelEditHashField"
                  />
                </template>
                <template v-else>{{ v }}</template>
              </td>
              <td class="cell-actions">
                <template v-if="editingHashField === String(k)">
                  <button
                    class="btn btn-primary btn-xs"
                    :disabled="saving"
                    @click="saveHashField(String(k))"
                  >
                    Save
                  </button>
                  <button class="btn btn-secondary btn-xs" @click="cancelEditHashField">
                    Cancel
                  </button>
                </template>
                <template v-else>
                  <button
                    class="btn btn-secondary btn-xs"
                    @click="startEditHashField(String(k), String(v))"
                  >
                    Edit
                  </button>
                  <button class="btn btn-danger btn-xs" @click="deleteHashField(String(k))">
                    Del
                  </button>
                </template>
              </td>
            </tr>
            <!-- Add new field row -->
            <tr v-if="addingHashField" class="new-row">
              <td>
                <input
                  v-model="newHashFieldName"
                  placeholder="Field name"
                  class="inline-input w-full"
                />
              </td>
              <td>
                <input
                  v-model="newHashFieldValue"
                  placeholder="Value"
                  class="inline-input w-full"
                  @keydown.enter="submitAddHashField"
                />
              </td>
              <td class="cell-actions">
                <button
                  class="btn btn-primary btn-xs"
                  :disabled="saving"
                  @click="submitAddHashField"
                >
                  Add
                </button>
                <button class="btn btn-secondary btn-xs" @click="cancelAddHashField">Cancel</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- List -->
      <div v-else-if="detail.type === 'list'" class="value-section">
        <div class="section-header">
          <div class="section-label">
            {{ listInfo.total }} items
            <span v-if="listInfo.truncated" class="truncated-note">(showing first 500)</span>
          </div>
        </div>
        <table class="kv-table">
          <thead>
            <tr>
              <th class="th-idx">#</th>
              <th>Value</th>
              <th class="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in listInfo.items" :key="idx">
              <td class="cell-index">{{ idx }}</td>
              <td class="mono cell-value">
                <template v-if="editingListIndex === idx">
                  <input
                    v-model="pendingListValue"
                    class="inline-input w-full"
                    @keydown.enter="saveListItem(idx)"
                    @keydown.esc="cancelEditListItem"
                  />
                </template>
                <template v-else>{{ item }}</template>
              </td>
              <td class="cell-actions">
                <template v-if="editingListIndex === idx">
                  <button
                    class="btn btn-primary btn-xs"
                    :disabled="saving"
                    @click="saveListItem(idx)"
                  >
                    Save
                  </button>
                  <button class="btn btn-secondary btn-xs" @click="cancelEditListItem">
                    Cancel
                  </button>
                </template>
                <template v-else>
                  <button class="btn btn-secondary btn-xs" @click="startEditListItem(idx, item)">
                    Edit
                  </button>
                  <button
                    class="btn btn-secondary btn-xs icon-btn"
                    title="Move up"
                    :disabled="idx === 0 || listInfo.truncated"
                    @click="moveListItem(idx, idx - 1)"
                  >
                    ▲
                  </button>
                  <button
                    class="btn btn-secondary btn-xs icon-btn"
                    title="Move down"
                    :disabled="idx === listInfo.items.length - 1 || listInfo.truncated"
                    @click="moveListItem(idx, idx + 1)"
                  >
                    ▼
                  </button>
                </template>
              </td>
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

  <ConfirmDialog
    v-if="confirmState"
    :title="confirmState.title"
    :message="confirmState.message"
    :confirm-text="confirmState.confirmText"
    :type="confirmState.type"
    @confirm="onConfirmOk"
    @cancel="onConfirmCancel"
  />
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import TypeBadge from './TypeBadge.vue';
import ConfirmDialog from './ConfirmDialog.vue';

interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  value: unknown;
}

const props = defineProps<{ keyName: string | null }>();
const emit = defineEmits<{
  (e: 'deleted', key: string): void;
  (e: 'renamed', oldKey: string, newKey: string): void;
}>();

const detail = ref<KeyDetail | null>(null);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const saveError = ref('');

// Confirm dialog
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  type?: 'danger' | 'primary';
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

// Key name editing
const editingKeyName = ref(false);
const pendingKeyName = ref('');
const keyNameInput = ref<HTMLInputElement | null>(null);

// TTL editing
const editingTtl = ref(false);
const pendingTtl = ref('');
const ttlInput = ref<HTMLInputElement | null>(null);

// String editing
const editingString = ref(false);
const pendingString = ref('');
const jsonExpanded = ref(false);

// Hash editing
const editingHashField = ref<string | null>(null);
const pendingHashValue = ref('');
const addingHashField = ref(false);
const newHashFieldName = ref('');
const newHashFieldValue = ref('');

// List editing
const editingListIndex = ref<number | null>(null);
const pendingListValue = ref('');

function encodeKey(key: string) {
  return btoa(key).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function fetchDetail(key: string) {
  loading.value = true;
  error.value = '';
  detail.value = null;
  saveError.value = '';

  // Reset editing states
  editingKeyName.value = false;
  editingTtl.value = false;
  editingString.value = false;
  editingHashField.value = null;
  addingHashField.value = false;
  editingListIndex.value = null;

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
  const ok = await openConfirm({
    title: 'Delete Key',
    message: `Are you sure you want to delete "${detail.value.key}"?`,
    confirmText: 'Delete',
    type: 'danger',
  });
  if (!ok) return;

  try {
    await fetch(`/api/key/${encodeKey(detail.value.key)}`, { method: 'DELETE' });
    emit('deleted', detail.value.key);
    detail.value = null;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Delete failed';
  }
}

// ─── Key rename ───────────────────────────────────────────────────────────────

function startEditKeyName() {
  if (!detail.value) return;
  pendingKeyName.value = detail.value.key;
  editingKeyName.value = true;
  nextTick(() => keyNameInput.value?.select());
}

function cancelEditKeyName() {
  editingKeyName.value = false;
  saveError.value = '';
}

async function saveKeyName() {
  if (!detail.value || !pendingKeyName.value.trim()) return;
  const newKey = pendingKeyName.value.trim();
  if (newKey === detail.value.key) {
    cancelEditKeyName();
    return;
  }

  const ok = await openConfirm({
    title: 'Rename Key',
    message: `Rename "${detail.value.key}" to "${newKey}"?`,
    confirmText: 'Rename',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newKey }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Rename failed';
    } else {
      const oldKey = detail.value.key;
      editingKeyName.value = false;
      emit('renamed', oldKey, newKey);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Rename failed';
  } finally {
    saving.value = false;
  }
}

// ─── TTL editing ──────────────────────────────────────────────────────────────

function startEditTtl() {
  if (!detail.value) return;
  const ttlSec = detail.value.ttl > 0 ? Math.ceil(detail.value.ttl / 1000) : '';
  pendingTtl.value = String(ttlSec);
  editingTtl.value = true;
  nextTick(() => ttlInput.value?.focus());
}

function cancelEditTtl() {
  editingTtl.value = false;
  saveError.value = '';
}

async function saveTtl() {
  if (!detail.value) return;
  const seconds = Number(pendingTtl.value);
  if (!pendingTtl.value || isNaN(seconds) || seconds <= 0) {
    saveError.value = 'TTL must be a positive number (seconds)';
    return;
  }

  const ok = await openConfirm({
    title: 'Update TTL',
    message: `Set TTL to ${seconds} seconds?`,
    confirmText: 'Update',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/ttl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: seconds }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to update TTL';
    } else {
      editingTtl.value = false;
      await fetchDetail(detail.value.key);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to update TTL';
  } finally {
    saving.value = false;
  }
}

async function persistTtl() {
  if (!detail.value) return;
  const ok = await openConfirm({
    title: 'Persist Key',
    message: 'Remove TTL and make this key permanent?',
    confirmText: 'Persist',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/ttl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: -1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to persist';
    } else {
      editingTtl.value = false;
      await fetchDetail(detail.value.key);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to persist';
  } finally {
    saving.value = false;
  }
}

// ─── String editing ───────────────────────────────────────────────────────────

function startEditString() {
  if (!detail.value) return;
  pendingString.value = String(detail.value.value ?? '');
  editingString.value = true;
}

function cancelEditString() {
  editingString.value = false;
  saveError.value = '';
}

function formatJsonInEditor() {
  try {
    pendingString.value = JSON.stringify(JSON.parse(pendingString.value), null, 2);
  } catch {
    /* not valid JSON */
  }
}

async function saveStringValue() {
  if (!detail.value) return;
  const ok = await openConfirm({
    title: 'Save Value',
    message: 'Save the updated string value?',
    confirmText: 'Save',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/value`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: pendingString.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to save';
    } else {
      editingString.value = false;
      await fetchDetail(detail.value.key);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save';
  } finally {
    saving.value = false;
  }
}

// ─── Hash editing ─────────────────────────────────────────────────────────────

function startEditHashField(field: string, currentValue: string) {
  editingHashField.value = field;
  pendingHashValue.value = currentValue;
  saveError.value = '';
}

function cancelEditHashField() {
  editingHashField.value = null;
  saveError.value = '';
}

async function saveHashField(field: string) {
  if (!detail.value) return;
  const ok = await openConfirm({
    title: 'Save Field',
    message: `Save the updated value for field "${field}"?`,
    confirmText: 'Save',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/hash`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value: pendingHashValue.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to save';
    } else {
      editingHashField.value = null;
      // Update local state
      (detail.value.value as Record<string, string>)[field] = pendingHashValue.value;
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save';
  } finally {
    saving.value = false;
  }
}

async function deleteHashField(field: string) {
  if (!detail.value) return;
  const ok = await openConfirm({
    title: 'Delete Field',
    message: `Are you sure you want to delete the field "${field}"?`,
    confirmText: 'Delete',
    type: 'danger',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const fieldId = btoa(field).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/hash/${fieldId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to delete';
    } else {
      // Update local state
      delete (detail.value.value as Record<string, string>)[field];
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to delete';
  } finally {
    saving.value = false;
  }
}

function startAddHashField() {
  addingHashField.value = true;
  newHashFieldName.value = '';
  newHashFieldValue.value = '';
  cancelEditHashField();
}

function cancelAddHashField() {
  addingHashField.value = false;
}

async function submitAddHashField() {
  if (!detail.value) return;
  const field = newHashFieldName.value.trim();
  if (!field) {
    saveError.value = 'Field name is required';
    return;
  }

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/hash`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value: newHashFieldValue.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to add';
    } else {
      (detail.value.value as Record<string, string>)[field] = newHashFieldValue.value;
      addingHashField.value = false;
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to add';
  } finally {
    saving.value = false;
  }
}

// ─── List editing ─────────────────────────────────────────────────────────────

function startEditListItem(index: number, currentValue: string) {
  editingListIndex.value = index;
  pendingListValue.value = currentValue;
  saveError.value = '';
}

function cancelEditListItem() {
  editingListIndex.value = null;
  saveError.value = '';
}

async function saveListItem(index: number) {
  if (!detail.value) return;
  const ok = await openConfirm({
    title: 'Save Item',
    message: `Save the updated value at index ${index}?`,
    confirmText: 'Save',
    type: 'primary',
  });
  if (!ok) return;

  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/list/${index}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: pendingListValue.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to save';
    } else {
      editingListIndex.value = null;
      // Update local state
      const v = detail.value.value;
      if (Array.isArray(v)) {
        v[index] = pendingListValue.value;
      } else if (v && typeof v === 'object' && 'items' in v) {
        (v as { items: string[] }).items[index] = pendingListValue.value;
      }
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save';
  } finally {
    saving.value = false;
  }
}

async function moveListItem(from: number, to: number) {
  if (!detail.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    const res = await fetch(`/api/key/${encodeKey(detail.value.key)}/list/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to move';
    } else {
      // Update local state
      const v = detail.value.value;
      const items: string[] = Array.isArray(v) ? v : (v as { items: string[] }).items;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to move';
  } finally {
    saving.value = false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/* Header */
.detail-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-key-name-row {
  display: flex;
  align-items: center;
  min-height: 28px;
}

.key-name-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.detail-key-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  color: var(--text-primary);
  cursor: text;
}

.detail-key-name:hover {
  color: var(--accent);
}

.key-input {
  flex: 1;
  font-size: 14px;
  padding: 4px 8px;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-primary);
  padding: 2px 4px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  line-height: 1;
}

.btn-icon:hover {
  color: var(--accent);
  background: var(--bg-hover);
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

.ttl-badge.ttl-editable {
  cursor: pointer;
}

.ttl-badge.ttl-editable:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ttl-editor {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ttl-input {
  width: 120px;
  padding: 2px 8px;
  font-size: 12px;
}

.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
}

.btn-xs {
  padding: 2px 8px;
  font-size: 11px;
}

.btn-sm.btn-danger,
.btn-xs.btn-danger {
  margin-left: auto;
}

.save-error {
  font-size: 12px;
  color: var(--danger);
}

/* Value section */
.value-section {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-actions {
  display: flex;
  gap: 6px;
  align-items: center;
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

.value-textarea {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  resize: vertical;
  min-height: 120px;
  line-height: 1.5;
}

/* Inline input */
.inline-input {
  padding: 3px 8px;
  font-size: 13px;
  border-radius: var(--radius-sm);
}

.inline-input.w-full {
  width: 100%;
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
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-muted);
  vertical-align: middle;
}

.kv-table tr:hover td {
  background: var(--bg-hover);
}

.new-row td {
  background: var(--bg-active);
}

.th-idx {
  width: 50px;
}

.th-actions {
  width: 160px;
  text-align: right;
}

.cell-field {
  color: var(--type-hash);
  width: 28%;
  word-break: break-all;
}

.cell-value {
  word-break: break-all;
}

.cell-index,
.cell-score {
  color: var(--text-muted);
  width: 50px;
  text-align: right;
  font-family: var(--font-mono);
}

.cell-actions {
  text-align: right;
  white-space: nowrap;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 8px;
}

.icon-btn {
  padding: 2px 6px;
  font-size: 10px;
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
