/**
 * 图表公共小工具（自研 SVG，**零依赖**，不引 ECharts）。
 *
 * 设计文档 §7.1 要求四个组件共用同一套受控 props：
 * `series / points / height / color / y-format / empty`。
 * 这里只放它们都要用的三样东西：调色板、y 轴取整、容器宽度监听。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** 默认调色板：与 style.css 的 --blue/--grn/--org/--red 同色系，看起来是同一个产品。 */
export const PALETTE = ['#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#0FC6C2', '#F7BA1E', '#86909C'];

/**
 * y 轴刻度：返回 { max, step, count }，步长取 1/2/5 × 10^n。
 *
 * 为什么不用「最大值除以 4」：那样会算出 12.5、37.5 这种小数刻度，
 * 而统计量都是整数（次数、人数、金额分），刻度必须落在整数上才读得顺。
 */
export function niceScale(value, tickHint = 4) {
  const v = Number(value) || 0;
  if (v <= 0) return { max: 1, step: 1, count: 1 };
  const rough = v / Math.max(1, tickHint);
  const exp = Math.floor(Math.log10(rough));
  const base = 10 ** exp;
  const f = rough / base;
  const niceF = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const step = niceF * base;
  const max = Math.ceil(v / step) * step;
  return { max, step, count: Math.round(max / step) };
}

/** y 轴刻度文本：大数走「1.2万」，免得左侧留白被数字挤爆。 */
export function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 监听容器宽度，返回一个宽度 ref（px）。
 *
 * 为什么不用固定 viewBox + preserveAspectRatio：那样文字会被拉伸变形；
 * 图表要画在真实像素坐标里，宽度就得实测。ResizeObserver 不可用时退回 fallback。
 */
export function useWidth(host, fallback = 720) {
  const width = ref(fallback);
  let ro = null;

  onMounted(() => {
    if (!host.value || typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect?.width || 0);
      if (w > 0) width.value = Math.max(240, w);
    });
    ro.observe(host.value);
  });
  onBeforeUnmount(() => {
    if (ro) ro.disconnect();
  });

  return width;
}

/** 统一把 props 归一成 [{name, color, points:[{x,y}]}]：单序列允许直接传 points。 */
export function toSeries(props) {
  const list = Array.isArray(props.series) && props.series.length ? props.series : null;
  if (list) {
    return list.map((s, i) => ({
      name: s.name || '序列' + (i + 1),
      color: s.color || (i === 0 && props.color) || PALETTE[i % PALETTE.length],
      points: Array.isArray(s.points) ? s.points : []
    }));
  }
  if (Array.isArray(props.points) && props.points.length) {
    return [{ name: '', color: props.color || PALETTE[0], points: props.points }];
  }
  return [];
}

/** 空态文案：`empty` 传字符串用自己的，传 true 用默认。 */
export function emptyTextOf(empty, fallback = '暂无数据') {
  if (typeof empty === 'string' && empty) return empty;
  return fallback;
}
