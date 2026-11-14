<script setup>
/**
 * 多人房间（等价旧 room.js）：建房 / 房间号加入 / 公开房间 / 准备 / 房主开局 / 邀请好友。
 *
 * 身份由令牌决定（前端不传 userId/userName），所以这里只负责「未登录就引导去登录」。
 *
 * 两个入口：
 * · 侧栏「多人辩论」→ 房间列表/建房；
 * · 聊天里的邀请卡片 → `#/room?join=SY-XXXX`，进来自动加入。
 *
 * 轮询 1.2 秒：房间里别人准备/开局要能立刻看到；一旦开局就跳对局页并停轮询。
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { roomApi, socialApi, ApiError } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import { useDebateStore } from '../stores/debate.js';
import { debateApi } from '../api.js';
import { toast } from '../utils/toast.js';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const debate = useDebateStore();

const rooms = ref([]);
const roomCode = ref('');
const room = ref(null);          // 后端 detail：{ room, seats, mySeat, isHost, canStart, unready, humans }
const mySeat = ref('');
const joinCode = ref('');
const pollTimer = ref(null);
const invite = ref({ open: false, loading: false, friends: [], sent: {}, error: '' });

const r = computed(() => (room.value && room.value.room) || {});
const seats = computed(() => (room.value && room.value.seats) || []);
const hostId = computed(() => (room.value && room.value.host) || r.value.host_user || '');

/**
 * 房间档位：后端 `RoomService.start` 取 `room.tier`，没设就是 PRO。
 * 前端**不提供档位选择**（房间层没有这个入参），只把当前口径显示清楚。
 */
const roomTier = computed(() => String(r.value.tier || 'PRO').toUpperCase());

const myReady = computed(() => {
  const mine = seats.value.find((s) => s.seat_key === mySeat.value);
  return !!(mine && mine.ready);
});

onMounted(async () => {
  if (!auth.user) {
    router.push({ name: 'login', query: { next: '/room' } });
    return;
  }
  // 从聊天里的邀请卡片进来：#/room?join=SY-XXXX
  const code = String(route.query.join || '');
  if (code) {
    await doJoin(code);
    router.replace({ name: 'room' });     // 把 query 清掉，刷新不会重复加入
    return;
  }
  await loadRooms();
});

onBeforeUnmount(stopPoll);

watch(roomCode, (v) => {
  if (v) startPoll();
  else stopPoll();
});

async function loadRooms() {
  try {
    rooms.value = (await roomApi.list()) || [];
  } catch (e) {
    rooms.value = [];
  }
}

function startPoll() {
  stopPoll();
  pollTimer.value = setInterval(async () => {
    if (!roomCode.value || !auth.user) return;
    try {
      const d = await roomApi.detail(roomCode.value);
      room.value = d;
      // 房主开局 / 别人把所有位置占满开局 → 直接进对局
      if (d && d.room && d.room.status === 'RUNNING' && d.room.match_id) {
        stopPoll();
        await enterMatch(d.room.match_id);
      }
    } catch (e) {
      /* 轮询失败静默，下一轮再试 */
    }
  }, 1200);
}

function stopPoll() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
}

async function enterMatch(matchId) {
  debate.matchId = String(matchId);
  await debate.load(true);
  debate.startPoll();
  router.push({ name: 'match' });
}

async function createRoom() {
  try {
    const res = await roomApi.create(null);
    roomCode.value = res.code;
    room.value = res.detail;
    mySeat.value = res.detail.mySeat;
    toast('房间已创建：' + res.code);
  } catch (e) {
    toast('建房失败：' + errText(e));
  }
}

async function doJoin(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return toast('填房间号');
  try {
    const d = await roomApi.join(c);
    room.value = d;
    roomCode.value = c;
    mySeat.value = d.mySeat;
    toast('已加入 ' + c + ' · 你坐 ' + d.mySeat);
  } catch (e) {
    toast('加入失败：' + errText(e));
  }
}

async function leaveRoom() {
  try {
    await roomApi.leave(roomCode.value);
  } catch (e) {
    /* 退出失败也照样清本地状态 */
  }
  stopPoll();
  roomCode.value = '';
  room.value = null;
  mySeat.value = '';
  await loadRooms();
}

async function toggleReady() {
  try {
    room.value = await roomApi.ready(roomCode.value, !myReady.value);
  } catch (e) {
    toast('操作失败：' + errText(e));
  }
}

