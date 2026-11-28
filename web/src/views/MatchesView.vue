<script setup>
/**
 * 对局板块：两个 tab。
 * · 进行中：`GET /api/matches/mine`（按 last_active_at 倒序、最多 20 条）→ 继续 / 删除；
 * · 已结束：`GET /api/matches/history` → 总分 / 用时 / 发言条数 / 看复盘。
 * 单人页里的「进行中的对局」是进行中这份数据的精简版，标题旁的「查看全部 →」跳到这里。
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { debateApi } from '../api.js';
import { useDebateStore } from '../stores/debate.js';
import { toast } from '../utils/toast.js';

const router = useRouter();
const debate = useDebateStore();

/** 'running' | 'finished' */
const tab = ref('running');

const list = ref([]);
const loading = ref(false);
const busyId = ref('');
/** 接口失败只在第一次提示，别在轮询/重进时反复弹 */
const loadErr = ref('');

/** 已结束那一份数据 */
const history = ref([]);
const historyLoading = ref(false);
const historyErr = ref('');

async function load() {
  loading.value = true;
  try {
    const d = await debateApi.mine();
    const arr = Array.isArray(d) ? d : ((d && (d.items || d.matches)) || []);
    // 防御：后端已经把「未完成」筛过了，这里再按状态兜一层
    list.value = arr.filter((x) => !x.status || x.status === 'RUNNING');
    loadErr.value = '';
  } catch (e) {
    loadErr.value = (e && e.message) || '加载失败';
    list.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  historyLoading.value = true;
  historyErr.value = '';
  try {
    const d = await debateApi.history();
    const arr = Array.isArray(d) ? d : ((d && (d.items || d.matches)) || []);
    history.value = arr;
  } catch (e) {
    // 后端还没上线时给一句人话，不把原始 JSON 甩给用户
    const raw = String((e && e.message) || '');
    historyErr.value = /^\{/.test(raw.trim())
      ? '接口未就绪（' + (((e && e.code) || (e && e.status)) || '404') + '）'
      : (raw || '加载失败');
    history.value = [];
  } finally {
    historyLoading.value = false;
  }
}

/** 切 tab：每次切换都重新拉（用户口径：切过来看到的就是最新） */
watch(tab, (v) => {
  if (v === 'finished') loadHistory();
  else load();
});

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 月-日 时:分 */
function relTime(ts) {
  const n = Number(ts) || 0;
  if (!n) return '';
  const d = new Date(n < 1e12 ? n * 1000 : n);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return '刚刚';
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const modeText = (m) => (m.kind === 'room' || m.roomCode ? '房间' : '单人');
const stepText = (m) => '第 ' + (Number(m.step) || 1) + '/' + (Number(m.totalSteps) || '?') + ' 步';

async function resume(m) {
  const id = String(m.matchId || m.id || '');
  if (!id || busyId.value) return;
  busyId.value = id;
  try {
    // 房间局：先把其余席位转成 AI（后端 continue-solo），再进对局
    if (m.kind === 'room' || m.roomCode) {
      try {
        await debateApi.continueSolo(id);
      } catch (e) {
        // 后端没上线/已转过：不阻塞，照样尝试进入（进不去会再报错）
      }
    }
    await debate.start(id);
    router.push({ name: 'match' });
  } catch (e) {
    toast('进入失败：' + ((e && e.message) || ''));
  } finally {
    busyId.value = '';
  }
}

async function remove(m) {
  const id = String(m.matchId || m.id || '');
  if (!id || busyId.value) return;
  if (!window.confirm('删除这一场对局？\n\n列表里不再显示，已结算的费用不受影响，不可恢复。')) return;
  busyId.value = id;
  try {
    await debateApi.remove(id);
    if (debate.matchId === id) debate.reset();
    toast('已删除');
    await load();
  } catch (e) {
    toast('删除失败：' + ((e && e.message) || ''));
  } finally {
    busyId.value = '';
  }
}

const count = computed(() => list.value.length);
const historyCount = computed(() => history.value.length);

/** 已结束那一行：总分 */
const scoreText = (h) => (h.totalScore == null ? '待出分' : h.totalScore + ' 分');

/** 已结束：进复盘（带 ?match= 刷新不丢） */
function openReview(h) {
  const id = String(h.matchId || h.id || '');
  if (!id) return;
  router.push({ name: 'review', query: { match: id } });
}

onMounted(load);
</script>

<template>
  <h1 class="pg">对局</h1>
  <p class="sub">进行中的可以接着打；打过的在这里回看复盘。</p>

  <!-- 两个 tab：进行中 / 已结束（切换即重新拉数据） -->
  <div class="mv-tabs" role="tablist">
    <button
      type="button"
      class="mv-tab"
      :class="{ on: tab === 'running' }"
      role="tab"
      :aria-selected="tab === 'running'"
      @click="tab = 'running'"
    >进行中 <span v-if="count" class="mv-badge">{{ count }}</span></button>
    <button
      type="button"
      class="mv-tab"
      :class="{ on: tab === 'finished' }"
      role="tab"
      :aria-selected="tab === 'finished'"
      @click="tab = 'finished'"
    >已结束 <span v-if="historyCount" class="mv-badge">{{ historyCount }}</span></button>
  </div>

  <div class="card">
    <!-- ==================== 进行中 ==================== -->
    <template v-if="tab === 'running'">
      <div class="row" style="justify-content: space-between; align-items: baseline">
        <b style="font-size: 13px">共 {{ count }} 场</b>
        <button class="btn sm ghost" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>

      <!-- 加载中：骨架 -->
      <div v-if="loading && !count" class="mv-sk"><i></i><i></i><i></i></div>

      <div v-else-if="loadErr" class="empty" style="padding: 16px 0">
        列表加载失败（{{ loadErr }}）<br>
        <button class="btn sm ghost" style="margin-top: 8px" @click="load">重试</button>
      </div>

      <!-- 空态：还没开过 / 全打完了 -->
      <div v-else-if="!count" class="mv-empty">
        <div class="mv-empty-t">还没有未完成的对局</div>
        <div class="mv-empty-d">开一局，随时能回来接着打。</div>
        <button class="btn primary" style="margin-top: 12px" @click="router.push({ name: 'solo' })">去开一局</button>
      </div>

      <!-- 列表：超过 10 条在卡片内滚动，页面本身不拉长 -->
      <div v-else class="mv-list" :class="{ scroll: count > 10 }">
        <div v-for="m in list" :key="m.matchId || m.id" class="mv-row">
          <div class="mv-main">
            <div class="mv-title">{{ m.topicTitle || m.topic_title || '（未命名辩题）' }}</div>
            <div class="mv-meta">
              <span class="mv-kv">{{ stepText(m) }}</span>
              <span v-if="m.mySeats" class="mv-kv">席位 {{ m.mySeats }}</span>
              <span class="mv-kv">{{ modeText(m) }}</span>
              <span v-if="m.roomCode" class="mv-kv">房间 {{ m.roomCode }}</span>
              <!-- 后端 last_active_at 在「刚建还没动过」的场次里是 0，这时显示「刚刚」而不是留空 -->
              <span class="mv-kv mv-time">{{ relTime(m.updatedAt) || '刚刚' }}</span>
            </div>
          </div>
          <div class="mv-acts">
            <button class="btn primary sm" :disabled="busyId === (m.matchId || m.id)" @click="resume(m)">继续</button>
            <button class="btn ghost sm" :disabled="busyId === (m.matchId || m.id)" @click="remove(m)">删除</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ==================== 已结束 ==================== -->
    <template v-else>
      <div class="row" style="justify-content: space-between; align-items: baseline">
        <b style="font-size: 13px">共 {{ historyCount }} 场</b>
        <button class="btn sm ghost" :disabled="historyLoading" @click="loadHistory">{{ historyLoading ? '刷新中…' : '刷新' }}</button>
      </div>

      <div v-if="historyLoading && !historyCount" class="mv-sk"><i></i><i></i><i></i></div>

      <div v-else-if="historyErr" class="empty" style="padding: 16px 0">
        已结束列表暂时不可用（{{ historyErr }}）<br>
        <button class="btn sm ghost" style="margin-top: 8px" @click="loadHistory">重试</button>
      </div>

      <div v-else-if="!historyCount" class="mv-empty">
        <div class="mv-empty-t">还没有打完的对局</div>
        <div class="mv-empty-d">打完一场，这里会给出总分和复盘入口。</div>
        <button class="btn primary" style="margin-top: 12px" @click="router.push({ name: 'solo' })">去打一场</button>
      </div>

      <div v-else class="mv-list" :class="{ scroll: historyCount > 10 }">
        <div v-for="h in history" :key="'h' + (h.matchId || h.id)" class="mv-row">
          <div class="mv-main">
            <div class="mv-title">{{ h.topicTitle || h.topic_title || '（未命名辩题）' }}</div>
            <div class="mv-meta">
              <span class="mv-kv mv-score">{{ scoreText(h) }}</span>
              <span v-if="h.mySeats" class="mv-kv">席位 {{ h.mySeats }}</span>
              <span v-if="h.turns != null" class="mv-kv">发言 {{ h.turns }} 条</span>
              <span class="mv-kv mv-time">{{ relTime(h.finishedAt) || '—' }}</span>
            </div>
          </div>
          <div class="mv-acts">
            <button class="btn primary sm" @click="openReview(h)">看复盘</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* tab 切换（两个等宽按钮，选中主色药丸） */
.mv-tabs {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
}
.mv-tab {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--sub);
  font-size: 13.5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mv-tab.on { background: var(--blue); border-color: var(--blue); color: #fff; font-weight: 600; }
.mv-badge {
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--blue-w);
  color: var(--blue);
  font-size: 11px;
  font-weight: 600;
}
.mv-tab.on .mv-badge { background: rgba(255, 255, 255, 0.24); color: #fff; }

/* 骨架（加载中） */
.mv-sk { padding: 14px 0; }
.mv-sk i {
  display: block;
  height: 14px;
  border-radius: 7px;
  background: var(--track, #f1efe9);
  margin-bottom: 10px;
  animation: mvPulse 1.2s ease-in-out infinite;
}
.mv-sk i:nth-child(2) { width: 80%; }
.mv-sk i:nth-child(3) { width: 62%; }
@keyframes mvPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* 列表：一行 = 辩题 + 元信息 + 两个操作；375px 下自动换行、不横向溢出 */
.mv-list { margin-top: 10px; display: flex; flex-direction: column; }
.mv-list.scroll {
  max-height: 560px;              /* ≈10 行 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.mv-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 11px 2px;
  border-top: 1px solid #f3f1eb;
  min-width: 0;
}
.mv-row:first-child { border-top: none; }
.mv-main { flex: 1; min-width: 180px; }
.mv-title {
  font-size: 13.5px;
  color: var(--ink);
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.mv-meta {
  display: flex;
  align-items: center;
  gap: 4px 10px;
  flex-wrap: wrap;
  margin-top: 3px;
  font-size: 12px;
  color: var(--sub);
}
.mv-kv { white-space: nowrap; }
.mv-time { color: #a8adb8; }
.mv-score { color: var(--blue); font-weight: 700; }
.mv-acts { display: flex; gap: 8px; flex-shrink: 0; }

.mv-empty { padding: 26px 0; text-align: center; }
.mv-empty-t { font-size: 13.5px; color: var(--ink); }
.mv-empty-d { font-size: 12px; color: var(--sub); margin-top: 4px; }

@media (max-width: 520px) {
  .mv-title { font-size: 13px; }
  .mv-meta { font-size: 12px; }
  .mv-acts { width: 100%; justify-content: flex-end; }
  .mv-list.scroll { max-height: 66vh; }
}
</style>
