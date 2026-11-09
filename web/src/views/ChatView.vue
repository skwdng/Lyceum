<script setup>
/**
 * 消息 / 私聊（等价旧 chat.js 的 viewChat）。
 *
 * 布局与类名照搬旧版（.soc-chat / .chat-side / .chat-conv / .chat-main / .chat-msgs …），
 * 因为辩论页也用 `.chat`，旧版特意把这里叫 `soc-chat` —— 这个坑别再踩。
 *
 * 迁移期说明：
 * · 旧页「消息」入口已重定向到本页（坑 #4：同一时间只允许一条 WS 连接）；
 * · 聊天里的「邀请组队」卡片暂时回落旧页房间页（房间还没迁，见 web/README 遗留表）。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat.js';
import { useAuthStore } from '../stores/auth.js';
import { API_BASE } from '../api.js';

const route = useRoute();
const router = useRouter();
const chat = useChatStore();
const auth = useAuthStore();

const draft = ref('');
const msgsEl = ref(null);

const open = computed(() => !!(chat.convId || chat.pendingPeer));
const peer = computed(() => chat.peer || {});
const peerBroken = computed(
  () => !peer.value.id || String(peer.value.id) === String((auth.user && auth.user.id) || '')
);

onMounted(async () => {
  chat.onChatPage = true;
  await chat.enter();
  // 从好友页「发消息」过来：#/chat?to=<id>&name=<名字>
  if (route.query.to) {
    chat.openWith(String(route.query.to), String(route.query.name || route.query.to));
  }
  await nextTick();
  scrollToBottom();
});

onBeforeUnmount(() => {
  chat.onChatPage = false;
});

/** 新消息/新气泡后：只有"该贴底"时才贴底，翻历史时不抢滚动位置 */
watch(
  () => [chat.items.length, chat.pending.length, chat.convId],
  async () => {
    await nextTick();
    if (chat.stick === false) return;
    scrollToBottom();
  }
);

function scrollToBottom() {
  const box = msgsEl.value;
  if (!box) return;
  box.scrollTop = box.scrollHeight;
  chat.scrollTop = box.scrollTop;
  chat.ignoreScrollUntil = Date.now() + 150;
}

function onScroll(e) {
  const box = e.target;
  chat.scrollTop = box.scrollTop;
  chat.stick = box.scrollHeight - box.clientHeight - box.scrollTop < 48;
  // 渲染引起的 scroll 不算"用户翻到顶"
  if (Date.now() < (chat.ignoreScrollUntil || 0)) return;
  if (box.scrollTop < 40 && chat.hasMore) chat.loadMore();
}

async function openConv(convId) {
  await chat.open(convId);
  await nextTick();
  scrollToBottom();
}

/**
 * 点列表里的某一项。
 * 合成行（还没聊过的好友）没有 convId，走 openWith：界面直接进聊天窗，
 * 发第一条时由后端建会话，ack 里带回 convId 再切到真会话。
 */
async function openItem(it) {
  if (it.synthetic) {
    chat.openWith(it.peer.id, it.peer.name);
    await nextTick();
    return;
  }
  await openConv(it.convId);
}

function back() {
  chat.convId = null;
  chat.pendingPeer = null;
  chat.items = [];
}

async function send() {
  const body = draft.value;
  if (!String(body || '').trim()) return;
  draft.value = '';                       // 先清空，失败时 store 会提示（旧版同款）
  const ok = await chat.send(body);
  if (!ok) draft.value = body;             // 失败把字还给用户
  await nextTick();
  scrollToBottom();
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

async function retry() {
  if (!chat.convId) {
    await chat.load();
    return;
  }
  await chat.open(chat.convId);
}

function shortTime(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return p(d.getHours()) + ':' + p(d.getMinutes());
  if (d.getFullYear() === now.getFullYear()) return d.getMonth() + 1 + '-' + d.getDate();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function invitePayload(m) {
  const raw = m && m.payload;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw)) || {};
  } catch (e) {
    return {};
  }
}

/** 邀请卡片「加入房间」：房间页还没迁（批 2 后半段），先回落旧页 */
function joinInvite(code) {
  if (!code) return;
  location.replace(API_BASE + '/?v=room');
}

function goFriends() {
  router.push({ name: 'friends' });
}
</script>

