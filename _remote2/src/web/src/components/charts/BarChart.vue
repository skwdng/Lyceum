<script setup>
/**
 * 柱状图（手写 SVG，零依赖）。
 *
 * 同一套受控 props：`series / points / height / color / y-format / empty`。
 * 单序列直接传 `points`；多序列传 `series`（同组并排，用于「PV vs UV」这类对比）。
 *
 * 交互与 LineChart 一致：hover 高亮整列 + tooltip、click 抛 `bar-click`、
 * 空数据只给占位文案、动画用 CSS 从底部 scaleY(0)→1 长出来。
 */
import { computed, ref } from 'vue';
import { PALETTE, compact, emptyTextOf, niceScale, toSeries, useWidth } from './chartUtils.js';

const props = defineProps({
  series: { type: Array, default: () => [] },
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 240 },
  color: { type: String, default: '' },
  yFormat: { type: Function, default: null },
  empty: { type: [String, Boolean], default: '' },
  showLegend: { type: Boolean, default: true }
});
const emit = defineEmits(['bar-click']);

const host = ref(null);
const width = useWidth(host, 720);

const M = { top: 18, right: 16, bottom: 34, left: 48 };

const list = computed(() => toSeries(props).map((s) => ({
  ...s,
  points: s.points.map((p) => ({ x: p.x, y: Number(p.y) || 0 }))
})));
const hasData = computed(() => list.value.some((s) => s.points.length > 0));
const emptyText = computed(() => emptyTextOf(props.empty));

const labels = computed(() => {
  const longest = list.value.reduce((a, b) => (b.points.length > a.length ? b.points : a), []);
  return longest.map((p) => String(p.x));
});

const innerW = computed(() => Math.max(60, width.value - M.left - M.right));
const innerH = computed(() => Math.max(40, props.height - M.top - M.bottom));
const scale = computed(() => niceScale(Math.max(0, ...list.value.flatMap((s) => s.points.map((p) => p.y)))));
const maxY = computed(() => scale.value.max);

const band = computed(() => (labels.value.length ? innerW.value / labels.value.length : innerW.value));
const groupW = computed(() => Math.max(6, band.value * 0.62));
const barW = computed(() => Math.max(3, groupW.value / Math.max(1, list.value.length)));

const yAt = (v) => M.top + innerH.value - (innerH.value * v) / maxY.value;
const baseY = computed(() => M.top + innerH.value);

const yTicks = computed(() => {
  const { step, count } = scale.value;
  const out = [];
  for (let i = 0; i <= count; i++) {
    const v = i * step;
    out.push({ v, y: yAt(v), text: props.yFormat ? props.yFormat(v) : compact(v) });
  }
  return out;
});

/** 柱子几何：每列里并列 series 根柱子 */
const bars = computed(() => {
  const out = [];
  list.value.forEach((s, si) => {
    s.points.forEach((p, i) => {
      const groupLeft = M.left + band.value * i + (band.value - groupW.value) / 2;
      const x = groupLeft + barW.value * si;
      const y = yAt(p.y);
      out.push({
        key: si + '-' + i,
        x,
        y,
        w: barW.value,
        h: Math.max(0, baseY.value - y),
        color: s.color || PALETTE[si % PALETTE.length],
        value: p.y,
        index: i,
        seriesIndex: si,
        seriesName: s.name
      });
    });
  });
  return out;
});

/** x 标签：太密就隔几个显示，并且截断长文案 */
const xTicks = computed(() => {
  const n = labels.value.length;
  if (!n) return [];
  const step = Math.max(1, Math.ceil(n / 12));
  const out = [];
  for (let i = 0; i < n; i += step) {
    const t = labels.value[i];
    out.push({ i, x: M.left + band.value * i + band.value / 2, text: t.length > 5 ? t.slice(0, 4) + '…' : t });
  }
  return out;
});

// ---------- hover ----------
const hover = ref(-1);

function onMove(index) {
  hover.value = index;
}

function onLeave() {
  hover.value = -1;
}

const tip = computed(() => {
  if (hover.value < 0) return null;
  const i = hover.value;
  const rows = list.value.map((s, si) => ({
    name: s.name,
    color: s.color || PALETTE[si % PALETTE.length],
    value: s.points[i] ? s.points[i].y : 0
  }));
  const center = M.left + band.value * i + band.value / 2;
  const left = Math.max(78, Math.min(width.value - 78, center));
  return { label: labels.value[i], rows, left };
});

