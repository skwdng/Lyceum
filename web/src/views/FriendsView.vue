<script setup>
/**
 * 好友（等价旧 friends.js）。
 *
 * 两条从旧版继承下来的硬规矩：
 * 1. 搜索结果里画什么按钮**完全由后端给的三个布尔决定**
 *    （isFriend / hasPendingRequest / pendingIn），前端不许自己推断；
 * 2. 写操作成功后就地刷新列表，不做乐观更新（好友关系是低频动作，简单比花哨重要）。
 *
 * 迁移期：「发消息」要等批 2 的聊天页，先回落旧页的消息列表（不带对端，批 2 补）。
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { socialApi, API_BASE, ApiError } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { toast } from '../utils/toast.js';

const router = useRouter();
const auth = useAuthStore();

const friends = ref([]);
const requests = ref([]);
const search = ref([]);
const q = ref('');
const searched = ref(false);
const noteFor = ref(null);     // 正在填附言的那个人 id（就地展开输入框）
const note = ref('');
const error = ref('');
const busy = ref(false);

async function loadAll() {
  if (!auth.user) {
    friends.value = [];
    requests.value = [];
    return;
  }
  error.value = '';
  try {
    const [f, r] = await Promise.all([socialApi.friends(), socialApi.requests()]);
    friends.value = (f && f.items) || [];
    requests.value = (r && r.items) || [];
  } catch (e) {
    error.value = (e && e.message) || '加载失败';
  }
}

onMounted(loadAll);

async function doSearch() {
  searched.value = true;
  const term = q.value.trim();
  if (!term) {
    search.value = [];
    return;
  }
  try {
    const r = await socialApi.search(term);
    search.value = (r && r.items) || [];
  } catch (e) {
    search.value = [];
    toast('搜索失败：' + ((e && e.message) || ''));
  }
}

/** 点「加好友」→ 就地展开附言输入框（不弹浏览器原生 prompt） */
function ask(u) {
  noteFor.value = u.id;
  note.value = '';
}

function cancelNote() {
  noteFor.value = null;
  note.value = '';
}

async function sendRequest(u) {
  if (busy.value) return;
  busy.value = true;
  const keep = note.value;
  noteFor.value = null;
  try {
    const r = await socialApi.request(u.id, keep.trim());
    toast(r && r.status === 'ACCEPTED' ? '你们已经成为好友' : '请求已发送');
    await loadAll();
    if (search.value.length) await doSearch();
  } catch (e) {
    toast(errText(e));
    note.value = keep;
  } finally {
    busy.value = false;
  }
}

async function accept(requestId) {
  try {
    await socialApi.accept(requestId);
    toast('已加为好友');
    await loadAll();
    if (searched.value) await doSearch();
  } catch (e) {
    toast(errText(e));
  }
}

async function reject(requestId) {
  try {
    await socialApi.reject(requestId);
    toast('已拒绝');
    await loadAll();
  } catch (e) {
    toast(errText(e));
  }
}

/** 搜索结果里点「接受对方请求」：先按 fromId 找到那条 PENDING 的 requestId */
async function acceptByUser(userId) {
  try {
    const r = await socialApi.requests();
    const hit = ((r && r.items) || []).find((x) => x.fromId === userId);
    if (!hit) {
      toast('这条请求可能已被处理');
      await loadAll();
      return;
    }
    await accept(hit.requestId);
  } catch (e) {
    toast(errText(e));
  }
}

async function remove(userId) {
  try {
    await socialApi.unfriend(userId);
    toast('已删除好友');
    await loadAll();
  } catch (e) {
    toast(errText(e));
  }
}

/** 发消息：批 2 之前先回落旧页消息列表（批 2 会直接定位到这个人） */
function openChat() {
  location.replace(API_BASE + '/?v=chat');
}

