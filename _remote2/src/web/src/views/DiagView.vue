<script setup>
/**
 * 能力分析（等价旧 diag.js：六维雷达 + 维度条 + 最近 N 场 + 空状态 + 动画）。
 *
 * 三个行为要点，都是照旧前端「行为」重写的，不是把 innerHTML 那套搬过来：
 * 1. **六维**：立论/论证/表达/应变/论据/协同。「协同」只在和真人队友配合时计分，
 *    没有真人队友时后端按中性 60 记（前端拿不到「这场有没有队友」，所以文案写成中性的）。
 * 2. **最近 N 场**：3 / 5 / 10 / 全部，切一次重拉一次 `GET /api/diag?n=`，只影响展示，
 *    不改库里的累计滑动平均；副标题跟着变成「最近 3 场的平均 / 全部 12 场的平均」。
 * 3. **空状态**：`empty: true`（一场都没打）时不画假雷达 —— 旧版后端会返回 60/58/62/52/45
 *    这种写死的占位值，看着像"已经分析过了"，会误导用户。
 *
 * 动画也是行为的一部分（旧版明确做了）：雷达从中心长出、条形图宽度 0→目标、数字滚动到目标。
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { baseApi } from '../api.js';
import { useAuthStore } from '../stores/auth.js';
import RadarChart from '../components/RadarChart.vue';
import { toast } from '../utils/toast.js';

const router = useRouter();
const auth = useAuthStore();

/** 统计窗口：3/5/10 场，0 = 全部 */
const WINDOWS = [
  { v: 3, label: '最近 3 场' },
  { v: 5, label: '最近 5 场' },
  { v: 10, label: '最近 10 场' }
];

const diag = ref(null);
const loading = ref(false);
const error = ref('');
const win = ref(0);

/** 条形图/数字动画的中间态：key → 当前显示值 */
const shown = ref({});
const barsOn = ref(false);
let rafId = 0;

const dims = computed(() => (diag.value && diag.value.dims) || {});
const delta = computed(() => (diag.value && diag.value.delta) || {});
const flaws = computed(() => (diag.value && diag.value.flaws) || {});
const streak = computed(() => (diag.value && diag.value.streak) || 0);
const samples = computed(() => (diag.value && diag.value.samples) || 0);
const total = computed(() => (diag.value && diag.value.total) || 0);
const curWindow = computed(() => (diag.value && diag.value.window) || 0);

/** 一场都没打：后端明确给 empty:true（或干脆没有维度） */
const isEmpty = computed(() => {
  if (!diag.value) return false;
  if (diag.value.empty === true) return true;
  return Object.keys(dims.value).length === 0;
});

const dimList = computed(() =>
  Object.entries(dims.value).map(([k, v]) => ({ k, v, d: Number(delta.value[k]) || 0 }))
);
const flawList = computed(() => Object.entries(flaws.value));

const subtitle = computed(() => {
  if (curWindow.value > 0) return `最近 ${curWindow.value} 场的平均 · 只和你自己比，没有段位也没有排名。`;
  return `全部 ${total.value || samples.value || 0} 场的平均 · 只和你自己比，没有段位也没有排名。`;
});

