<script setup>
/**
 * 单人辩论（等价旧 solo.js）：题库 / 自定义辩题审核 / 选座位 / 开局。
 *
 * 选座位面板在旧版是 `openSeatPanel()` 动态拼 innerHTML，这里改成一个受控弹窗（state 驱动），
 * 行为一致：至少留一个席位、多个席位=一人分饰多角、节奏与陪练强度会影响开局参数。
 *
 * 批 2 起热榜「开辩」直接落到这里（旧版遗留：只能回旧页、丢 topicId）。
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { debateApi, baseApi, ApiError } from '../api.js';
import { useDebateStore, SEATS, SEAT_OF, SEG_OF } from '../stores/debate.js';
import { useAuthStore } from '../stores/auth.js';
import { useMetaStore } from '../stores/meta.js';
import { toast } from '../utils/toast.js';

const route = useRoute();
const router = useRouter();
const debate = useDebateStore();
const auth = useAuthStore();
const meta = useMetaStore();

const topics = ref([]);
const hot = ref(null);
const err = ref('');

// 自定义辩题
const customTopic = ref('');
const audit = ref(null);          // {loading, result, reason, suggestions, cached, title}
// 选座位面板
const seatOpen = ref(false);

const hotList = computed(() => ((hot.value && hot.value.list) || []).slice(0, 5));
const hotKey = computed(() => (hot.value && hot.value.key) || '');
const paceHintText = computed(() =>
  debate.pace === 'tight' ? '较短' : debate.pace === 'loose' ? '较长' : '标准'
);
const paceName = computed(() => (debate.pace === 'tight' ? '紧凑' : debate.pace === 'loose' ? '宽松' : '标准'));

onMounted(async () => {
  try {
    const [t, h] = await Promise.all([debateApi.topics(), baseApi.hot(12)]);
    topics.value = t || [];
    hot.value = h;
  } catch (e) {
    err.value = (e && e.message) || '加载失败';
  }
  // 从热辩榜「开辩」带题进来：#/solo?topic=t3 → 直接把选座面板打开
  if (route.query.topic) openSeat(String(route.query.topic));
});

function diffClass(d) {
  return d === '竞赛' ? 'o' : d === '进阶' ? 'b' : 'g';
}

/** 打开选座面板：topicId 为 null 表示「改席位」（不带题目） */
function openSeat(topicId) {
  debate.pendingTopicId = topicId == null ? null : String(topicId);
  seatOpen.value = true;
  // 档位是「这个部署环境有什么」的静态信息，进面板拉一次（meta 里缓存 5 分钟）
  meta.ensureAiTiers();
}

/**
 * 可选档位：基础版（本地 ollama）没启用时后端给 available:false —— 那种情况**整行不渲染**，
 * 不做置灰（置灰会让用户以为"再充钱就能用"）。后端拉不到时退化成只有高级版，保证还能开局。
 */
const tierList = computed(() => {
  const all = meta.aiTiers ? ['basic', 'pro', 'byok'].map((k) => meta.aiTiers[k]).filter((x) => x && x.available !== false) : [];
  return all.length ? all : [{ key: 'PRO', label: '高级版', note: '平台模型，按 token 计费 + 服务费' }];
});

const curTier = computed(() => tierList.value.find((x) => x.key === debate.tier) || tierList.value[0]);
const tierName = computed(() => (curTier.value && curTier.value.label) || '高级版');

/** 选档位：只存偏好，真正的降级（比如 BYOK 没配 key）由后端 normalize 决定，前端不自己猜 */
function pickTier(t) {
  debate.setTier(t.key);
  toast(
    t.key === 'BASIC'
      ? '已切到基础版（本地免费模型）'
      : t.key === 'BYOK'
        ? '已切到自带 Key（钱包里可填本地模型地址，完全免费）'
        : '已切到高级版（平台模型）'
  );
}

