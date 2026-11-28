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
import { roomApi, socialApi, baseApi, ApiError } from '../api.js';
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
/** 建房时房主想坐哪个位置（原来固定 A1，用户反馈没法选）。 */
const hostSeat = ref('A1');
const HOST_SEATS = [
  { k: 'A1', n: '正一' }, { k: 'A2', n: '正二' }, { k: 'A3', n: '正三' }, { k: 'A4', n: '正四' },
  { k: 'B1', n: '反一' }, { k: 'B2', n: '反二' }, { k: 'B3', n: '反三' }, { k: 'B4', n: '反四' }
];
const pollTimer = ref(null);
const invite = ref({ open: false, loading: false, friends: [], sent: {}, error: '' });

/* ==================== 加入房间：先看空位再选座 ====================
 *
 * 用户口径：一人一席，不能「先到先占」。所以：
 * · 「查看空位」只调 detail（只读），把 8 个座位画出来；
 * · 点空位才 join，带上 seat；被抢了后端回 409 → 提示并刷新空位；
 * · 分享链接进来**不自动 join**，只预填房间号 + 打开空位面板。
 */
const peek = ref(null);          // 房间 detail（只读预览）
const peekCode = ref('');
const peekBusy = ref(false);
const peekErr = ref('');

/* ==================== 分享邀请（短链） ==================== */
const share = ref({ open: false, busy: false, shortUrl: '', target: '', err: '' });

const r = computed(() => (room.value && room.value.room) || {});
const seats = computed(() => (room.value && room.value.seats) || []);
const hostId = computed(() => (room.value && room.value.host) || r.value.host_user || '');

