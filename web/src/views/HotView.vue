<script setup>
/**
 * 热辩榜（等价旧 hot.js，纯展示 + 一个「开辩」入口）。
 *
 * 迁移期：「开辩」原本调旧页的 openSeatPanel(topicId)（在 solo.js，批 2 才迁），
 * 这里先回落旧页单人辩论视图；**没有带 topicId**（旧页 boot 只认 ?v=），
 * 记进遗留问题，批 2 迁单人页时改成直接带题进去。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { baseApi } from '../api.js';

const router = useRouter();

const hot = ref(null);
const error = ref('');

const list = computed(() => (hot.value && hot.value.list) || []);
const maxScore = computed(() => (list.value.length ? list.value[0].score : 1));
const key = computed(() => (hot.value && hot.value.key) || 'hot:debate:today');
const cardCount = computed(() => (hot.value && hot.value.card) || 0);

function pct(score) {
  return Math.round((score / (maxScore.value || 1)) * 100);
}

async function load() {
  try {
    hot.value = await baseApi.hot(12);
  } catch (e) {
    error.value = (e && e.message) || '加载失败';
  }
}

onMounted(load);

/** 开辩：进新版单人页并带上这道题（批 2 之后不再回落旧页） */
function openDebate(topicId) {
  router.push({ name: 'solo', query: topicId ? { topic: topicId } : {} });
}
</script>

<template>
  <h1 class="pg">热辩榜</h1>
  <p class="sub">按热度实时排序：开辩、发言、打完都会加分，热度随时间衰减，避免旧题一直霸榜。</p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <div v-else class="grid g2">
    <div class="card hot-table-card">
      <table class="t">
        <thead>
          <tr>
            <th style="width: 44px">排名</th>
            <th>辩题</th>
            <th style="width: 110px">热度</th>
            <th style="width: 64px">分数</th>
            <th style="width: 56px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in list" :key="x.topicId">
            <td><b :style="{ color: x.rank <= 3 ? '#B7791F' : '#6B7280' }">{{ x.rank }}</b></td>
            <td>
              <div style="font-size: 13px">{{ x.title }}</div>
              <div style="font-size: 11px; color: #8a909c">
                {{ x.source === 'custom' ? '自定义' : '官方' }} · {{ x.topicId }}
              </div>
            </td>
            <td><div class="heatbar"><i :style="{ width: pct(x.score) + '%' }"></i></div></td>
            <td class="mono" style="color: #2f5bea; font-weight: 600">{{ x.score }}</td>
            <td><button class="btn sm ghost" @click="openDebate(x.topicId)">开辩</button></td>
          </tr>
          <tr v-if="!list.length"><td colspan="5" class="empty">暂无数据</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端（≤640px）：卡片列表。表格在 390 宽下会被挤成一根竖线，必须换掉 -->
    <ul class="hot-cards">
      <li v-for="x in list" :key="'c' + x.topicId" class="hc">
        <div class="hc-top">
          <span class="hc-rank" :class="{ top: x.rank <= 3 }">{{ x.rank }}</span>
          <div class="hc-tt">{{ x.title }}</div>
        </div>
        <div class="hc-meta">
          <span>{{ x.source === 'custom' ? '自定义' : '官方' }}</span>
          <span class="hc-score">{{ x.score }} 分</span>
        </div>
        <div class="heatbar"><i :style="{ width: pct(x.score) + '%' }"></i></div>
        <button class="btn primary hc-go" @click="openDebate(x.topicId)">开辩</button>
      </li>
      <li v-if="!list.length" class="empty">暂无数据</li>
    </ul>
  </div>
</template>

<style scoped>
/* 桌面：表格；手机（≤640）：卡片列表（二选一，互斥显示） */
.hot-cards { display: none; list-style: none; margin: 0; padding: 0; }

.hc {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px 13px;
  margin-bottom: 10px;
  box-shadow: 0 1px 2px rgba(26, 29, 36, 0.05);
}
.hc-top { display: flex; align-items: flex-start; gap: 8px; }
.hc-rank {
  flex: 0 0 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--blue-w);
  color: var(--sub);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hc-rank.top { background: var(--org-w); color: var(--org); }
.hc-tt {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.hc-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 0 4px;
  font-size: 12px;
  color: var(--sub);
}
.hc-score { color: var(--blue); font-weight: 600; font-family: ui-monospace, Menlo, Consolas, monospace; }
.hc-go { width: auto; min-width: 96px; margin: 10px 0 0 auto; min-height: 40px; display: block; padding: 0 18px; font-size: 13px; }

@media (max-width: 640px) {
  .hot-table-card { display: none; }
  .hot-cards { display: block; }
}
</style>
