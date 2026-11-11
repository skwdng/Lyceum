<script setup>
/**
 * 概览（P4：接真实报表数据）。
 *
 * 数据来源：`/api/admin/analytics/overview` + `/trend` + `/modules` + `/breakdown`。
 * 后端已经补零/排序/算好占比，这里只做「格式化 + 塞进图表」（柱子/折线/环形的 points 同形）。
 *
 * 三个刻意的选择：
 * · KPI 卡的数字跟着上方的 7/30 天切换；**图表固定看 30 天** —— 7 天的折线点太少，
 *   看不出趋势（而且切来切去会让"这张图到底代表哪段时间"变得含糊）；
 * · 收入按「分」存，这里换算成元显示（`¥12.34`），不把分直接摊给用户看；
 * · 环比为 null（上周期是 0）时显示「新增」，不显示 `∞%` 这种没意义的数。
 */
import { computed, onMounted, ref } from 'vue';
import { analyticsApi } from '../../api.js';
import BarChart from '../../components/charts/BarChart.vue';
import DonutChart from '../../components/charts/DonutChart.vue';
import LineChart from '../../components/charts/LineChart.vue';
import Sparkline from '../../components/charts/Sparkline.vue';
import { toast } from '../../utils/toast.js';
import { errText } from './helpers.js';

const RANGES = [['7d', '近 7 天'], ['30d', '近 30 天']];
const CHART_RANGE = '30d';

const range = ref('7d');
const loading = ref(true);

const overview = ref(null);
const modules = ref(null);
const tiers = ref(null);
const matchesTrend = ref([]);
const postsTrend = ref([]);
const activeTrend = ref([]);

/** 模块英文 key -> 中文（图表和表格都用这一份，避免两处写法不一致） */
const MODULE_LABELS = {
  community: '社区', chat: '聊天', match: '多人辩论', solo: '单人辩论', video: '视频',
  hot: '热辩榜', diag: '能力分析', records: '辩论记录', wallet: '钱包', friends: '好友', admin: '管理台'
};
const moduleName = (k) => MODULE_LABELS[k] || k;

function datesOf(token) {
  const n = Number(String(token).replace('d', '')) || 7;
  const to = new Date();
  const from = new Date(to.getTime() - (n - 1) * 86400000);
  const f = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { from: f(from), to: f(to) };
}

/** 后端 points -> 图表组件的 points（形状本来就一样，这里只是兜底空值） */
const toPoints = (res) => (res && res.points ? res.points : []);

