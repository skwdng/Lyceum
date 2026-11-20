<script setup>
/**
 * 环形图（手写 SVG，零依赖）。
 *
 * 同一套受控 props：`series / points / height / color / y-format / empty`
 * （取第一条序列；`points` 里每项可自带 `color` 覆盖调色板）。
 *
 * 画法：不用 path 画扇形，而是给圆 stroke 设 `stroke-dasharray` ——
 * 一个圆就是一条定长（2πr）的线，把每段「露出一截、其余留空」再各自滚动偏移，
 * 天然得到扇形，而且可以在 dasharray 上直接做 CSS 过渡（就是设计文档要的
 * stroke-dashoffset 动画）。hover 时把该段 stroke-width 加粗，中心显示它自己的数字。
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { PALETTE, emptyTextOf } from './chartUtils.js';

const props = defineProps({
  series: { type: Array, default: () => [] },
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 220 },
  color: { type: String, default: '' },
  yFormat: { type: Function, default: null },
  empty: { type: [String, Boolean], default: '' },
  showLegend: { type: Boolean, default: true },
  centerLabel: { type: String, default: '合计' }
});
const emit = defineEmits(['slice-click']);

const list = computed(() => {
  const src = Array.isArray(props.series) && props.series.length
    ? props.series[0].points || []
    : props.points || [];
  return src.map((p, i) => ({
    label: String(p.x),
    value: Math.max(0, Number(p.y) || 0),
    color: p.color || PALETTE[i % PALETTE.length]
  }));
});

const hasData = computed(() => list.value.some((s) => s.value > 0));
const emptyText = computed(() => emptyTextOf(props.empty));

const total = computed(() => list.value.reduce((a, b) => a + b.value, 0));

/** 圆环半径按容器高度算：外圈留 10px 描边空间 */
const box = computed(() => Math.max(120, props.height));
const R = computed(() => box.value / 2 - 16);
const C = computed(() => 2 * Math.PI * R.value);
const cx = computed(() => box.value / 2);
const cy = computed(() => box.value / 2);

const slices = computed(() => {
  let acc = 0;
  return list.value.map((s) => {
    const frac = total.value ? s.value / total.value : 0;
    const len = C.value * frac;
    const seg = { ...s, frac, len, rest: C.value - len, offset: -acc, percent: frac * 100 };
    acc += len;
    return seg;
  });
});

/** 挂载后再打开 dasharray，CSS 过渡才有起点（0 → 实际长度） */
const grown = ref(false);
onMounted(() => nextTick(() => { grown.value = true; }));

const hover = ref(-1);

function onEnter(i) { hover.value = i; }
function onLeave() { hover.value = -1; }
function onClick(i) {
  const s = slices.value[i];
  emit('slice-click', { label: s.label, value: s.value, percent: s.percent });
}

/** 中心文案：hover 哪段就显示哪段，否则显示合计 */
const center = computed(() => {
  if (hover.value >= 0 && slices.value[hover.value]) {
    const s = slices.value[hover.value];
    return { label: s.label, value: props.yFormat ? props.yFormat(s.value) : s.value, sub: s.percent.toFixed(1) + '%' };
  }
  return {
    label: props.centerLabel,
    value: props.yFormat ? props.yFormat(total.value) : total.value,
    sub: '100%'
  };
});
</script>

<template>
  <div class="ch-donut" :style="{ minHeight: height + 'px' }">
    <div v-if="!hasData" class="ch-empty" :style="{ height: height + 'px' }">{{ emptyText }}</div>

    <template v-else>
      <div class="ch-donut-ring" :style="{ width: box + 'px', height: box + 'px' }">
        <svg :width="box" :height="box" role="img" aria-label="环形图">
          <g :transform="`rotate(-90 ${cx} ${cy})`">
            <!-- 底环：没有数据段时也能看出形状 -->
            <circle :cx="cx" :cy="cy" :r="R" fill="none" stroke="#F2F3F5" :stroke-width="16" />
            <circle
              v-for="(s, i) in slices"
              :key="s.label + i"
              class="ch-slice"
              :class="{ on: hover === i, dim: hover >= 0 && hover !== i }"
              :cx="cx"
              :cy="cy"
              :r="R"
              fill="none"
              :stroke="s.color"
              :stroke-width="hover === i ? 21 : 16"
              :stroke-dasharray="grown ? `${s.len} ${s.rest}` : `0 ${C}`"
              :stroke-dashoffset="s.offset"
              stroke-linecap="butt"
              @mouseenter="onEnter(i)"
              @mouseleave="onLeave"
              @click="onClick(i)"
            />
          </g>
        </svg>
        <div class="ch-donut-center">
          <div class="ch-donut-value">{{ center.value }}</div>
          <div class="ch-donut-label">{{ center.label }}</div>
          <div class="ch-donut-sub">{{ center.sub }}</div>
        </div>
      </div>

      <ul v-if="showLegend" class="ch-donut-legend">
        <li
          v-for="(s, i) in slices"
          :key="'l' + i"
          :class="{ on: hover === i }"
          @mouseenter="onEnter(i)"
          @mouseleave="onLeave"
          @click="onClick(i)"
        >
          <i :style="{ background: s.color }"></i>
          <span class="ch-donut-name">{{ s.label }}</span>
          <b>{{ yFormat ? yFormat(s.value) : s.value }}</b>
          <span class="ch-donut-pct">{{ s.percent.toFixed(1) }}%</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.ch-donut { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.ch-donut-ring { position: relative; flex-shrink: 0; }
.ch-slice { cursor: pointer; transition: stroke-dasharray 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), stroke-width 0.15s, opacity 0.15s; }
.ch-slice.dim { opacity: 0.45; }
.ch-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.ch-donut-value { font-size: 22px; font-weight: 700; color: #1D2129; line-height: 1.2; }
.ch-donut-label { font-size: 12px; color: #4E5969; margin-top: 2px; }
.ch-donut-sub { font-size: 11px; color: #A8ADB8; margin-top: 1px; }
.ch-donut-legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 180px; }
.ch-donut-legend li {
  display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #4E5969;
  padding: 5px 8px; border-radius: 7px; cursor: pointer;
}
.ch-donut-legend li.on { background: #F7F8FA; }
.ch-donut-legend i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.ch-donut-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch-donut-pct { color: #A8ADB8; width: 48px; text-align: right; }
.ch-empty {
  display: flex; align-items: center; justify-content: center; width: 100%;
  color: #A8ADB8; font-size: 12.5px; background: #FAFBFC; border-radius: 8px;
}
</style>
