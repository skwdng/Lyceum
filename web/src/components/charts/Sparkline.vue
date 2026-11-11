<script setup>
/**
 * 迷你趋势线（手写 SVG，零依赖）—— 用在 KPI 卡片里，不画坐标轴、不显示刻度。
 *
 * 同一套受控 props：`series / points / height / color / y-format / empty`
 * （取第一条序列；`points` 形如 `[{ x: '11-04', y: 3 }]`）。
 *
 * 与另外三个组件的差别：这里**没有 hover 交互**（卡片太小、目标是"一眼看出涨跌"），
 * 但保留最后一点的圆点 + 整条线的描线动画，并且空数据时不占位画框。
 */
import { computed, ref } from 'vue';
import { PALETTE, emptyTextOf, toSeries, useWidth } from './chartUtils.js';

const props = defineProps({
  series: { type: Array, default: () => [] },
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 32 },
  color: { type: String, default: '' },
  yFormat: { type: Function, default: null },
  empty: { type: [String, Boolean], default: '' },
  /** 是否填充线下方（默认填一点点，卡片上更像"趋势"） */
  area: { type: Boolean, default: true }
});

const host = ref(null);
// 卡片里可能只有 180px 宽：最小宽度必须给小值，否则会把卡片撑破（实测溢出 51px）
const width = useWidth(host, 120, 40);

const line = computed(() => toSeries(props)[0] || null);
const pts = computed(() => (line.value ? line.value.points.map((p) => ({ x: p.x, y: Number(p.y) || 0 })) : []));
const hasData = computed(() => pts.value.length > 0);
const emptyText = computed(() => emptyTextOf(props.empty, '—'));
const stroke = computed(() => (line.value && line.value.color) || props.color || PALETTE[0]);

const pad = 3;

/** y 轴自适应：全部相等时给一条居中的直线，不要除零 */
const geometry = computed(() => {
  const n = pts.value.length;
  const w = Math.max(20, width.value);
  const h = Math.max(12, props.height);
  const ys = pts.value.map((p) => p.y);
  const min = Math.min(...ys, 0);
  const max = Math.max(...ys, 1);
  const span = max - min || 1;
  const xAt = (i) => (n <= 1 ? w / 2 : pad + ((w - pad * 2) * i) / (n - 1));
  const yAt = (v) => h - pad - ((h - pad * 2) * (v - min)) / span;
  const points = pts.value.map((p, i) => ({ x: xAt(i), y: yAt(p.y), v: p.y }));
  const d = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const areaD = points.length
    ? d + ` L${points[points.length - 1].x.toFixed(1)},${h - pad} L${points[0].x.toFixed(1)},${h - pad} Z`
    : '';
  return { w, h, d, areaD, points, last: points[points.length - 1] };
});

/** 最后一点比前一点涨了还是跌了（决定圆点颜色，卡片上一眼可辨） */
const trendUp = computed(() => {
  const p = geometry.value.points;
  if (p.length < 2) return true;
  return p[p.length - 1].v >= p[p.length - 2].v;
});
</script>

<template>
  <div ref="host" class="ch-spark">
    <span v-if="!hasData" class="ch-spark-empty">{{ emptyText }}</span>
    <svg
      v-else
      :width="geometry.w"
      :height="geometry.h"
      role="img"
      :aria-label="'趋势：' + pts.map((p) => p.y).join(' → ')"
    >
      <path v-if="area" :d="geometry.areaD" :fill="stroke" opacity="0.10" />
      <path class="ch-spark-path" :d="geometry.d" fill="none" :stroke="stroke" stroke-width="1.8"
            stroke-linejoin="round" stroke-linecap="round" />
      <circle
        v-if="geometry.last"
        :cx="geometry.last.x"
        :cy="geometry.last.y"
        r="2.6"
        :fill="trendUp ? '#00B42A' : '#F53F3F'"
        stroke="#fff"
        stroke-width="1"
      />
    </svg>
  </div>
</template>

<style scoped>
.ch-spark { width: 100%; line-height: 0; }
.ch-spark svg { display: block; }
.ch-spark-path { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: ch-spark-draw 0.8s ease-out forwards; }
@keyframes ch-spark-draw { to { stroke-dashoffset: 0; } }
.ch-spark-empty { font-size: 12.5px; color: #A8ADB8; line-height: 1; }
</style>