/** 空位面板用的 8 个座位（A1–B4），从 detail.seats 取占用情况 */
const SEAT_ALL = [
  { k: 'A1', side: 'A', role: '一辩' }, { k: 'A2', side: 'A', role: '二辩' },
  { k: 'A3', side: 'A', role: '三辩' }, { k: 'A4', side: 'A', role: '四辩' },
  { k: 'B1', side: 'B', role: '一辩' }, { k: 'B2', side: 'B', role: '二辩' },
  { k: 'B3', side: 'B', role: '三辩' }, { k: 'B4', side: 'B', role: '四辩' }
];
const peekSeats = computed(() => {
  const list = (peek.value && peek.value.seats) || [];
  return SEAT_ALL.map((s) => {
    const hit = list.find((x) => x.seat_key === s.k) || {};
    const occupied = hit.occupant === 'USER' || hit.occupant === 'AI';
    return {
      ...s,
      occupied,
      isAi: hit.occupant === 'AI',
      name: hit.user_name || (hit.occupant === 'AI' ? 'AI' : ''),
      ready: !!hit.ready
    };
  });
});
const peekMySeat = computed(() => (peek.value && peek.value.mySeat) || '');

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
  // 分享链接进来：#/room?join=SY-XXXX → **只预填 + 打开空位面板**，不自动占座
  const code = String(route.query.join || '').trim().toUpperCase();
  if (code) {
    joinCode.value = code;
    await peekRooms(code);
    router.replace({ name: 'room' });     // 把 query 清掉，刷新不会重复触发
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
      // 只在「本会话刚点过开始」时自动跳：否则进房间页会一直把我弹进对局，
      // 「继续进行中的对局」那个入口就永远看不到（B4 新加的手动继续入口需要它）。
      if (d && d.room && d.room.status === 'RUNNING' && d.room.match_id && autoEnter.value) {
        autoEnter.value = false;
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

/* ==================== 继续进行中的对局（其余席位 AI 补齐） ====================
 *
 * 场景：房间开局了，但我离开/刷新/队友散了。房间 detail 里带 match_id，
 * 只要我还在席位里，就能把这一场转成单人局接着打（后端 POST /continue-solo）。
 * 房间状态由 1.2s 轮询维护，`seats` 里能找到我的 seat_key 就说明我确实在场上。
 */
const continuing = ref(false);
/** 只在「我刚点开始辩论」后才自动跳进对局；刷新/回房间页时留给手动「继续这一场」 */
const autoEnter = ref(false);
const canContinue = computed(() => {
  const mid = String(r.value.match_id || '');
  if (!mid || r.value.status !== 'RUNNING') return false;
  if (!mySeat.value) return false;
  return seats.value.some((s) => String(s.seat_key || s.seat || '') === String(mySeat.value));
});

async function continueSolo() {
  const mid = String(r.value.match_id || '');
  if (!mid || continuing.value) return;
  continuing.value = true;
  try {
    await debateApi.continueSolo(mid);
    toast('已转成单人局，其余席位由 AI 补齐');
    await enterMatch(mid);
  } catch (e) {
    toast('继续失败：' + errText(e));
  } finally {
    continuing.value = false;
  }
}

async function createRoom() {
  try {
    const res = await roomApi.create(null, hostSeat.value);
    roomCode.value = res.code;
    room.value = res.detail;
    mySeat.value = res.detail.mySeat;
    toast('房间已创建：' + res.code + ' · 你坐 ' + res.detail.mySeat);
  } catch (e) {
    toast('建房失败：' + errText(e));
  }
}

async function doJoin(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return toast('填房间号');
  // 现在加入必须先选座：先拉空位，让用户自己点（避免一人多占 / 抢别人位置）
  await peekRooms(c);
}

/** 只读预览：拉房间详情，画空位面板（不占座） */
async function peekRooms(code) {
  const c = String(code || joinCode.value || '').trim().toUpperCase();
  if (!c) return toast('填房间号');
  peekBusy.value = true;
  peekErr.value = '';
  try {
    const d = await roomApi.detail(c);
    peek.value = d;
    peekCode.value = c;
    joinCode.value = c;
    // 已经在这间房里：直接显示「你已在 X 座」，给个进入按钮
    if (d && d.mySeat) mySeat.value = d.mySeat;
  } catch (e) {
    peek.value = null;
    peekCode.value = '';
    peekErr.value = errText(e) || '房间不存在或已关闭';
    toast('看不到这个房间：' + peekErr.value);
  } finally {
    peekBusy.value = false;
  }
}

/** 点空位 → 带 seat 加入；409 说明刚被抢，提示 + 刷新空位 */
async function joinSeat(seat) {
  if (!peek.value || !peekCode.value) return;
  const code = peekCode.value;
  peekBusy.value = true;
  try {
    const d = await roomApi.join(code, seat);
    room.value = d;
    roomCode.value = code;
    mySeat.value = d.mySeat || seat;
    peek.value = null;
    toast('已加入 ' + code + ' · 你坐 ' + mySeat.value);
  } catch (e) {
    const status = (e && e.status) || 0;
    const errCode = (e && e.code) || '';
    if (status === 409 || errCode === 'SEAT_TAKEN' || errCode === 'SEAT_OCCUPIED') {
      toast('这个位置刚被占了，换一个空位');
    } else {
      toast('加入失败：' + errText(e));
    }
    await peekRooms(code);          // 刷新空位，别让用户对着旧数据反复点
  } finally {
    peekBusy.value = false;
  }
}

/** 「进入房间」：已经在这间房里的人（mySeat 非空）用 */
async function enterPeeked() {
  const code = peekCode.value;
  if (!code) return;
  peekBusy.value = true;
  try {
    const d = await roomApi.detail(code);
    room.value = d;
    roomCode.value = code;
    mySeat.value = d.mySeat || '';
    peek.value = null;
  } catch (e) {
    toast('进入失败：' + errText(e));
  } finally {
    peekBusy.value = false;
  }
}

/* ==================== 分享邀请：短链 ==================== */

/** 复制：优先 clipboard，失败回退 execCommand */
async function copyText(text, label) {
  const t = String(text || '');
  if (!t) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
      ok = true;
    }
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      ok = false;
    }
  }
  toast(ok ? '已复制' + (label ? '：' + label : '') : '复制失败，请长按手动复制');
}

/** 构造邀请长链：pathname 已经带 /siyige/v2/ 前缀 */
function inviteTarget(code) {
  const base = (typeof location !== 'undefined' ? location.pathname : '/v2/index.html') || '/v2/index.html';
  return base + '#/room?join=' + encodeURIComponent(code || roomCode.value);
}