<template>
  <div v-if="chat.error && !chat.convId" class="card">
    <div class="empty">{{ chat.error }}</div>
  </div>

  <div v-else class="soc-chat" :class="{ 'has-open': open }" :data-mode="chat.mode">
    <!-- 会话列表 -->
    <div class="chat-side">
      <div class="chat-side-h">
        <b>消息</b>
        <button class="btn ghost sm" @click="goFriends">+ 好友</button>
      </div>
      <template v-if="chat.listItems.length">
        <div
          v-for="it in chat.listItems"
          :key="it.synthetic ? 'f-' + it.peer.id : it.convId"
          class="chat-conv"
          :class="{ on: Number(chat.convId) === Number(it.convId), 'chat-conv-new': it.synthetic }"
          @click="openItem(it)"
        >
          <div class="fr-av">{{ String((it.peer || {}).name || '?').slice(0, 1) }}</div>
          <div class="chat-conv-main">
            <div class="chat-conv-top">
              <span class="chat-conv-name">{{ (it.peer || {}).name }}</span>
              <span class="chat-conv-time">{{ shortTime(it.lastMsgAt) }}</span>
            </div>
            <div class="chat-conv-sub">
              <template v-if="it.last">{{ it.last.fromMe ? '我：' : '' }}{{ it.last.preview }}</template>
              <i v-else>还没有消息，点这里开始</i>
            </div>
          </div>
          <span v-if="Number(it.unread) > 0" class="nav-badge" style="margin-left: 6px">
            {{ Number(it.unread) > 99 ? '99+' : it.unread }}
          </span>
        </div>
      </template>
      <div v-else class="empty" style="padding: 24px 12px">
        还没有会话<br><span class="sub">先加好友，然后在「好友」里点发消息</span>
      </div>
    </div>

    <!-- 聊天窗 -->
    <div v-if="open" class="chat-main">
      <div class="chat-head">
        <button class="btn ghost sm chat-back" @click="back">‹</button>
        <b>{{ peer.name || peer.id || '会话' }}</b>
        <span class="fr-id">@{{ peer.id || '' }}</span>
      </div>

      <div v-if="peerBroken" class="chat-warn">
        对方信息异常（可能刚切换过账号），
        <a style="color: #2f5bea; cursor: pointer" @click="retry">点此重新加载会话</a>
      </div>

      <div ref="msgsEl" class="chat-msgs" @scroll="onScroll">
        <div v-if="chat.hasMore" class="chat-more">
          <button class="btn ghost sm" @click="chat.loadMore()">加载更早的消息</button>
        </div>

        <template v-for="m in chat.items" :key="m.id">
          <!-- 邀请组队卡片 -->
          <div v-if="String(m.type) === 'INVITE'" class="chat-row" :class="{ mine: chat.isMine(m) }">
            <div class="chat-invite">
              <div class="chat-invite-h">
                {{ chat.isMine(m) ? '你发出了组队邀请' : '邀请你加入辩论房间' }}
              </div>
              <div class="chat-invite-code mono">{{ invitePayload(m).roomCode }}</div>
              <div v-if="invitePayload(m).topicTitle" class="chat-invite-topic">
                {{ invitePayload(m).topicTitle }}
              </div>
              <button
                v-if="invitePayload(m).roomCode"
                class="btn primary sm"
                @click="joinInvite(invitePayload(m).roomCode)"
              >
                加入房间
              </button>
              <div v-else class="chat-time">这张邀请已失效</div>
            </div>
            <div class="chat-time">{{ shortTime(m.createdAt) }}</div>
          </div>

          <!-- 普通消息 -->
          <div v-else class="chat-row" :class="{ mine: chat.isMine(m) }" :data-mid="m.id">
            <div class="chat-bubble">{{ m.body }}</div>
            <div class="chat-time">{{ shortTime(m.createdAt) }}</div>
          </div>
        </template>

        <!-- 发送中 / 失败 -->
        <div
          v-for="p in chat.pending"
          :key="p.clientMsgId"
          class="chat-row mine pending"
          :class="{ failed: p.state === 'failed' }"
        >
          <div class="chat-bubble">{{ p.body }}</div>
          <div class="chat-time">{{ p.state === 'failed' ? '发送失败，请重试' : '发送中…' }}</div>
        </div>

        <div v-if="!chat.items.length && !chat.pending.length" class="empty" style="padding: 30px">
          还没有消息，说点什么吧
        </div>
      </div>

      <div class="chat-input">
        <textarea
          v-model="draft"
          maxlength="2000"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          @keydown="onKey"
        ></textarea>
        <button class="btn primary" @click="send">发送</button>
      </div>
    </div>

    <div v-else class="chat-main chat-blank">
      <div class="empty">
        选一个会话开始聊天<br><span class="sub">只有好友之间才能发消息</span>
      </div>
    </div>
  </div>
</template>
