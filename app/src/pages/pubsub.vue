<template>
  <div class="pubsub-page">
    <!-- Header -->
    <header class="pubsub-header">
      <button class="btn btn-secondary back-btn" @click="goBack">← Dashboard</button>
      <span class="pubsub-title">Pub/Sub Monitor</span>
      <span class="conn-addr mono">{{ connAddr }}</span>
    </header>

    <div class="pubsub-body">
      <!-- Left sidebar: subscribe + publish -->
      <aside class="pubsub-sidebar">
        <!-- Subscribe section -->
        <section class="panel">
          <h3 class="panel-title">Subscribe</h3>
          <form class="subscribe-form" @submit.prevent="subscribe">
            <input
              v-model="channelInput"
              class="input-field"
              placeholder="channel name"
              :disabled="isSubscribing"
              autocomplete="off"
            />
            <button type="submit" class="btn btn-primary" :disabled="!channelInput.trim() || isSubscribing">
              +
            </button>
          </form>

          <div v-if="subscriptions.length === 0" class="empty-hint">
            No active subscriptions
          </div>
          <ul v-else class="channel-list">
            <li
              v-for="sub in subscriptions"
              :key="sub.channel"
              class="channel-item"
              :style="{ '--ch-color': channelColor(sub.channel) }"
            >
              <span class="ch-dot" />
              <span class="ch-name mono">{{ sub.channel }}</span>
              <button class="ch-remove" title="Unsubscribe" @click="unsubscribe(sub.channel)">✕</button>
            </li>
          </ul>
        </section>

        <!-- Publish section -->
        <section class="panel">
          <h3 class="panel-title">Publish</h3>
          <form class="publish-form" @submit.prevent="publish">
            <div class="form-group">
              <label class="form-label">Channel</label>
              <input
                v-model="pubChannel"
                class="input-field"
                placeholder="channel name"
                autocomplete="off"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Message</label>
              <textarea
                v-model="pubMessage"
                class="input-field pub-textarea"
                placeholder="message content"
                rows="4"
              />
            </div>
            <button type="submit" class="btn btn-primary" :disabled="!pubChannel.trim() || pubMessage === ''">
              Publish
            </button>
            <div v-if="publishFeedback" class="publish-feedback" :class="publishFeedback.type">
              {{ publishFeedback.text }}
            </div>
          </form>
        </section>
      </aside>

      <!-- Right: message feed -->
      <main class="pubsub-main">
        <div class="messages-header">
          <span class="messages-count">Messages <span class="count-badge">{{ messages.length }}</span></span>
          <div class="messages-actions">
            <label class="autoscroll-label">
              <input v-model="autoScroll" type="checkbox" />
              Auto-scroll
            </label>
            <button class="btn btn-secondary" :disabled="messages.length === 0" @click="clearMessages">
              Clear
            </button>
          </div>
        </div>

        <div class="message-list" ref="messageListRef">
          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-icon">📡</div>
            <div>Subscribe to a channel to see messages here</div>
          </div>
          <div
            v-for="(msg, i) in messages"
            :key="i"
            class="message-item"
            :style="{ '--ch-color': channelColor(msg.channel) }"
          >
            <span class="msg-time mono">{{ formatTime(msg.ts) }}</span>
            <span class="msg-channel mono">{{ msg.channel }}</span>
            <span class="msg-body mono">{{ msg.message }}</span>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

interface Subscription {
  channel: string;
  source: EventSource;
}

interface Message {
  channel: string;
  message: string;
  ts: number;
}

interface PublishFeedback {
  type: 'success' | 'error';
  text: string;
}

const MAX_MESSAGES = 200;
const CHANNEL_COLORS = ['#388bfd', '#3fb950', '#d29922', '#a371f7', '#f78166', '#79c0ff'];

const router = useRouter();
const connAddr = ref('');
const channelInput = ref('');
const isSubscribing = ref(false);
const subscriptions = ref<Subscription[]>([]);
const messages = ref<Message[]>([]);
const pubChannel = ref('');
const pubMessage = ref('');
const publishFeedback = ref<PublishFeedback | null>(null);
const autoScroll = ref(true);
const messageListRef = ref<HTMLElement | null>(null);

function channelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return CHANNEL_COLORS[hash % CHANNEL_COLORS.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function subscribe() {
  const channel = channelInput.value.trim();
  if (!channel) return;
  if (subscriptions.value.some((s) => s.channel === channel)) {
    channelInput.value = '';
    return;
  }

  isSubscribing.value = true;
  const source = new EventSource(`/api/pubsub/subscribe?channel=${encodeURIComponent(channel)}`);

  source.addEventListener('error', (e: Event) => {
    // If it's a MessageEvent with data, it's our custom error event
    const data = (e as MessageEvent).data;
    if (data) {
      try {
        const parsed = JSON.parse(data);
        console.error('Pub/Sub subscribe error:', parsed.error);
      } catch { /* ignore */ }
    }
  });

  source.onmessage = (e: MessageEvent) => {
    try {
      const msg: Message = JSON.parse(e.data);
      messages.value.push(msg);
      if (messages.value.length > MAX_MESSAGES) {
        messages.value.splice(0, messages.value.length - MAX_MESSAGES);
      }
      if (autoScroll.value) {
        nextTick(() => {
          if (messageListRef.value) {
            messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
          }
        });
      }
    } catch { /* ignore */ }
  };

  subscriptions.value.push({ channel, source });
  channelInput.value = '';
  isSubscribing.value = false;
}

function unsubscribe(channel: string) {
  const idx = subscriptions.value.findIndex((s) => s.channel === channel);
  if (idx === -1) return;
  subscriptions.value[idx].source.close();
  subscriptions.value.splice(idx, 1);
}

let publishFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

async function publish() {
  const channel = pubChannel.value.trim();
  const message = pubMessage.value;
  if (!channel || message === '') return;

  try {
    const res = await fetch('/api/pubsub/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, message }),
    });
    const data = await res.json();
    if (data.ok) {
      publishFeedback.value = {
        type: 'success',
        text: `Delivered to ${data.receivers} subscriber${data.receivers !== 1 ? 's' : ''}`,
      };
    } else {
      publishFeedback.value = { type: 'error', text: data.error || 'Publish failed' };
    }
  } catch (err) {
    publishFeedback.value = { type: 'error', text: 'Network error' };
  }

  if (publishFeedbackTimer) clearTimeout(publishFeedbackTimer);
  publishFeedbackTimer = setTimeout(() => {
    publishFeedback.value = null;
  }, 4000);
}

function clearMessages() {
  messages.value = [];
}

async function goBack() {
  router.push('/dashboard');
}

// Load connection address
fetch('/api/status')
  .then((r) => r.json())
  .then((d) => {
    if (d.host) connAddr.value = `${d.host}:${d.port}`;
  })
  .catch(() => {});

onUnmounted(() => {
  subscriptions.value.forEach((s) => s.source.close());
  if (publishFeedbackTimer) clearTimeout(publishFeedbackTimer);
});
</script>

<style scoped>
.pubsub-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-base);
}

/* Header */
.pubsub-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.back-btn {
  font-size: 12px;
  padding: 4px 10px;
}

.pubsub-title {
  font-weight: 700;
  font-size: 14px;
}

.conn-addr {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Body layout */
.pubsub-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.pubsub-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-surface);
}

.panel {
  padding: 14px 14px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

/* Subscribe */
.subscribe-form {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.subscribe-form .input-field {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  font-size: 12px;
}

.subscribe-form .btn {
  padding: 5px 10px;
  font-size: 16px;
  line-height: 1;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px 0;
}

.channel-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.ch-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ch-color, var(--accent));
  flex-shrink: 0;
}

.ch-name {
  flex: 1;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ch-color, var(--text-primary));
}

.ch-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.15s;
}

.ch-remove:hover {
  color: var(--danger);
}

/* Publish */
.publish-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pub-textarea {
  padding: 6px 8px;
  font-size: 12px;
  resize: vertical;
  min-height: 80px;
}

.publish-feedback {
  font-size: 12px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid;
}

.publish-feedback.success {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border-color: color-mix(in srgb, var(--success) 30%, transparent);
}

.publish-feedback.error {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
}

/* Main message feed */
.pubsub-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  flex-shrink: 0;
  gap: 10px;
}

.messages-count {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.count-badge {
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 1px 7px;
  color: var(--text-secondary);
}

.messages-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.autoscroll-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.autoscroll-label input {
  width: auto;
  cursor: pointer;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}

.empty-icon {
  font-size: 36px;
  opacity: 0.4;
}

.message-item {
  display: grid;
  grid-template-columns: 96px minmax(80px, 180px) 1fr;
  gap: 10px;
  align-items: baseline;
  padding: 4px 14px;
  border-bottom: 1px solid var(--border-muted);
  font-size: 12px;
  transition: background 0.1s;
}

.message-item:hover {
  background: var(--bg-surface);
}

.msg-time {
  color: var(--text-muted);
  flex-shrink: 0;
  font-size: 11px;
}

.msg-channel {
  color: var(--ch-color, var(--text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.msg-body {
  color: var(--text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