async function startFromPanel() {
  seatOpen.value = false;
  if (!auth.user) {
    toast('登录后才能开始辩论');
    router.push({ name: 'login', query: { next: '/solo' } });
    return;
  }
  const id = debate.pendingTopicId;
  const matchId = await debate.createMatch(id ? { topicId: id } : {});
  if (matchId) router.push({ name: 'match' });
}

// ==================== 自定义辩题：先过可辩性审核 ====================

async function useCustomTopic(titleOverride) {
  const title = String(titleOverride != null ? titleOverride : customTopic.value).trim();
  if (!title) return toast('先写一个辩题');
  if (!auth.user) {
    toast('登录后才能提交自定义辩题');
    router.push({ name: 'login', query: { next: '/solo' } });
    return;
  }
  audit.value = { loading: true, title };
  try {
    const r = await debateApi.auditTopic(title);
    audit.value = { loading: false, title, ...(r || {}) };
    // 审核通过 → 直接进选座位
    if (r && r.result === 'PASS') {
      audit.value = null;
      toast('审核通过，开始选位置');
      debate.pendingTitle = title;
      openSeat(null);
    }
  } catch (e) {
    audit.value = { loading: false, title, result: 'ERROR', reason: errText(e) };
  }
}

function adopt(s) {
  customTopic.value = s;
  useCustomTopic(s);
}

function errText(e) {
  if (e instanceof ApiError) return e.code || e.message;
  return (e && e.message) || '审核失败';
}
</script>