/** 打开分享弹层：先试短链，失败就用长链，不阻断分享 */
async function openShare(autoCopy) {
  const code = roomCode.value;
  if (!code) return;
  const target = inviteTarget(code);
  share.value = { open: true, busy: true, shortUrl: '', target, err: '' };
  try {
    const d = await baseApi.shortlink(target);
    const url = d && (d.url || d.shortUrl || d.path);
    share.value.shortUrl = url ? String(url) : '';
    if (!share.value.shortUrl) share.value.err = '短链服务没返回地址，先用长链接';
  } catch (e) {
    // 404 / 网络：回退长链接
    share.value.err = '短链暂时不可用，先用长链接';
  } finally {
    share.value.busy = false;
  }
  if (autoCopy) await copyText(share.value.shortUrl || target, share.value.shortUrl ? '邀请短链' : '邀请链接');
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
    autoEnter.value = true;          // 我刚开局：轮询看到 RUNNING 就直接进对局
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
        <p style="font-size: 12px; color: #8a909c; margin: 8px 0 10px">随机抽一道题，选一个位置坐下（房主免准备，空位由 AI 补）。</p>
        <div class="row" style="flex-wrap: wrap; gap: 6px; margin-bottom: 10px">
          <button
            v-for="s in HOST_SEATS"
            :key="s.k"
            class="btn sm"
            :class="hostSeat === s.k ? 'primary' : 'ghost'"
            @click="hostSeat = s.k"
          >{{ s.k }} {{ s.n }}</button>
        </div>
        <button class="btn primary" style="width: 100%" @click="createRoom">＋ 建房（坐 {{ hostSeat }}）</button>
      </div>

      <div class="card">
        <b style="font-size: 13px">② 房间号加入</b>
        <input
          v-model="joinCode"
          class="btn ghost"
          style="width: 100%; margin: 10px 0; text-align: left; padding: 8px 12px"
          placeholder="SY-XXXX"
          @keydown.enter="peekRooms(joinCode)"
        >
        <button class="btn ghost" style="width: 100%" :disabled="peekBusy" @click="peekRooms(joinCode)">
          {{ peekBusy ? '正在看空位…' : '查看空位' }}
        </button>

        <!-- 空位面板：点空位才加入；已占的不可点 -->
        <div v-if="peek" class="peek">
          <div class="peek-hd">
            <b>{{ peek.room && peek.room.topic_title ? peek.room.topic_title : peekCode }}</b>
            <span class="mono">{{ peekCode }}</span>
          </div>
          <div v-if="peekMySeat" class="peek-mine">
            你已在 <b>{{ peekMySeat }}</b> 座
            <button class="btn sm primary" style="margin-left: 8px" @click="enterPeeked">进入房间</button>
          </div>
          <div class="seatgrid">
            <button
              v-for="s in peekSeats"
              :key="s.k"
              type="button"
              class="seatcard"
              :class="{ taken: s.occupied, ai: s.isAi, mine: s.k === peekMySeat }"
              :disabled="s.occupied || peekBusy"
              @click="joinSeat(s.k)"
            >
              <span class="sk">{{ s.k }}</span>
              <span class="sr">{{ s.side === 'A' ? '正' : '反' }}{{ s.role }}</span>
              <span class="so">
                <template v-if="s.isAi">AI</template>
                <template v-else-if="s.occupied">{{ s.name || '已占' }}{{ s.ready ? ' · 已准备' : '' }}</template>
                <template v-else>空位</template>
              </span>
            </button>
          </div>
          <div class="peek-tip">点一个空位就坐下；每人只能占一个位置。</div>
        </div>
        <div v-else-if="peekErr" class="peek-err">{{ peekErr }}</div>
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
        <button class="btn ghost" @click="openShare(true)">分享邀请</button>
        <button v-if="room && room.isHost" class="btn ghost" @click="openInvite">邀请好友</button>
        <button class="btn ghost" @click="leaveRoom">退出</button>
        <button v-if="room && room.isHost" class="btn primary" :disabled="!room.canStart" @click="startRoom">
          开始辩论{{ room.canStart ? '' : '（' + ((room.unready || []).length) + ' 人未准备）' }}
        </button>
        <button v-else class="btn primary" @click="toggleReady">{{ myReady ? '取消准备' : '准备' }}</button>
      </div>
    </div>

    <!-- 房间里已有进行中的对局、我也在席位里 → 可以把它转成单人局接着打（其余席位 AI 补齐） -->
    <div
      v-if="canContinue"
      class="card"
      style="margin-bottom: 12px; border-color: #d6e0ff; background: #fbfcfe; display: flex; align-items: center; gap: 12px; flex-wrap: wrap"
    >
      <div style="flex: 1; min-width: 200px">
        <b style="font-size: 12.5px">这一场还能接着打</b>
        <div style="font-size: 11.5px; color: #8a909c; margin-top: 3px">
          房间已开局 · 你坐 {{ mySeat }} · 继续后其余席位自动由 AI 补齐
        </div>
      </div>
      <button class="btn primary sm" :disabled="continuing" @click="continueSolo">
        {{ continuing ? '正在开始…' : '继续这一场（其余席位 AI 补齐）' }}
      </button>
    </div>

    <div class="card" style="margin-bottom: 12px">
      <div class="row" style="gap: 10px; align-items: center">
        <b style="font-size: 12.5px">房间号</b>
        <span
          class="mono"
          style="font-size: 16px; letter-spacing: 2px; color: #2f5bea; background: #edf1fe; border-radius: 7px; padding: 3px 10px"
        >
          {{ roomCode }}
        </span>
        <button class="btn sm ghost" @click="openShare(true)">复制邀请链接</button>
      </div>
      <div style="margin-top: 6px; font-size: 11.5px; color: #8a909c">
        队友点邀请链接进来后，会先看到空位面板，自己选一席坐下
      </div>
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

  <!-- ==================== 分享邀请（短链）弹层 ==================== -->
  <div v-if="share.open" class="mask" @click.self="share.open = false">
    <div class="sh-box">
      <div class="iv-head">
        <b>分享邀请</b>
        <button class="btn ghost sm" @click="share.open = false">关闭</button>
      </div>
      <p class="sub" style="margin: 0 0 12px">
        队友点开链接 → 先看空位 → 自己选一席坐下。每人一席，不会抢位。
      </p>

      <div class="sh-row">
        <div class="sh-k">邀请短链</div>
        <div class="sh-v">
          <template v-if="share.busy">生成中…</template>
          <template v-else-if="share.shortUrl">{{ share.shortUrl }}</template>
          <template v-else>{{ share.target }}</template>
        </div>
        <button
          class="btn sm primary"
          :disabled="share.busy"
          @click="copyText(share.shortUrl || share.target, '邀请链接')"
        >复制</button>
      </div>

      <div class="sh-row">
        <div class="sh-k">房间号</div>
        <div class="sh-v mono">{{ roomCode }}</div>
        <button class="btn sm ghost" @click="copyText(roomCode, '房间号')">复制</button>
      </div>

      <div v-if="share.err" class="sh-err">{{ share.err }}</div>
      <div class="sh-tip">
        二维码：这一版没有引第三方库，先用上面的链接或房间号分享。
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 空位面板：8 个座位卡（2 列 × 4），已占的灰掉不可点 */
.peek { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.peek-hd {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--ink); margin-bottom: 8px;
}
.peek-hd .mono { font-size: 11.5px; color: var(--sub); }
.peek-mine {
  font-size: 12.5px; color: var(--ink);
  background: var(--blue-w); border-radius: 10px;
  padding: 8px 10px; margin-bottom: 8px;
}
.seatgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.seatcard {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  min-height: 64px; padding: 8px 10px; text-align: left;
  border: 1px solid var(--line); border-radius: 12px; background: var(--card);
  color: var(--ink); font: inherit; cursor: pointer;
}
.seatcard:hover:not(:disabled) { border-color: var(--accent, var(--blue)); background: var(--blue-w); }
.seatcard:disabled { cursor: not-allowed; opacity: 0.72; }
.seatcard.taken { background: var(--bg); }
.seatcard.mine { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue) inset; }
.seatcard .sk { font-size: 13px; font-weight: 700; }
.seatcard .sr { font-size: 11px; color: var(--sub); }
.seatcard .so { font-size: 11.5px; color: var(--sub); }
.seatcard.ai .so { color: var(--org); }
.peek-tip { margin-top: 8px; font-size: 11.5px; color: var(--sub); }
.peek-err { margin-top: 10px; font-size: 12px; color: var(--danger, #c0392b); }

/* 分享弹层 */
.sh-box {
  background: var(--card); border-radius: 16px; padding: 18px;
  width: min(520px, 100%); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
}
.sh-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  border: 1px solid var(--line); border-radius: 12px;
  padding: 8px 10px; margin-bottom: 8px;
}
.sh-k { flex: 0 0 64px; font-size: 12px; color: var(--sub); }
.sh-v {
  flex: 1; min-width: 0; font-size: 12.5px; color: var(--ink);
  word-break: break-all;
}
.sh-err { font-size: 11.5px; color: var(--org); margin-top: 4px; }
.sh-tip { font-size: 11.5px; color: var(--sub); margin-top: 10px; }

@media (max-width: 860px) {
  .seatgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sh-row .btn { min-height: 44px; }
}
</style>