async function load(n) {
  loading.value = true;
  error.value = '';
  try {
    diag.value = await baseApi.diag(n);
    win.value = (diag.value && diag.value.window) || 0;
    animateAll();
  } catch (e) {
    error.value = (e && e.message) || '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 数字 0→目标（easeOutCubic 900ms）+ 条形宽度 0→目标（CSS 过渡，逐行 90ms 阶梯） */
function animateAll() {
  cancelAnimationFrame(rafId);
  const targets = {};
  Object.entries(dims.value).forEach(([k, v]) => {
    targets[k] = Math.max(0, Math.min(100, Number(v) || 0));
  });
  if (!Object.keys(targets).length) return;

  shown.value = Object.fromEntries(Object.keys(targets).map((k) => [k, 0]));
  barsOn.value = false;
  nextTick(() => {
    barsOn.value = true; // 下一帧再给宽度，过渡才生效
    const t0 = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = {};
      Object.entries(targets).forEach(([k, v]) => {
        next[k] = Math.round(v * eased);
      });
      shown.value = next;
      if (p < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });
}

function pickWindow(v) {
  if (win.value === v && diag.value) return;
  load(v);
}

function goSolo() {
  router.push({ name: 'solo' });
}

onMounted(() => {
  if (!auth.user) {
    router.push({ name: 'login', query: { next: '/diag' } });
    return;
  }
  load(0);
});

watch(() => auth.user && auth.user.id, (id) => {
  if (id) load(win.value);
});
</script>

<template>
  <h1 class="pg">能力分析</h1>
  <p class="sub">{{ subtitle }}</p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <!-- ==================== 空状态：一场都没打 ==================== -->
  <div v-else-if="isEmpty" class="card" style="text-align: center; padding: 44px 24px">
    <div style="font-size: 34px; margin-bottom: 8px">📊</div>
    <b style="font-size: 14px">还没有数据</b>
    <div style="font-size: 12.5px; color: #8a909c; margin: 8px 0 16px; line-height: 1.8">
      打满 1 场就能看到六维雷达；<br>打满 3 场后曲线才有参考价值。
    </div>
    <button class="btn primary" @click="goSolo">去打第一场</button>
  </div>

  <div v-else-if="loading && !diag" class="card" style="text-align: center; padding: 40px; color: #86909c">
    正在分析…
  </div>

  <!-- ==================== 正常态 ==================== -->
  <div v-else class="grid g2">
    <div class="card">
      <div class="row" style="justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap">
        <b style="font-size: 13px">{{ dimList.length || 6 }} 维画像</b>
        <div class="row" style="gap: 6px; flex-wrap: wrap">
          <button
            v-for="w in WINDOWS"
            :key="w.v"
            class="btn sm"
            :class="{ ghost: curWindow !== w.v }"
            @click="pickWindow(w.v)"
          >
            {{ w.label }}
          </button>
          <button class="btn sm" :class="{ ghost: curWindow !== 0 }" @click="pickWindow(0)">
            全部 {{ total || '' }}
          </button>
        </div>
      </div>

      <div class="row" style="align-items: center; margin-top: 6px">
        <div style="flex: 1; min-width: 250px">
          <RadarChart :dims="dims" />
        </div>
        <div style="flex: 1; min-width: 220px">
          <div v-for="(d, i) in dimList" :key="d.k" class="dim">
            <span class="lb">{{ d.k }}</span>
            <div class="dbar">
              <i
                class="dim-fill"
                :style="{
                  width: (barsOn ? d.v : 0) + '%',
                  transition: 'width .9s cubic-bezier(.22,.9,.3,1) ' + i * 90 + 'ms'
                }"
              ></i>
            </div>
            <b class="dim-num">{{ shown[d.k] == null ? 0 : shown[d.k] }}</b>
            <span v-if="d.d > 0" style="color: #0e9f6e; font-size: 11.5px">↑{{ d.d }}</span>
            <span v-else-if="d.d < 0" style="color: #c0392b; font-size: 11.5px">↓{{ -d.d }}</span>
            <span v-else style="color: #a8adb8; font-size: 11.5px">—</span>
          </div>
          <div v-if="!dimList.length" class="empty">还没有数据，打一场就有了</div>
        </div>
      </div>

      <div style="font-size: 11.5px; color: #8a909c; margin-top: 8px; line-height: 1.7">
        箭头 = 本场 vs 当前窗口均值。样本少于 3 场时曲线波动大，别急着下结论。<br>
        协同维度只在和真人队友配合时计分；没有真人队友时按中性 60 记。
      </div>
    </div>

    <div>
      <div class="card">
        <div class="row" style="justify-content: space-between">
          <b style="font-size: 13px">练习连续性</b>
          <span class="tag g">连续 {{ streak }} 天</span>
        </div>
        <div style="font-size: 12px; color: #8a909c; margin-top: 8px">中断即归零，不和别人比。</div>
      </div>

      <div class="card" style="margin-top: 12px">
        <b style="font-size: 13px">漏洞统计（错题本）</b>
        <div style="font-size: 11.5px; color: #8a909c; margin: 4px 0 6px">命中即记一次，不是写死的示例数据。</div>
        <table class="t" style="margin-top: 6px">
          <tbody>
            <tr v-for="[k, v] in flawList" :key="k">
              <td>{{ k }}</td>
              <td class="mono" style="text-align: right">{{ v }} 次</td>
            </tr>
            <tr v-if="!flawList.length"><td class="empty">暂无</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
