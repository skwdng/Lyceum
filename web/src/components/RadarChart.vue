<script setup>
/**
 * 五维雷达图：把旧 diag.js 的 radar() 算法照搬成组件（坐标计算一字未改，只搬了位置）。
 *
 * <p>为什么手写 SVG 不引图表库：只有一张图、固定五个维度，
 * 引 echarts 之类会让包体从 300KB 涨到 1MB，不划算。
 */
import { computed } from 'vue';

const props = defineProps({
  dims: { type: Object, default: () => ({}) }
});

const R = 84;
const CX = 120;
const CY = 120;

const keys = computed(() => Object.keys(props.dims || {}));

function pt(i, f) {
  const n = keys.value.length || 1;
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const r = R * f;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

const outer = computed(() => keys.value.map((_, i) => pt(i, 1)));

const rings = computed(() =>
  [0.25, 0.5, 0.75, 1].map((f) =>
    outer.value.map(([x, y]) => [CX + (x - CX) * f, CY + (y - CY) * f].join(',')).join(' ')
  )
);

const shape = computed(() =>
  keys.value.map((k, i) => pt(i, (Number(props.dims[k]) || 0) / 100).join(',')).join(' ')
);

const labels = computed(() =>
  keys.value.map((k, i) => {
    const [x, y] = pt(i, 1.18);
    return { k, x, y };
  })
);
</script>

<template>
  <svg viewBox="0 0 240 240" style="width: 100%; max-width: 320px">
    <polygon v-for="(r, i) in rings" :key="i" :points="r" fill="none" stroke="#EDEAE3" />
    <line v-for="(o, i) in outer" :key="'l' + i" :x1="CX" :y1="CY" :x2="o[0]" :y2="o[1]" stroke="#EDEAE3" />
    <polygon :points="shape" fill="rgba(47,91,234,.18)" stroke="#2F5BEA" stroke-width="2" />
    <text
      v-for="l in labels"
      :key="l.k"
      :x="l.x"
      :y="l.y"
      font-size="10"
      fill="#6B7280"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {{ l.k }}
    </text>
  </svg>
</template>
