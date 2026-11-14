<script setup>
/**
 * 能力雷达图（五维/六维通用，手写 SVG，不引图表库）。
 *
 * 坐标算法沿用旧 diag.js 的 radar()：4 圈底网 + n 条轴线 + 数据多边形 + 轴名与数值。
 * 批 5 新增：
 * · **从中心生长**——数据多边形与顶点圆点放在 <g> 里，挂载后两帧把 scale(.02) 过渡到 1；
 * · 每个顶点画圆点，轴名下方显示该维数值；
 * · dims 变化（切「最近 N 场」）时动画重放，靠 watch 重置再放大。
 *
 * 为什么手写不引图表库：只有一张图、维度固定，echarts 会把包体从 300KB 涨到 1MB。
 */
import { computed, ref, watch, onMounted, nextTick } from 'vue';

const props = defineProps({
  dims: { type: Object, default: () => ({}) },
  /** 关掉动画（自检/打印时用） */
  animate: { type: Boolean, default: true },
  maxWidth: { type: Number, default: 340 }
});

const R = 84;
const CX = 120;
const CY = 120;

const keys = computed(() => Object.keys(props.dims || {}));
const values = computed(() =>
  keys.value.map((k) => Math.max(0, Math.min(100, Number(props.dims[k]) || 0)))
);

/** 生长动画开关：挂载/换数据时先缩到 0.02 再放大 */
const grown = ref(!props.animate);

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

const points = computed(() =>
  values.value.map((v, i) => {
    const [x, y] = pt(i, v / 100);
    return { x, y };
  })
);

const shape = computed(() => points.value.map((p) => p.x + ',' + p.y).join(' '));

const labels = computed(() =>
  keys.value.map((k, i) => {
    const [x, y] = pt(i, 1.2);
    return { k, v: values.value[i], x, y };
  })
);

function grow() {
  if (!props.animate) {
    grown.value = true;
    return;
  }
  grown.value = false;
  nextTick(() => {
    // 两帧：先让 scale(.02) 生效，再放大，才有过渡
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        grown.value = true;
      })
    );
  });
}

onMounted(grow);
watch(() => JSON.stringify(props.dims || {}), grow);
</script>

<template>
  <svg viewBox="0 0 240 240" :style="{ width: '100%', maxWidth: maxWidth + 'px', overflow: 'visible' }">
    <!-- 底网：4 圈 + n 条轴 -->
    <polygon v-for="(r, i) in rings" :key="'ring' + i" :points="r" fill="none" stroke="#EDEAE3" />
    <line
      v-for="(o, i) in outer"
      :key="'axis' + i"
      :x1="CX"
      :y1="CY"
      :x2="o[0]"
      :y2="o[1]"
      stroke="#EDEAE3"
    />

    <!-- 数据多边形：整体从中心放大 -->
    <g
      class="radar-grow"
      :style="{
        transformOrigin: CX + 'px ' + CY + 'px',
        transform: grown ? 'scale(1)' : 'scale(.02)',
        opacity: grown ? 1 : 0,
        transition: animate ? 'transform .9s cubic-bezier(.22,.9,.3,1), opacity .5s ease' : 'none'
      }"
    >
      <polygon
        :points="shape"
        fill="rgba(47,91,234,.18)"
        stroke="#2F5BEA"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <circle v-for="(p, i) in points" :key="'dot' + i" :cx="p.x" :cy="p.y" r="2.6" fill="#2F5BEA" />
    </g>

    <!-- 轴名 + 数值 -->
    <template v-for="l in labels" :key="'lb' + l.k">
      <text
        :x="l.x"
        :y="l.y"
        font-size="10.5"
        fill="#6B7280"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ l.k }}
      </text>
      <text
        :x="l.x"
        :y="l.y + 12"
        class="radar-val"
        font-size="9.5"
        fill="#A8ADB8"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ l.v }}
      </text>
    </template>
  </svg>
</template>