<template>
  <h1 class="pg">单人辩论</h1>
  <p class="sub">选一道题（或自己填）→ 选位置 → 直接开打。不建房、不等人，缺的席位由 AI 补齐。</p>

  <div v-if="err" class="card"><div class="empty">{{ err }}</div></div>

  <template v-else>
    <div class="grid g2" style="margin-bottom: 16px">
      <div class="card" style="display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap">
        <div style="flex: 1; min-width: 240px">
          <b style="font-size: 13px">自己出一个辩题 <span class="tag b">AI 审核</span></b>
          <div style="font-size: 11.5px; color: #8a909c; margin: 4px 0 8px">
            写一句你关心的问题，会先过可辩性审核
          </div>
          <input
            v-model="customTopic"
            class="btn ghost"
            style="width: 100%; text-align: left; padding: 8px 12px"
            placeholder="例如：该不该把 AI 生成内容算作学术不端"
            @keydown.enter="useCustomTopic()"
          >
        </div>
        <button class="btn primary" @click="useCustomTopic()">用这个题开练</button>
      </div>

      <div class="card">
        <b style="font-size: 13px">当前席位</b>
        <div style="font-size: 12.5px; color: #4a5568; margin-top: 6px; line-height: 1.8">
          <b style="color: #2f5bea">{{ debate.mySeats.join('、') }}</b> · 本场发言
          <b style="color: #2f5bea">{{ debate.myTurnCount }}</b> 次
        </div>
        <div class="row" style="margin-top: 8px">
          <button class="btn sm ghost" @click="openSeat(null)">改席位</button>
          <select v-model="debate.mode" class="btn sm ghost" @change="debate.setMode(debate.mode)">
            <option value="FULL">全流程 12 步</option>
            <option value="SPRINT">快速 8 步</option>
          </select>
        </div>
      </div>
    </div>

    <div class="grid g2">
      <div>
        <b style="font-size: 13px">题库</b>
        <div class="grid gauto" style="margin-top: 10px">
          <div v-for="t in topics" :key="t.id" class="topic" @click="openSeat(t.id)">
            <h3>{{ t.title }}</h3>
            <div class="row">
              <span class="tag">{{ t.cat }}</span>
              <span class="tag" :class="diffClass(t.diff)">{{ t.diff }}</span>
              <span class="tag">🔥 {{ t.hot }}</span>
            </div>
            <div class="meta">
              <span>已辩 {{ t.plays }} 场{{ t.source === 'custom' ? ' · 自定义' : '' }}</span>
              <span class="go">开练 →</span>
            </div>
          </div>
          <div v-if="!topics.length" class="empty">题库加载中…</div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="row" style="justify-content: space-between; margin-bottom: 10px">
            <b style="font-size: 13px">🔥 热辩榜</b>
            <a style="font-size: 12px; color: #2f5bea; cursor: pointer" @click="router.push({ name: 'hot' })">
              完整榜单 →
            </a>
          </div>
          <div class="hot">
            <div
              v-for="(x, i) in hotList"
              :key="x.topicId"
              class="hitem"
              :class="{ top1: i === 0 }"
              @click="openSeat(x.topicId)"
            >
              <div class="rk">{{ x.rank }}</div>
              <div style="flex: 1; min-width: 0">
                <div class="tt">{{ x.title }}</div>
                <div class="heatbar"><i :style="{ width: Math.min(100, x.score / 2) + '%' }"></i></div>
              </div>
              <div class="sc">{{ x.score }}</div>
            </div>
          </div>
          <div style="font-size: 11px; color: #a8adb8; margin-top: 10px">
            Redis <span class="mono">ZSET · {{ hotKey }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- ==================== 选座位面板 ==================== -->
  <div v-if="seatOpen" class="mask" @click.self="seatOpen = false">
    <div class="panel">
      <h2>你要坐哪几个位置？</h2>
      <div class="desc">选中的席位由你发言，其余自动由 AI 占满。多个位置 = 一个人分饰多角。</div>

      <div class="seats">
        <div>
          <div class="row" style="margin-bottom: 7px"><span class="tag b">正方</span></div>
          <div class="seat-grid">
            <div
              v-for="s in SEATS.filter((x) => x.side === 'A')"
              :key="s.k"
              class="seat"
              :class="{ on: debate.mySeats.includes(s.k) }"
              @click="debate.toggleSeat(s.k)"
            >
              <div class="k">{{ s.k }}</div>
              <div class="r">{{ s.role }}</div>
            </div>
          </div>
        </div>
        <div>
          <div class="row" style="margin-bottom: 7px"><span class="tag o">反方</span></div>
          <div class="seat-grid">
            <div
              v-for="s in SEATS.filter((x) => x.side === 'B')"
              :key="s.k"
              class="seat"
              :class="{ on: debate.mySeats.includes(s.k) }"
              @click="debate.toggleSeat(s.k)"
            >
              <div class="k">{{ s.k }}</div>
              <div class="r">{{ s.role }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="presets">
        <button class="preset" :class="{ on: debate.mySeats.join() === 'A1' }" @click="debate.setSeats(['A1'])">只练一辩</button>
        <button class="preset" :class="{ on: debate.mySeats.join() === 'A2' }" @click="debate.setSeats(['A2'])">只练二辩</button>
        <button class="preset" :class="{ on: debate.mySeats.join() === 'A1,A2' }" @click="debate.setSeats(['A1', 'A2'])">一辩 + 二辩</button>
        <button class="preset" :class="{ on: debate.mySeats.join() === 'A1,A2,A3,A4' }" @click="debate.setSeats(['A1', 'A2', 'A3', 'A4'])">己方四人</button>
        <button class="preset" :class="{ on: debate.mySeats.length === 8 }" @click="debate.setSeats(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'])">正反全占</button>
      </div>

      <div class="row" style="margin-top: 14px; gap: 8px">
        <span style="font-size: 12.5px; color: #4a5568">节奏</span>
        <button
          v-for="p in [['tight', '紧凑', '赶时间，练单点'], ['normal', '标准', '一次完整论证'], ['loose', '宽松', '慢慢想、写足']]"
          :key="p[0]"
          class="preset"
          :class="{ on: debate.pace === p[0] }"
          :title="p[2]"
          @click="debate.setPace(p[0])"
        >
          {{ p[1] }}
        </button>
        <span style="font-size: 11.5px; color: #8a909c">各环节时长不同：立论 {{ paceHintText }}</span>
      </div>

      <div class="row" style="margin-top: 10px; gap: 8px">
        <span style="font-size: 12.5px; color: #4a5568">陪练强度</span>
        <button
          v-for="p in [['novice', '新手', '给你台阶，不抓漏洞'], ['pro', '进阶', '正常对抗'], ['contest', '竞赛', '专抓你的漏洞，会埋雷']]"
          :key="p[0]"
          class="preset"
          :class="{ on: debate.difficulty === p[0] }"
          :title="p[2]"
          @click="debate.setDifficulty(p[0])"
        >
          {{ p[1] }}
        </button>
        <span style="font-size: 11.5px; color: #8a909c">竞赛难度会故意犯逻辑错误，等你抓</span>
      </div>

      <!-- AI 档位：基础版未启用时后端 available=false，这里整行不出现（不是置灰） -->
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #f3f1eb">
        <div class="row" style="gap: 8px; align-items: center; flex-wrap: wrap">
          <span style="font-size: 12.5px; color: #4a5568">AI 档位</span>
          <button
            v-for="t in tierList"
            :key="t.key"
            class="preset"
            :class="{ on: debate.tier === t.key }"
            :title="t.note || ''"
            @click="pickTier(t)"
          >
            {{ t.label }}
          </button>
        </div>
        <div style="font-size: 11.5px; color: #a8adb8; margin-top: 6px; line-height: 1.6">
          {{ (curTier && curTier.note) || '' }}
        </div>
      </div>

      <div class="sum">
        已选：<b>{{ [...debate.mySeats].sort().join(' ') }}</b> · 本场你将发言
        <b>{{ debate.myTurnCount }}</b> 次 · 节奏 <b>{{ paceName }}</b> · 档位 <b>{{ tierName }}</b>
      </div>

      <div class="row" style="justify-content: flex-end; margin-top: 16px">
        <button class="btn ghost" @click="seatOpen = false">取消</button>
        <button class="btn primary" @click="startFromPanel">进入对局</button>
      </div>
    </div>
  </div>

  <!-- ==================== AI 审核结果 ==================== -->
  <div v-if="audit" class="mask" @click.self="audit = null">
    <div class="panel" style="width: min(560px, 100%)">
      <div class="row" style="gap: 10px; margin-bottom: 6px">
        <span style="font-size: 22px">{{ audit.loading ? '⏳' : audit.result === 'REJECT' ? '⛔' : '✏️' }}</span>
        <h2 :style="{ margin: 0, color: audit.loading ? '#8A909C' : audit.result === 'REJECT' ? '#C0392B' : '#C2671E' }">
          {{ audit.loading ? 'AI 审核中…' : '需要修改' }}
        </h2>
        <span v-if="audit.cached" class="tag">命中缓存</span>
      </div>
      <div class="desc">「{{ audit.title }}」</div>

      <div v-if="audit.loading" class="sum">正在判断：是否可辩 · 正反是否平衡 · 是否合规</div>
      <template v-else>
        <div class="sum"><b>结论：</b>{{ audit.reason }}</div>
        <div v-if="(audit.suggestions || []).length" style="margin-top: 12px; font-size: 12.5px; color: #6b7280">
          试试这些改写：
        </div>
        <div v-for="(s, i) in audit.suggestions || []" :key="i" class="row" style="margin-top: 6px">
          <span style="flex: 1; font-size: 13px">{{ s }}</span>
          <button class="btn sm ghost" @click="adopt(s)">用这个</button>
        </div>
      </template>

      <div class="row" style="justify-content: flex-end; margin-top: 16px">
        <button class="btn ghost" @click="audit = null">关闭</button>
      </div>
    </div>
  </div>
</template>