async function startRoom() {
  try {
    const res = await roomApi.start(roomCode.value);
    stopPoll();
    await enterMatch(res.matchId);
  } catch (e) {
    toast('开局失败：' + errText(e));
  }
}

function copyRoom() {
  try {
    navigator.clipboard?.writeText(roomCode.value)?.catch(() => {});
  } catch (e) {
    /* 忽略 */
  }
  toast('已复制：' + roomCode.value);
}

// ==================== 邀请好友 ====================

async function openInvite() {
  invite.value = { open: true, loading: true, friends: [], sent: {}, error: '' };
  try {
    const res = await socialApi.friends();
    invite.value.friends = (res && res.items) || [];
  } catch (e) {
    invite.value.error = errText(e) || '好友列表加载失败';
  }
  invite.value.loading = false;
}

async function sendInvite(f) {
  try {
    await roomApi.invite(f.id, roomCode.value, r.value.topic_title || '');
    invite.value.sent[f.id] = true;
    toast('邀请已发出');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : '';
    const map = {
      NOT_FRIEND: '你们不是好友，不能邀请',
      INVALID_ROOM_CODE: '房间号格式不对',
      INVALID_TARGET: '邀请对象不对'
    };
    toast(map[code] || '邀请失败：' + errText(e).slice(0, 40));
  }
}

function errText(e) {
  if (e instanceof ApiError) return e.code || e.message;
  return (e && e.message) || '';
}

function roleTag(s) {
  if (s.occupant !== 'USER') return '';
  return String(s.user_id) === String(hostId.value)
    ? { cls: 'tag', text: '房主' }
    : { cls: 'tag g', text: '玩家' };
}
</script>