async function load() {
  loading.value = true;
  const { from, to } = datesOf(range.value);
  try {
    // 概览跟随切换；图表固定 30 天（只拉一次）
    const [o] = await Promise.all([analyticsApi.overview(from, to)]);
    overview.value = o;

    if (!modules.value) {
      const [mod, tier, mt, pt, at] = await Promise.all([
        analyticsApi.modules(CHART_RANGE),
        analyticsApi.breakdown('tier', CHART_RANGE),
        analyticsApi.trend('matches', CHART_RANGE),
        analyticsApi.trend('posts', CHART_RANGE),
        analyticsApi.trend('active', CHART_RANGE)
      ]);
      modules.value = mod;
      tiers.value = tier;
      matchesTrend.value = toPoints(mt);
      postsTrend.value = toPoints(pt);
      activeTrend.value = toPoints(at);
    }
  } catch (e) {
    toast(errText(e));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/**
 * 手动刷新：图表数据是一次性拉取的（切 7/30 天不重拉），所以刷新时要把它们清掉再拉，
 * 否则点"刷新"只会更新 KPI 卡，下面的折线/柱状还是旧值。
 */
function reload() {
  modules.value = null;
  tiers.value = null;
  matchesTrend.value = [];
  postsTrend.value = [];
  activeTrend.value = [];
  load();
}

// ---------- KPI 卡 ----------
const KPI_SERIES = {
  matches: () => matchesTrend.value,
  posts: () => postsTrend.value,
  avgDau: () => activeTrend.value
};

function sparkOf(key) {
  const pick = KPI_SERIES[key];
  return pick ? pick() : [];
}

/** 收入按分存，显示成分转元 */
function formatValue(item) {
  if (item.unit === '分') return '¥' + (Number(item.value || 0) / 100).toFixed(2);
  return Number(item.value || 0).toLocaleString('zh-CN');
}

/** 环比：null -> 「新增」（上期为 0）；0 -> 「持平」 */
function deltaText(item) {
  if (item.deltaPct === null || item.deltaPct === undefined) {
    return item.prev === 0 && item.value > 0 ? '新增' : '';
  }
  if (item.deltaPct === 0) return '持平';
  return (item.deltaPct > 0 ? '↑ ' : '↓ ') + Math.abs(item.deltaPct) + '%';
}

const deltaClass = (item) => {
  if (item.deltaPct === null || item.deltaPct === undefined) return 'up';
  return item.deltaPct >= 0 ? 'up' : 'down';
};

// ---------- 图表数据 ----------
const moduleBars = computed(() => (modules.value ? modules.value.modules.map((m) => ({ x: moduleName(m.module), y: m.pv })) : []));
const tierDonut = computed(() => (tiers.value ? tiers.value.points : []));
const trendSeries = computed(() => [
  { name: '对局', color: '#165DFF', points: matchesTrend.value },
  { name: '发帖', color: '#00B42A', points: postsTrend.value }
]);
</script>

<template>
  <div data-panel="dashboard">
    <!-- 范围切换 -->
    <div class="adm-toolbar">
      <div class="adm-chips">
        <button
          v-for="r in RANGES"
          :key="r[0]"
          class="adm-chip"
          :class="{ on: range === r[0] }"
          @click="range = r[0]; load()"
        >
          {{ r[1] }}
        </button>
      </div>
      <span v-if="overview" class="muted" style="font-size: 12.5px">
        {{ overview.from }} ~ {{ overview.to }} · 对比 {{ overview.prevFrom }} ~ {{ overview.prevTo }}
      </span>
      <button class="btn sm" :disabled="loading" @click="reload()">刷新</button>
    </div>

    <div v-if="loading" class="muted" style="padding: 24px">加载中…</div>

    <template v-else-if="overview">
      <!-- KPI 卡 -->
      <div class="adm-kpis">
        <div v-for="item in overview.items" :key="item.key" class="adm-kpi">
          <div class="k">{{ item.label }}</div>
          <div class="v">
            {{ formatValue(item) }}
            <small v-if="item.unit && item.unit !== '分'">{{ item.unit }}</small>
          </div>
          <div class="d" :class="deltaClass(item)">
            <span v-if="deltaText(item)">{{ deltaText(item) }}</span>
            <span v-else class="muted">—</span>
            <span class="muted" style="margin-left: 6px">上期 {{ item.prev }}</span>
          </div>
          <Sparkline v-if="sparkOf(item.key).length" :points="sparkOf(item.key)" :height="30" />
        </div>
      </div>

      <!-- 趋势 + 档位 -->
      <div class="adm-grid" style="grid-template-columns: 1.6fr 1fr">
        <div class="panel">
          <h2>近 30 天趋势<span class="spacer"></span><span class="muted" style="font-weight: 400">{{ CHART_RANGE }}</span></h2>
          <div class="body">
            <LineChart :series="trendSeries" :height="230" />
          </div>
        </div>
        <div class="panel">
          <h2>档位分布</h2>
          <div class="body">
            <DonutChart :points="tierDonut" :height="210" center-label="对局" />
          </div>
        </div>
      </div>

      <!-- 模块排行 -->
      <div class="panel" style="margin-top: 14px">
        <h2>模块浏览排行（30 天 PV）</h2>
        <div class="body">
          <BarChart :points="moduleBars" :height="200" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.adm-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.adm-chips { display: flex; gap: 6px; }
.adm-chip { border: 1px solid #E5E6EB; background: #fff; color: #4E5969; border-radius: 8px; padding: 5px 12px; font-size: 12.5px; cursor: pointer; }
.adm-chip:hover { background: #F7F8FA; }
.adm-chip.on { background: #E8F3FF; border-color: #165DFF; color: #165DFF; font-weight: 600; }

.adm-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 14px; margin-bottom: 14px; }
.adm-kpi { background: #fff; border: 1px solid #EFF0F1; border-radius: 12px; padding: 14px 16px 10px; }
.adm-kpi .k { font-size: 12.5px; color: #86909C; }
.adm-kpi .v { font-size: 24px; font-weight: 700; margin-top: 2px; }
.adm-kpi .v small { font-size: 12px; font-weight: 500; color: #86909C; margin-left: 2px; }
.adm-kpi .d { font-size: 11.5px; margin: 4px 0 2px; }
.adm-kpi .d.up { color: #00B42A; }
.adm-kpi .d.down { color: #F53F3F; }

.adm-grid { display: grid; gap: 14px; }
@media (max-width: 900px) {
  .adm-grid { grid-template-columns: 1fr !important; }
}
</style>