function onClick(i) {
  emit('bar-click', {
    index: i,
    x: labels.value[i],
    values: list.value.map((s) => (s.points[i] ? s.points[i].y : 0))
  });
}
</script>

<template>
  <div ref="host" class="ch-bar">
    <div v-if="showLegend && hasData && list.length > 1" class="ch-legend">
      <span v-for="(s, i) in list" :key="i" class="ch-legend-item">
        <i :style="{ background: s.color || PALETTE[i % PALETTE.length] }"></i>{{ s.name }}
      </span>
    </div>

    <div v-if="!hasData" class="ch-empty" :style="{ height: height + 'px' }">{{ emptyText }}</div>

    <svg v-else class="ch-svg" :width="width" :height="height" role="img" aria-label="柱状图" @mouseleave="onLeave">
      <g class="ch-grid">
        <line v-for="t in yTicks" :key="'g' + t.v" :x1="M.left" :x2="M.left + innerW" :y1="t.y" :y2="t.y" />
      </g>
      <g class="ch-axis-text">
        <text v-for="t in yTicks" :key="'y' + t.v" :x="M.left - 8" :y="t.y + 4" text-anchor="end">{{ t.text }}</text>
        <text v-for="t in xTicks" :key="'x' + t.i" :x="t.x" :y="height - 10" text-anchor="middle">{{ t.text }}</text>
      </g>

      <!-- hover 高亮整列（放在柱子下面，先画） -->
      <rect
        v-if="hover >= 0"
        class="ch-band"
        :x="M.left + band * hover"
        :y="M.top"
        :width="band"
        :height="innerH"
        rx="4"
      />

      <g>
        <rect
          v-for="b in bars"
          :key="b.key"
          class="ch-bar-rect"
          :class="{ on: hover === b.index }"
          :x="b.x"
          :y="b.y"
          :width="b.w"
          :height="b.h"
          :fill="b.color"
          rx="2"
          @mousemove.stop="onMove(b.index)"
          @click.stop="onClick(b.index)"
        />
      </g>
    </svg>

    <div v-if="tip" class="ch-tip" :style="{ left: tip.left + 'px', top: '6px' }">
      <div class="ch-tip-x">{{ tip.label }}</div>
      <div v-for="(r, i) in tip.rows" :key="i" class="ch-tip-row">
        <i :style="{ background: r.color }"></i>
        <span class="ch-tip-name">{{ r.name }}</span>
        <b>{{ yFormat ? yFormat(r.value) : r.value }}</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ch-bar { position: relative; width: 100%; }
.ch-svg { display: block; cursor: pointer; }
.ch-legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 0 0 6px 4px; font-size: 12px; color: #4E5969; }
.ch-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.ch-legend-item i, .ch-tip-row i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex-shrink: 0; }
.ch-grid line { stroke: #F2F3F5; stroke-width: 1; }
.ch-axis-text text { font-size: 11px; fill: #86909C; }
.ch-band { fill: #F2F3F5; opacity: 0.65; }
.ch-bar-rect {
  transform-box: fill-box;
  transform-origin: bottom;
  transform: scaleY(0);
  animation: ch-grow 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  transition: opacity 0.15s;
}
.ch-bar-rect.on { opacity: 1; }
.ch-bar-rect:not(.on) { opacity: 0.9; }
@keyframes ch-grow { to { transform: scaleY(1); } }
.ch-empty {
  display: flex; align-items: center; justify-content: center;
  color: #A8ADB8; font-size: 12.5px; background: #FAFBFC; border-radius: 8px;
}
.ch-tip {
  position: absolute; transform: translateX(-50%); pointer-events: none;
  background: rgba(29, 33, 41, 0.94); color: #fff; border-radius: 8px; padding: 8px 10px;
  font-size: 12px; line-height: 1.6; min-width: 96px; z-index: 5;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
}
.ch-tip-x { color: #C9CDD4; font-size: 11.5px; margin-bottom: 2px; }
.ch-tip-row { display: flex; align-items: center; gap: 6px; }
.ch-tip-name { color: #C9CDD4; }
.ch-tip-row b { margin-left: auto; font-weight: 600; }
</style>