<template>
  <!-- ==================== 房间列表（还没进房间） ==================== -->
  <template v-if="!roomCode">
    <h1 class="pg">多人辩论</h1>
    <p class="sub">8 席房间：建房 → 把房间号发给队友 → 全员准备 → 房主开局。空位自动补 AI。</p>

    <div class="grid g3" style="max-width: 1000px">
      <div class="card">
        <b style="font-size: 13px">① 创建房间</b>
        <p style="font-size: 12px; color: #8a909c; margin: 8px 0 12px">随机抽一道题，你坐 A1，房主免准备。</p>
        <button class="btn primary" style="width: 100%" @click="createRoom">＋ 建房</button>
      </div>

      <div class="card">
        <b style="font-size: 13px">② 房间号加入</b>
        <input
          v-model="joinCode"
          class="btn ghost"
          style="width: 100%; margin: 10px 0; text-align: left; padding: 8px 12px"
          placeholder="SY-XXXX"
          @keydown.enter="doJoin(joinCode)"
        >
        <button class="btn ghost" style="width: 100%" @click="doJoin(joinCode)">加入</button>
      </div>

      <div class="card">
        <b style="font-size: 13px">③ 公开房间</b>
        <div style="font-size: 12.5px; color: #4a5568; line-height: 2; margin-top: 8px">
          <div v-for="x in rooms" :key="x.code" class="row" style="justify-content: space-between">
            <span class="mono">{{ x.code }}</span>
            <span style="flex: 1; margin: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ x.topic_title }}
            </span>
            <a style="color: #2f5bea; cursor: pointer" @click="doJoin(x.code)">加入</a>
          </div>
          <div v-if="!rooms.length" class="empty">现在没有公开房间</div>
        </div>
      </div>
    </div>
  </template>

  <!-- ==================== 房间内 ==================== -->
  <template v-else>
    <div class="row" style="justify-content: space-between; margin-bottom: 12px">
      <div>
        <h1 class="pg">{{ r.topic_title || '房间' }}</h1>
        <p class="sub" style="margin: 0">
          房间 <span class="mono">{{ roomCode }}</span> · {{ r.status || '' }} · 真人
          {{ (room && room.humans) || 0 }}/8 {{ room && room.isHost ? '· 你是房主' : '' }}
        </p>
      </div>
      <div class="row">
        <button class="btn ghost" @click="copyRoom">复制房间号</button>
        <button v-if="room && room.isHost" class="btn ghost" @click="openInvite">邀请好友</button>
        <button class="btn ghost" @click="leaveRoom">退出</button>
        <button v-if="room && room.isHost" class="btn primary" :disabled="!room.canStart" @click="startRoom">
          开始辩论{{ room.canStart ? '' : '（' + ((room.unready || []).length) + ' 人未准备）' }}
        </button>
        <button v-else class="btn primary" @click="toggleReady">{{ myReady ? '取消准备' : '准备' }}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px">
      <b style="font-size: 12.5px">房间号</b>
      <span
        class="mono"
        style="margin-left: 10px; font-size: 16px; letter-spacing: 2px; color: #2f5bea; background: #edf1fe; border-radius: 7px; padding: 3px 10px"
      >
        {{ roomCode }}
      </span>
      <span style="margin-left: 12px; font-size: 11.5px; color: #8a909c">
        队友在「多人辩论 → 房间号加入」里输入这一串
      </span>
    </div>

    <!-- 多人房的计费口径：整场记在房主名下（后端 payer_user_id = 房主），档位取房间设置，默认 PRO -->
    <div class="card" style="margin-bottom: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
      <b style="font-size: 12.5px">费用</b>
      <span style="font-size: 12.5px; color: #4a5568">本场费用由房主承担 · 档位 高级版({{ roomTier }})</span>
      <span style="font-size: 11.5px; color: #8a909c">
        其余席位不扣费；账单记在房主名下{{ room && room.isHost ? '（你是房主）' : '' }}
      </span>
    </div>

    <div class="strip">
      <div v-for="s in seats" :key="s.seat_key" class="sp" :class="{ me: s.seat_key === mySeat }">
        <div class="av" :class="s.side === 'A' ? 'a' : 'b'">
          {{ s.seat_key === mySeat ? '我' : String(s.occupant === 'USER' ? s.user_name || '?' : s.occupant === 'AI' ? 'AI' : '空').slice(0, 1) }}
        </div>
        <div>
          <div class="nm">
            {{ s.occupant === 'USER' ? s.user_name || '未知' : s.occupant === 'AI' ? s.user_name || 'AI' : '空位' }}
            <span v-if="roleTag(s)" :class="roleTag(s).cls">{{ roleTag(s).text }}</span>
          </div>
          <div class="rl">
            {{ s.side === 'A' ? '正方' : '反方' }}{{ s.role }}{{ s.ready ? ' · 已准备' : '' }}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <b style="font-size: 12.5px">席位</b>
      <table class="t" style="margin-top: 8px">
        <thead>
          <tr><th>席位</th><th>辩位</th><th>占位</th><th>准备</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in seats" :key="s.seat_key">
            <td class="mono">{{ s.seat_key }}</td>
            <td>{{ s.role }}</td>
            <td>
              <template v-if="s.occupant === 'USER'">
                {{ s.user_name || '未知' }}
                <span v-if="roleTag(s)" :class="roleTag(s).cls">{{ roleTag(s).text }}</span>
                <span v-if="s.seat_key === mySeat" class="tag">你</span>
              </template>
              <template v-else-if="s.occupant === 'AI'">AI</template>
              <span v-else style="color: #a8adb8">空位（开局补 AI）</span>
            </td>
            <td>
              <span v-if="s.occupant === 'AI'" class="tag g">就绪</span>
              <span v-else-if="s.ready" class="tag g">已准备</span>
              <span v-else class="tag">未准备</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <!-- ==================== 邀请好友弹窗 ==================== -->
  <div v-if="invite.open" class="mask" @click.self="invite.open = false">
    <div class="iv-box">
      <div class="iv-head">
        <b>邀请好友加入</b>
        <button class="btn ghost sm" @click="invite.open = false">关闭</button>
      </div>
      <p class="sub" style="margin: 0 0 10px">
        房间 <span class="mono">{{ roomCode }}</span> · 对方会收到一张卡片，点一下就能进
      </p>
      <div class="iv-list">
        <div v-if="invite.loading" class="empty" style="padding: 24px">加载好友…</div>
        <div v-else-if="invite.error" class="empty" style="padding: 24px">{{ invite.error }}</div>
        <template v-else-if="invite.friends.length">
          <div v-for="f in invite.friends" :key="f.id" class="fr-row">
            <div class="fr-av">{{ String(f.name || '?').slice(0, 1) }}</div>
            <div class="fr-main">
              <div class="fr-name">{{ f.name }}</div>
              <div class="fr-id">@{{ f.id }}</div>
            </div>
            <div class="fr-act">
              <button v-if="invite.sent[f.id]" class="btn ghost" disabled>已邀请</button>
              <button v-else class="btn primary" @click="sendInvite(f)">邀请</button>
            </div>
          </div>
        </template>
        <div v-else class="empty" style="padding: 24px">
          还没有好友<br><span class="sub">先去「好友」页搜人加好友，再回来邀请</span>
        </div>
      </div>
    </div>
  </div>
</template>
