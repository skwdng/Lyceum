<script setup>
/**
 * 折线图（手写 SVG，零依赖）。
 *
 * 受控 props 与设计文档 §7.1 一致：`series / points / height / color / y-format / empty`。
 *
 * <pre>
 * &lt;LineChart :series="[{ name: '对局', color: '#165DFF', points: [{ x: '11-04', y: 3 }] }]"
 *            :height="220" :y-format="v => v + ' 场'" /&gt;
 * </pre>
 *
 * 四个交互（设计文档 §7.2）：
 * · hover → 竖向参考线 + 各序列圆点 + 绝对定位 tooltip（不引库）
 * · click → 抛 `point-click`（{ index, x, values }），P4 拿它做 drill-down
 * · 空数据 → 只显示占位文案，**不画空坐标系**
 * · 动画 → stroke-dasharray 描线（纯 CSS，挂载即播）
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
const emit = defineEmits(['point-click']);

const host = ref(null);
const width = useWidth(host, 720);

/** 四边留白：左边放 y 轴刻度，下边放 x 标签 */
const M = { top: 18, right: 18, bottom: 26, left: 48 };

const list = computed(() => toSeries(props).map((s) => ({
  ...s,
  points: s.points.map((p) => ({ x: p.x, y: Number(p.y) || 0 }))
})));
const hasData = computed(() => list.value.some((s) => s.points.length > 0));
const emptyText = computed(() => emptyTextOf(props.empty));

const labels = computed(() => {
  // 多序列共用 x 轴：取最长序列的标签（后端补零后长度一致）
  const longest = list.value.reduce((a, b) => (b.points.length > a.length ? b.points : a), []);
  return longest.map((p) => String(p.x));
});

const innerW = computed(() => Math.max(60, width.value - M.left - M.right));
const innerH = computed(() => Math.max(40, props.height - M.top - M.bottom));

const scale = computed(() => niceScale(Math.max(0, ...list.value.flatMap((s) => s.points.map((p) => p.y)))));
const maxY = computed(() => scale.value.max);

const xAt = (i) => {
  const n = labels.value.length;
  if (n <= 1) return M.left + innerW.value / 2;
  return M.left + (innerW.value * i) / (n - 1);
};
const yAt = (v) => M.top + innerH.value - (innerH.value * v) / maxY.value;

/** 刻度按 niceScale 的整数步长铺，不会出现 12.5 这种小数刻度 */
const yTicks = computed(() => {
  const { step, count } = scale.value;
  const out = [];
  for (let i = 0; i <= count; i++) {
    const v = i * step;
    out.push({ v, y: yAt(v), text: props.yFormat ? props.yFormat(v) : compact(v) });
  }
  return out;
});

/** x 标签最多 6 个，避免挤在一起 */
const xTicks = computed(() => {
  const n = labels.value.length;
  if (!n) return [];
  const step = Math.max(1, Math.ceil(n / 6));
  const out = [];
  for (let i = 0; i < n; i += step) out.push({ i, x: xAt(i), text: labels.value[i] });
  // 保证最后一个标签也在（否则「今天」看不到）
  const last = n - 1;
  if (out[out.length - 1]?.i !== last) out.push({ i: last, x: xAt(last), text: labels.value[last] });
  return out;
});

const paths = computed(() => list.value.map((s) => {
  const d = s.points.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(i) + ',' + yAt(p.y)).join(' ');
  return { ...s, d };
}));

// ---------- hover ----------
const hover = ref(-1);

