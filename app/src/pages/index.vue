<template>
  <div class="connect-page">
    <div class="connect-card card">
      <div class="connect-header">
        <h1 class="connect-title"><span class="logo-icon">⬡</span> redis-eye</h1>
        <p class="connect-subtitle">Connect to your Redis instance</p>
      </div>

      <!-- Profile selector -->
      <div v-if="profiles.length > 0" class="form-group">
        <label class="form-label">Saved Profiles</label>
        <div class="profile-list">
          <button
            v-for="p in profiles"
            :key="p.name"
            class="profile-item"
            :class="{ active: selectedProfile === p.name }"
            @click="loadProfile(p)"
          >
            <span class="profile-name">{{ p.name }}</span>
            <span class="profile-addr">{{ p.host }}:{{ p.port }}</span>
            <button class="profile-delete" title="Delete" @click.stop="deleteProfile(p.name)">
              ×
            </button>
          </button>
        </div>
      </div>

      <form class="connect-form" @submit.prevent="handleConnect">
        <div class="form-row">
          <div class="form-group" style="flex: 1">
            <label class="form-label" for="host">Host</label>
            <input
              id="host"
              v-model="form.host"
              class="input-field"
              placeholder="127.0.0.1"
              autocomplete="off"
            />
          </div>
          <div class="form-group" style="width: 90px">
            <label class="form-label" for="port">Port</label>
            <input
              id="port"
              v-model.number="form.port"
              class="input-field"
              type="number"
              min="1"
              max="65535"
              placeholder="6379"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <input
            id="password"
            v-model="form.password"
            class="input-field"
            type="password"
            placeholder="(none)"
            autocomplete="current-password"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="db">Database</label>
          <input
            id="db"
            v-model.number="form.db"
            class="input-field"
            type="number"
            min="0"
            max="15"
            placeholder="0"
          />
        </div>

        <div class="form-group tls-group">
          <label class="tls-label">
            <input id="tls" v-model="form.tls" type="checkbox" />
            <span>TLS / SSL</span>
          </label>
        </div>

        <div v-if="error" class="error-box">{{ error }}</div>

        <div class="form-actions">
          <div class="save-profile">
            <input
              v-model="profileName"
              class="input-field"
              placeholder="Profile name (optional)"
              style="flex: 1"
            />
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!profileName.trim()"
              @click="saveProfile"
            >
              Save
            </button>
          </div>
          <button type="submit" class="btn btn-primary connect-btn" :disabled="loading">
            {{ loading ? 'Connecting…' : 'Connect' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';

interface Profile {
  name: string;
  host: string;
  port: number;
  db: number;
  password?: string;
  tls?: boolean;
}

const router = useRouter();
const loading = ref(false);
const error = ref('');
const selectedProfile = ref('');
const profileName = ref('');

const form = reactive({
  host: '127.0.0.1',
  port: 6379,
  password: '',
  db: 0,
  tls: false,
});

const profiles = ref<Profile[]>([]);

const STORAGE_KEY = 'redis-eye-profiles';

function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    profiles.value = raw ? JSON.parse(raw) : [];
  } catch {
    profiles.value = [];
  }
}

function saveProfile() {
  const name = profileName.value.trim();
  if (!name) return;

  const existing = profiles.value.findIndex((p) => p.name === name);
  const p: Profile = {
    name,
    host: form.host || '127.0.0.1',
    port: form.port || 6379,
    db: form.db || 0,
    password: form.password || undefined,
    tls: form.tls,
  };

  if (existing >= 0) {
    profiles.value[existing] = p;
  } else {
    profiles.value.push(p);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.value));
  profileName.value = '';
}

function loadProfile(p: Profile) {
  selectedProfile.value = p.name;
  form.host = p.host;
  form.port = p.port;
  form.db = p.db;
  form.password = p.password || '';
  form.tls = p.tls ?? false;
}

function deleteProfile(name: string) {
  profiles.value = profiles.value.filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.value));
  if (selectedProfile.value === name) selectedProfile.value = '';
}

async function handleConnect() {
  error.value = '';
  loading.value = true;

  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: form.host || '127.0.0.1',
        port: form.port || 6379,
        password: form.password || undefined,
        db: form.db || 0,
        tls: form.tls,
      }),
    });
    const data = await res.json();

    if (data.ok) {
      router.push('/dashboard');
    } else {
      error.value = data.error || 'Connection failed';
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Network error';
  } finally {
    loading.value = false;
  }
}

onMounted(loadProfiles);
</script>

<style scoped>
.connect-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: 24px;
}

.connect-card {
  width: 100%;
  max-width: 440px;
}

.connect-header {
  text-align: center;
  margin-bottom: 24px;
}

.connect-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.logo-icon {
  color: var(--danger);
}

.connect-subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}

.connect-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.error-box {
  background: var(--danger-muted);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  color: var(--danger);
  padding: 8px 12px;
  font-size: 13px;
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.save-profile {
  display: flex;
  gap: 8px;
}

.connect-btn {
  width: 100%;
  justify-content: center;
  padding: 10px;
  font-size: 15px;
}

/* Profile list */
.profile-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  text-align: left;
  transition:
    background 0.1s,
    border-color 0.1s;
}

.profile-item:hover,
.profile-item.active {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.profile-name {
  font-weight: 600;
  flex: 1;
}

.profile-addr {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
}

.profile-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  transition: color 0.1s;
}

.profile-delete:hover {
  color: var(--danger);
}

.tls-group {
  margin-top: -4px;
}

.tls-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
}

.tls-label input[type='checkbox'] {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