function errText(e) {
  const code = e instanceof ApiError ? e.code : '';
  const map = {
    CANT_ADD_SELF: '不能加自己为好友',
    USER_NOT_FOUND: '这个人不存在',
    ALREADY_FRIEND: '你们已经是好友了',
    PENDING_EXISTS: '已经发过请求，等对方处理',
    TARGET_IS_BOT: 'AI 账号不能加好友',
    NOT_FRIEND: '你们不是好友',
    REQUEST_NOT_PENDING: '这条请求已经处理过了',
    NOT_REQUEST_TARGET: '这条请求不是发给你的'
  };
  return map[code] || '操作失败：' + (code || (e && e.message) || '');
}

function initial(name) {
  return String(name || '?').slice(0, 1);
}
</script>

<template>
  <h1 class="pg">好友</h1>
  <p class="sub">好友之间才能私聊 · 对方会收到一条好友请求通知</p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <template v-else>
    <!-- 加好友 -->
    <div class="card">
      <div class="card-h">加好友</div>
      <div class="fr-search">
        <input
          v-model="q"
          class="inp"
          placeholder="输入账号或昵称，如 wandou"
          @keydown.enter="doSearch"
        >
        <button class="btn primary" @click="doSearch">搜索</button>
      </div>

      <div v-if="searched" style="margin-top: 10px">
        <template v-if="search.length">
          <div v-for="u in search" :key="u.id">
            <div class="fr-row">
              <div class="fr-av">{{ initial(u.name) }}</div>
              <div class="fr-main">
                <div class="fr-name">{{ u.name }}</div>
                <div class="fr-id">@{{ u.id }}</div>
              </div>
              <div class="fr-act">
                <span v-if="u.isSelf" class="sub">这是你自己</span>
                <button v-else-if="u.isFriend" class="btn ghost" disabled>已是好友</button>
                <button v-else-if="u.pendingIn" class="btn primary" @click="acceptByUser(u.id)">接受对方请求</button>
                <button v-else-if="u.hasPendingRequest" class="btn ghost" disabled>已发送</button>
                <button v-else class="btn primary" @click="ask(u)">加好友</button>
              </div>
            </div>

            <div v-if="noteFor === u.id" class="fr-note">
              <input
                v-model="note"
                class="inp"
                maxlength="100"
                placeholder="附言（可选，最多 100 字）"
                @keydown.enter="sendRequest(u)"
              >
              <button class="btn primary" :disabled="busy" @click="sendRequest(u)">发送</button>
              <button class="btn ghost" @click="cancelNote">取消</button>
            </div>
          </div>
        </template>
        <div v-else class="sub">没找到这个人（账号要完全一致，昵称可以是片段）</div>
      </div>
    </div>

    <!-- 待处理请求 -->
    <div v-if="requests.length" class="card" style="margin-top: 14px">
      <div class="card-h">待处理请求 <span class="sub">{{ requests.length }}</span></div>
      <div v-for="r in requests" :key="r.requestId" class="fr-row">
        <div class="fr-av">{{ initial(r.fromName) }}</div>
        <div class="fr-main">
          <div class="fr-name">{{ r.fromName }} <span class="fr-id">@{{ r.fromId }}</span></div>
          <div v-if="r.note" class="fr-note-text">「{{ r.note }}」</div>
        </div>
        <div class="fr-act">
          <button class="btn primary" @click="accept(r.requestId)">接受</button>
          <button class="btn ghost" @click="reject(r.requestId)">拒绝</button>
        </div>
      </div>
    </div>

    <!-- 我的好友 -->
    <div class="card-h" style="margin: 18px 0 8px">我的好友 <span class="sub">{{ friends.length }}</span></div>
    <div v-if="friends.length" class="card" style="padding: 0; overflow: hidden">
      <div v-for="f in friends" :key="f.id" class="fr-row">
        <div class="fr-av">{{ initial(f.name) }}</div>
        <div class="fr-main">
          <div class="fr-name">{{ f.name }} <span class="fr-id">@{{ f.id }}</span></div>
        </div>
        <div class="fr-act">
          <button class="btn primary" @click="openChat">发消息</button>
          <button class="btn ghost" @click="remove(f.id)">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="card"><div class="empty">还没有好友，先在上面搜一个人加吧</div></div>
  </template>
</template>