function onMove(e) {
  if (!hasData.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const n = labels.value.length;
  if (n === 0) return;
  if (n === 1) { hover.value = 0; return; }
  const ratio = (px - M.left) / innerW.value;
  hover.value = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
}

const tip = computed(() => {
  if (hover.value < 0 || !labels.value.length) return null;
  const i = hover.value;
  const rows = list.value.map((s) => ({ name: s.name, color: s.color, value: s.points[i] ? s.points[i].y : 0 }));
  const x = xAt(i);
  // 粗略估宽 150px 做左右夹取，保证不超出容器
  const left = Math.max(78, Math.min(width.value - 78, x));
  return { x, i, label: labels.value[i], rows, left };
});

function onClick() {
  if (hover.value < 0) return;
  const i = hover.value;
  emit('point-click', {
    index: i,
    x: labels.value[i],
    values: list.value.map((s) => (s.points[i] ? s.points[i].y : 0))
  });
}
</script>

<template>
  <div ref="host" class="ch-line">
    <div v-if="showLegend && hasData && list.length > 1" class="ch-legend">
      <span v-for="(s, i) in list" :key="i" class="ch-legend-item">
        <i :style="{ background: s.color || PALETTE[i % PALETTE.length] }"></i>{{ s.name }}
      </span>
    </div>

    <div v-if="!hasData" class="ch-empty" :style="{ height: height + 'px' }">{{ emptyText }}</div>

    <svg
      v-else
      class="ch-svg"
      :width="width"
      :height="height"
      role="img"
      aria-label="折线图"
      @mousemove="onMove"
      @mouseleave="hover = -1"
      @click="onClick"
    >
      <!-- 网格 + y 刻度 -->
      <g class="ch-grid">
        <line v-for="t in yTicks" :key="'g' + t.v" :x1="M.left" :x2="M.left + innerW" :y1="t.y" :y2="t.y" />
      </g>
      <g class="ch-axis-text">
        <text v-for="t in yTicks" :key="'y' + t.v" :x="M.left - 8" :y="t.y + 4" text-anchor="end">{{ t.text }}</text>
        <text v-for="t in xTicks" :key="'x' + t.i" :x="t.x" :y="height - 8" text-anchor="middle">{{ t.text }}</text>
      </g>

      <!-- 线 -->
      <g v-for="(s, si) in paths" :key="'s' + si">
        <path
          class="ch-line-path"
          :d="s.d"
          :stroke="s.color || PALETTE[si % PALETTE.length]"
          fill="none"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>

      <!-- hover：参考线 + 圆点 -->
      <g v-if="hover >= 0">
        <line class="ch-guide" :x1="xAt(hover)" :x2="xAt(hover)" :y1="M.top" :y2="M.top + innerH" />
        <circle
          v-for="(s, si) in paths"
          :key="'d' + si"
          :cx="xAt(hover)"
          :cy="yAt(s.points[hover] ? s.points[hover].y : 0)"
          r="3.5"
          :fill="s.color || PALETTE[si % PALETTE.length]"
          stroke="#fff"
          stroke-width="1.5"
        />
      </g>
    </svg>

    <!-- tooltip：绝对定位，不引库 -->
    <div v-if="tip" class="ch-tip" :style="{ left: tip.left + 'px', top: '8px' }">
      <div class="ch-tip-x">{{ tip.label }}</div>
      <div v-for="(r, i) in tip.rows" :key="i" class="ch-tip-row">
        <i :style="{ background: r.color || PALETTE[i % PALETTE.length] }"></i>
        <span class="ch-tip-name">{{ r.name }}</span>
        <b>{{ yFormat ? yFormat(r.value) : r.value }}</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ch-line { position: relative; width: 100%; }
.ch-svg { display: block; cursor: crosshair; }
.ch-legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 0 0 6px 4px; font-size: 12px; color: #4E5969; }
.ch-legend-item { display: inline-flex; align-items: center; gap: 5px; }
.ch-legend-item i, .ch-tip-row i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex-shrink: 0; }
.ch-grid line { stroke: #F2F3F5; stroke-width: 1; }
.ch-axis-text text { font-size: 11px; fill: #86909C; }
.ch-guide { stroke: #C9CDD4; stroke-width: 1; stroke-dasharray: 3 3; }
.ch-line-path { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: ch-draw 0.9s ease-out forwards; }
@keyframes ch-draw { to { stroke-dashoffset: 0; } }
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
