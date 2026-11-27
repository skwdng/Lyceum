<script setup>
/**
 * 未完成的对局（独立板块）。
 *
 * 数据：`GET /api/matches/mine`（后端已按 last_active_at 倒序、最多 20 条）。
 * 字段：{ matchId, topicTitle, mode, kind, step(1-based), stepIndex, totalSteps,
 *        mySeats, roomCode, updatedAt(epoch ms), status }
 *
 * 这里只做三件事：继续（房间局先转单人局）、删除、空态引导。
 * 单人页里的「进行中的对局」是同一份数据的精简版，标题旁的「查看全部 →」跳到这里。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { debateApi } from '../api.js';
import { useDebateStore } from '../stores/debate.js';
import { toast } from '../utils/toast.js';

const router = useRouter();
const debate = useDebateStore();

const list = ref([]);
const loading = ref(false);
const busyId = ref('');
/** 接口失败只在第一次提示，别在轮询/重进时反复弹 */
const loadErr = ref('');

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

onMounted(load);
</script>

<template>
  <h1 class="pg">未完成的对局</h1>
  <p class="sub">默认保留最近 20 场，按最后活跃排序</p>

  <div class="card">
    <div class="row" style="justify-content: space-between; align-items: baseline">
      <b style="font-size: 13px">共 {{ count }} 场</b>
      <button class="btn sm ghost" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
    </div>

    <div v-if="loadErr" class="empty" style="padding: 16px 0">
      列表加载失败（{{ loadErr }}）<br>
      <button class="btn sm ghost" style="margin-top: 8px" @click="load">重试</button>
    </div>

    <!-- 空态：还没开过 / 全打完了 -->
    <div v-else-if="!loading && !count" class="mv-empty">
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
  </div>
</template>

<style scoped>
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
