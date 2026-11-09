<script setup>
/** 能力诊断（等价旧 diag.js）：五维雷达 + 变化箭头 + 连续性 + 漏洞统计。 */
import { ref, computed, onMounted } from 'vue';
import { baseApi } from '../api.js';
import RadarChart from '../components/RadarChart.vue';

const diag = ref(null);
const error = ref('');

const dims = computed(() => (diag.value && diag.value.dims) || {});
const delta = computed(() => (diag.value && diag.value.delta) || {});
const flaws = computed(() => (diag.value && diag.value.flaws) || {});
const streak = computed(() => (diag.value && diag.value.streak) || 0);
const samples = computed(() => (diag.value && diag.value.samples) || 0);

const dimList = computed(() => Object.entries(dims.value).map(([k, v]) => ({ k, v, d: Number(delta.value[k]) || 0 })));
const flawList = computed(() => Object.entries(flaws.value));

onMounted(async () => {
  try {
    diag.value = await baseApi.diag();
  } catch (e) {
    error.value = (e && e.message) || '加载失败';
  }
});
</script>

<template>
  <h1 class="pg">能力诊断</h1>
  <p class="sub">滑动平均（最近 {{ samples }} 场）· 只和你自己比，没有段位也没有排名。</p>

  <div v-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <div v-else class="grid g2">
    <div class="card">
      <b style="font-size: 13px">五维画像</b>
      <div class="row" style="align-items: center; margin-top: 6px">
        <div style="flex: 1; min-width: 240px"><RadarChart :dims="dims" /></div>
        <div style="flex: 1; min-width: 200px">
          <template v-if="dimList.length">
            <div v-for="d in dimList" :key="d.k" class="dim">
              <span class="lb">{{ d.k }}</span>
              <div class="dbar"><i :style="{ width: d.v + '%' }"></i></div>
              <b>{{ d.v }}</b>
              <span v-if="d.d > 0" style="color: #0e9f6e; font-size: 11.5px">↑{{ d.d }}</span>
              <span v-else-if="d.d < 0" style="color: #c0392b; font-size: 11.5px">↓{{ -d.d }}</span>
              <span v-else style="color: #a8adb8; font-size: 11.5px">—</span>
            </div>
          </template>
          <div v-else class="empty">还没有数据，打一场就有了</div>
        </div>
      </div>
      <div style="font-size: 11.5px; color: #8a909c; margin-top: 8px">
        箭头 = 本场 vs 累计均值。样本少于 3 场时曲线波动大，别急着下结论。
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
