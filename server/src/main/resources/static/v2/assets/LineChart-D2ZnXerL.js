import { o as onMounted, a as onBeforeUnmount, r as ref, _ as _export_sfc, k as openBlock, c as createElementBlock, F as Fragment, e as renderList, d as createBaseVNode, C as normalizeStyle, u as unref, x as createTextVNode, t as toDisplayString, f as createCommentVNode, D as withModifiers, n as normalizeClass, h as computed, E as nextTick } from "./index-ChFdrz62.js";
const PALETTE = ["#165DFF", "#00B42A", "#FF7D00", "#F53F3F", "#722ED1", "#0FC6C2", "#F7BA1E", "#86909C"];
function niceScale(value, tickHint = 4) {
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
function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, "") + "万";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function useWidth(host, fallback = 720, minWidth = 240) {
  const width = ref(fallback);
  let ro = null;
  onMounted(() => {
    if (!host.value || typeof ResizeObserver === "undefined") return;
    ro = new ResizeObserver((entries) => {
      var _a, _b;
      const w = Math.round(((_b = (_a = entries[0]) == null ? void 0 : _a.contentRect) == null ? void 0 : _b.width) || 0);
      if (w > 0) width.value = Math.max(minWidth, w);
    });
    ro.observe(host.value);
  });
  onBeforeUnmount(() => {
    if (ro) ro.disconnect();
  });
  return width;
}
function toSeries(props) {
  const list = Array.isArray(props.series) && props.series.length ? props.series : null;
  if (list) {
    return list.map((s, i) => ({
      name: s.name || "序列" + (i + 1),
      color: s.color || i === 0 && props.color || PALETTE[i % PALETTE.length],
      points: Array.isArray(s.points) ? s.points : []
    }));
  }
  if (Array.isArray(props.points) && props.points.length) {
    return [{ name: "", color: props.color || PALETTE[0], points: props.points }];
  }
  return [];
}
function emptyTextOf(empty, fallback = "暂无数据") {
  if (typeof empty === "string" && empty) return empty;
  return fallback;
}
const _hoisted_1$2 = {
  key: 0,
  class: "ch-legend"
};
const _hoisted_2$2 = ["width", "height"];
const _hoisted_3$2 = { class: "ch-grid" };
const _hoisted_4$2 = ["x1", "x2", "y1", "y2"];
const _hoisted_5$2 = { class: "ch-axis-text" };
const _hoisted_6$2 = ["x", "y"];
const _hoisted_7$2 = ["x", "y"];
const _hoisted_8$2 = ["x", "y", "width", "height"];
const _hoisted_9$2 = ["x", "y", "width", "height", "fill", "onMousemove", "onClick"];
const _hoisted_10$2 = { class: "ch-tip-x" };
const _hoisted_11$2 = { class: "ch-tip-name" };
const _sfc_main$2 = {
  __name: "BarChart",
  props: {
    series: { type: Array, default: () => [] },
    points: { type: Array, default: () => [] },
    height: { type: Number, default: 240 },
    color: { type: String, default: "" },
    yFormat: { type: Function, default: null },
    empty: { type: [String, Boolean], default: "" },
    showLegend: { type: Boolean, default: true }
  },
  emits: ["bar-click"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
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
      const longest = list.value.reduce((a, b) => b.points.length > a.length ? b.points : a, []);
      return longest.map((p) => String(p.x));
    });
    const innerW = computed(() => Math.max(60, width.value - M.left - M.right));
    const innerH = computed(() => Math.max(40, props.height - M.top - M.bottom));
    const scale = computed(() => niceScale(Math.max(0, ...list.value.flatMap((s) => s.points.map((p) => p.y)))));
    const maxY = computed(() => scale.value.max);
    const band = computed(() => labels.value.length ? innerW.value / labels.value.length : innerW.value);
    const groupW = computed(() => Math.max(6, band.value * 0.62));
    const barW = computed(() => Math.max(3, groupW.value / Math.max(1, list.value.length)));
    const yAt = (v) => M.top + innerH.value - innerH.value * v / maxY.value;
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
    const bars = computed(() => {
      const out = [];
      list.value.forEach((s, si) => {
        s.points.forEach((p, i) => {
          const groupLeft = M.left + band.value * i + (band.value - groupW.value) / 2;
          const x = groupLeft + barW.value * si;
          const y = yAt(p.y);
          out.push({
            key: si + "-" + i,
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
    const xTicks = computed(() => {
      const n = labels.value.length;
      if (!n) return [];
      const step = Math.max(1, Math.ceil(n / 12));
      const out = [];
      for (let i = 0; i < n; i += step) {
        const t = labels.value[i];
        out.push({ i, x: M.left + band.value * i + band.value / 2, text: t.length > 5 ? t.slice(0, 4) + "…" : t });
      }
      return out;
    });
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
      emit("bar-click", {
        index: i,
        x: labels.value[i],
        values: list.value.map((s) => s.points[i] ? s.points[i].y : 0)
      });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "host",
        ref: host,
        class: "ch-bar"
      }, [
        __props.showLegend && hasData.value && list.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(list.value, (s, i) => {
            return openBlock(), createElementBlock("span", {
              key: i,
              class: "ch-legend-item"
            }, [
              createBaseVNode("i", {
                style: normalizeStyle({ background: s.color || unref(PALETTE)[i % unref(PALETTE).length] })
              }, null, 4),
              createTextVNode(toDisplayString(s.name), 1)
            ]);
          }), 128))
        ])) : createCommentVNode("", true),
        !hasData.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "ch-empty",
          style: normalizeStyle({ height: __props.height + "px" })
        }, toDisplayString(emptyText.value), 5)) : (openBlock(), createElementBlock("svg", {
          key: 2,
          class: "ch-svg",
          width: unref(width),
          height: __props.height,
          role: "img",
          "aria-label": "柱状图",
          onMouseleave: onLeave
        }, [
          createBaseVNode("g", _hoisted_3$2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(yTicks.value, (t) => {
              return openBlock(), createElementBlock("line", {
                key: "g" + t.v,
                x1: M.left,
                x2: M.left + innerW.value,
                y1: t.y,
                y2: t.y
              }, null, 8, _hoisted_4$2);
            }), 128))
          ]),
          createBaseVNode("g", _hoisted_5$2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(yTicks.value, (t) => {
              return openBlock(), createElementBlock("text", {
                key: "y" + t.v,
                x: M.left - 8,
                y: t.y + 4,
                "text-anchor": "end"
              }, toDisplayString(t.text), 9, _hoisted_6$2);
            }), 128)),
            (openBlock(true), createElementBlock(Fragment, null, renderList(xTicks.value, (t) => {
              return openBlock(), createElementBlock("text", {
                key: "x" + t.i,
                x: t.x,
                y: __props.height - 10,
                "text-anchor": "middle"
              }, toDisplayString(t.text), 9, _hoisted_7$2);
            }), 128))
          ]),
          hover.value >= 0 ? (openBlock(), createElementBlock("rect", {
            key: 0,
            class: "ch-band",
            x: M.left + band.value * hover.value,
            y: M.top,
            width: band.value,
            height: innerH.value,
            rx: "4"
          }, null, 8, _hoisted_8$2)) : createCommentVNode("", true),
          createBaseVNode("g", null, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(bars.value, (b) => {
              return openBlock(), createElementBlock("rect", {
                key: b.key,
                class: normalizeClass(["ch-bar-rect", { on: hover.value === b.index }]),
                x: b.x,
                y: b.y,
                width: b.w,
                height: b.h,
                fill: b.color,
                rx: "2",
                onMousemove: withModifiers(($event) => onMove(b.index), ["stop"]),
                onClick: withModifiers(($event) => onClick(b.index), ["stop"])
              }, null, 42, _hoisted_9$2);
            }), 128))
          ])
        ], 40, _hoisted_2$2)),
        tip.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "ch-tip",
          style: normalizeStyle({ left: tip.value.left + "px", top: "6px" })
        }, [
          createBaseVNode("div", _hoisted_10$2, toDisplayString(tip.value.label), 1),
          (openBlock(true), createElementBlock(Fragment, null, renderList(tip.value.rows, (r, i) => {
            return openBlock(), createElementBlock("div", {
              key: i,
              class: "ch-tip-row"
            }, [
              createBaseVNode("i", {
                style: normalizeStyle({ background: r.color })
              }, null, 4),
              createBaseVNode("span", _hoisted_11$2, toDisplayString(r.name), 1),
              createBaseVNode("b", null, toDisplayString(__props.yFormat ? __props.yFormat(r.value) : r.value), 1)
            ]);
          }), 128))
        ], 4)) : createCommentVNode("", true)
      ], 512);
    };
  }
};
const BarChart = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-b99f4534"]]);
const _hoisted_1$1 = ["width", "height"];
const _hoisted_2$1 = ["transform"];
const _hoisted_3$1 = ["cx", "cy", "r"];
const _hoisted_4$1 = ["cx", "cy", "r", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "onMouseenter", "onClick"];
const _hoisted_5$1 = { class: "ch-donut-center" };
const _hoisted_6$1 = { class: "ch-donut-value" };
const _hoisted_7$1 = { class: "ch-donut-label" };
const _hoisted_8$1 = { class: "ch-donut-sub" };
const _hoisted_9$1 = {
  key: 0,
  class: "ch-donut-legend"
};
const _hoisted_10$1 = ["onMouseenter", "onClick"];
const _hoisted_11$1 = { class: "ch-donut-name" };
const _hoisted_12$1 = { class: "ch-donut-pct" };
const _sfc_main$1 = {
  __name: "DonutChart",
  props: {
    series: { type: Array, default: () => [] },
    points: { type: Array, default: () => [] },
    height: { type: Number, default: 220 },
    color: { type: String, default: "" },
    yFormat: { type: Function, default: null },
    empty: { type: [String, Boolean], default: "" },
    showLegend: { type: Boolean, default: true },
    centerLabel: { type: String, default: "合计" }
  },
  emits: ["slice-click"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const list = computed(() => {
      const src = Array.isArray(props.series) && props.series.length ? props.series[0].points || [] : props.points || [];
      return src.map((p, i) => ({
        label: String(p.x),
        value: Math.max(0, Number(p.y) || 0),
        color: p.color || PALETTE[i % PALETTE.length]
      }));
    });
    const hasData = computed(() => list.value.some((s) => s.value > 0));
    const emptyText = computed(() => emptyTextOf(props.empty));
    const total = computed(() => list.value.reduce((a, b) => a + b.value, 0));
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
    const grown = ref(false);
    onMounted(() => nextTick(() => {
      grown.value = true;
    }));
    const hover = ref(-1);
    function onEnter(i) {
      hover.value = i;
    }
    function onLeave() {
      hover.value = -1;
    }
    function onClick(i) {
      const s = slices.value[i];
      emit("slice-click", { label: s.label, value: s.value, percent: s.percent });
    }
    const center = computed(() => {
      if (hover.value >= 0 && slices.value[hover.value]) {
        const s = slices.value[hover.value];
        return { label: s.label, value: props.yFormat ? props.yFormat(s.value) : s.value, sub: s.percent.toFixed(1) + "%" };
      }
      return {
        label: props.centerLabel,
        value: props.yFormat ? props.yFormat(total.value) : total.value,
        sub: "100%"
      };
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "ch-donut",
        style: normalizeStyle({ minHeight: __props.height + "px" })
      }, [
        !hasData.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "ch-empty",
          style: normalizeStyle({ height: __props.height + "px" })
        }, toDisplayString(emptyText.value), 5)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", {
            class: "ch-donut-ring",
            style: normalizeStyle({ width: box.value + "px", height: box.value + "px" })
          }, [
            (openBlock(), createElementBlock("svg", {
              width: box.value,
              height: box.value,
              role: "img",
              "aria-label": "环形图"
            }, [
              createBaseVNode("g", {
                transform: `rotate(-90 ${cx.value} ${cy.value})`
              }, [
                createBaseVNode("circle", {
                  cx: cx.value,
                  cy: cy.value,
                  r: R.value,
                  fill: "none",
                  stroke: "#F2F3F5",
                  "stroke-width": 16
                }, null, 8, _hoisted_3$1),
                (openBlock(true), createElementBlock(Fragment, null, renderList(slices.value, (s, i) => {
                  return openBlock(), createElementBlock("circle", {
                    key: s.label + i,
                    class: normalizeClass(["ch-slice", { on: hover.value === i, dim: hover.value >= 0 && hover.value !== i }]),
                    cx: cx.value,
                    cy: cy.value,
                    r: R.value,
                    fill: "none",
                    stroke: s.color,
                    "stroke-width": hover.value === i ? 21 : 16,
                    "stroke-dasharray": grown.value ? `${s.len} ${s.rest}` : `0 ${C.value}`,
                    "stroke-dashoffset": s.offset,
                    "stroke-linecap": "butt",
                    onMouseenter: ($event) => onEnter(i),
                    onMouseleave: onLeave,
                    onClick: ($event) => onClick(i)
                  }, null, 42, _hoisted_4$1);
                }), 128))
              ], 8, _hoisted_2$1)
            ], 8, _hoisted_1$1)),
            createBaseVNode("div", _hoisted_5$1, [
              createBaseVNode("div", _hoisted_6$1, toDisplayString(center.value.value), 1),
              createBaseVNode("div", _hoisted_7$1, toDisplayString(center.value.label), 1),
              createBaseVNode("div", _hoisted_8$1, toDisplayString(center.value.sub), 1)
            ])
          ], 4),
          __props.showLegend ? (openBlock(), createElementBlock("ul", _hoisted_9$1, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(slices.value, (s, i) => {
              return openBlock(), createElementBlock("li", {
                key: "l" + i,
                class: normalizeClass({ on: hover.value === i }),
                onMouseenter: ($event) => onEnter(i),
                onMouseleave: onLeave,
                onClick: ($event) => onClick(i)
              }, [
                createBaseVNode("i", {
                  style: normalizeStyle({ background: s.color })
                }, null, 4),
                createBaseVNode("span", _hoisted_11$1, toDisplayString(s.label), 1),
                createBaseVNode("b", null, toDisplayString(__props.yFormat ? __props.yFormat(s.value) : s.value), 1),
                createBaseVNode("span", _hoisted_12$1, toDisplayString(s.percent.toFixed(1)) + "%", 1)
              ], 42, _hoisted_10$1);
            }), 128))
          ])) : createCommentVNode("", true)
        ], 64))
      ], 4);
    };
  }
};
const DonutChart = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-270367f9"]]);
const _hoisted_1 = {
  key: 0,
  class: "ch-legend"
};
const _hoisted_2 = ["width", "height"];
const _hoisted_3 = { class: "ch-grid" };
const _hoisted_4 = ["x1", "x2", "y1", "y2"];
const _hoisted_5 = { class: "ch-axis-text" };
const _hoisted_6 = ["x", "y"];
const _hoisted_7 = ["x", "y"];
const _hoisted_8 = ["d", "stroke"];
const _hoisted_9 = { key: 0 };
const _hoisted_10 = ["x1", "x2", "y1", "y2"];
const _hoisted_11 = ["cx", "cy", "fill"];
const _hoisted_12 = { class: "ch-tip-x" };
const _hoisted_13 = { class: "ch-tip-name" };
const _sfc_main = {
  __name: "LineChart",
  props: {
    series: { type: Array, default: () => [] },
    points: { type: Array, default: () => [] },
    height: { type: Number, default: 240 },
    color: { type: String, default: "" },
    yFormat: { type: Function, default: null },
    empty: { type: [String, Boolean], default: "" },
    showLegend: { type: Boolean, default: true }
  },
  emits: ["point-click"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const host = ref(null);
    const width = useWidth(host, 720);
    const M = { top: 18, right: 18, bottom: 26, left: 48 };
    const list = computed(() => toSeries(props).map((s) => ({
      ...s,
      points: s.points.map((p) => ({ x: p.x, y: Number(p.y) || 0 }))
    })));
    const hasData = computed(() => list.value.some((s) => s.points.length > 0));
    const emptyText = computed(() => emptyTextOf(props.empty));
    const labels = computed(() => {
      const longest = list.value.reduce((a, b) => b.points.length > a.length ? b.points : a, []);
      return longest.map((p) => String(p.x));
    });
    const innerW = computed(() => Math.max(60, width.value - M.left - M.right));
    const innerH = computed(() => Math.max(40, props.height - M.top - M.bottom));
    const scale = computed(() => niceScale(Math.max(0, ...list.value.flatMap((s) => s.points.map((p) => p.y)))));
    const maxY = computed(() => scale.value.max);
    const xAt = (i) => {
      const n = labels.value.length;
      if (n <= 1) return M.left + innerW.value / 2;
      return M.left + innerW.value * i / (n - 1);
    };
    const yAt = (v) => M.top + innerH.value - innerH.value * v / maxY.value;
    const yTicks = computed(() => {
      const { step, count } = scale.value;
      const out = [];
      for (let i = 0; i <= count; i++) {
        const v = i * step;
        out.push({ v, y: yAt(v), text: props.yFormat ? props.yFormat(v) : compact(v) });
      }
      return out;
    });
    const xTicks = computed(() => {
      var _a;
      const n = labels.value.length;
      if (!n) return [];
      const step = Math.max(1, Math.ceil(n / 6));
      const out = [];
      for (let i = 0; i < n; i += step) out.push({ i, x: xAt(i), text: labels.value[i] });
      const last = n - 1;
      if (((_a = out[out.length - 1]) == null ? void 0 : _a.i) !== last) out.push({ i: last, x: xAt(last), text: labels.value[last] });
      return out;
    });
    const paths = computed(() => list.value.map((s) => {
      const d = s.points.map((p, i) => (i === 0 ? "M" : "L") + xAt(i) + "," + yAt(p.y)).join(" ");
      return { ...s, d };
    }));
    const hover = ref(-1);
    function onMove(e) {
      if (!hasData.value) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const n = labels.value.length;
      if (n === 0) return;
      if (n === 1) {
        hover.value = 0;
        return;
      }
      const ratio = (px - M.left) / innerW.value;
      hover.value = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    }
    const tip = computed(() => {
      if (hover.value < 0 || !labels.value.length) return null;
      const i = hover.value;
      const rows = list.value.map((s) => ({ name: s.name, color: s.color, value: s.points[i] ? s.points[i].y : 0 }));
      const x = xAt(i);
      const left = Math.max(78, Math.min(width.value - 78, x));
      return { x, i, label: labels.value[i], rows, left };
    });
    function onClick() {
      if (hover.value < 0) return;
      const i = hover.value;
      emit("point-click", {
        index: i,
        x: labels.value[i],
        values: list.value.map((s) => s.points[i] ? s.points[i].y : 0)
      });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "host",
        ref: host,
        class: "ch-line"
      }, [
        __props.showLegend && hasData.value && list.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_1, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(list.value, (s, i) => {
            return openBlock(), createElementBlock("span", {
              key: i,
              class: "ch-legend-item"
            }, [
              createBaseVNode("i", {
                style: normalizeStyle({ background: s.color || unref(PALETTE)[i % unref(PALETTE).length] })
              }, null, 4),
              createTextVNode(toDisplayString(s.name), 1)
            ]);
          }), 128))
        ])) : createCommentVNode("", true),
        !hasData.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "ch-empty",
          style: normalizeStyle({ height: __props.height + "px" })
        }, toDisplayString(emptyText.value), 5)) : (openBlock(), createElementBlock("svg", {
          key: 2,
          class: "ch-svg",
          width: unref(width),
          height: __props.height,
          role: "img",
          "aria-label": "折线图",
          onMousemove: onMove,
          onMouseleave: _cache[0] || (_cache[0] = ($event) => hover.value = -1),
          onClick
        }, [
          createBaseVNode("g", _hoisted_3, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(yTicks.value, (t) => {
              return openBlock(), createElementBlock("line", {
                key: "g" + t.v,
                x1: M.left,
                x2: M.left + innerW.value,
                y1: t.y,
                y2: t.y
              }, null, 8, _hoisted_4);
            }), 128))
          ]),
          createBaseVNode("g", _hoisted_5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(yTicks.value, (t) => {
              return openBlock(), createElementBlock("text", {
                key: "y" + t.v,
                x: M.left - 8,
                y: t.y + 4,
                "text-anchor": "end"
              }, toDisplayString(t.text), 9, _hoisted_6);
            }), 128)),
            (openBlock(true), createElementBlock(Fragment, null, renderList(xTicks.value, (t) => {
              return openBlock(), createElementBlock("text", {
                key: "x" + t.i,
                x: t.x,
                y: __props.height - 8,
                "text-anchor": "middle"
              }, toDisplayString(t.text), 9, _hoisted_7);
            }), 128))
          ]),
          (openBlock(true), createElementBlock(Fragment, null, renderList(paths.value, (s, si) => {
            return openBlock(), createElementBlock("g", {
              key: "s" + si
            }, [
              createBaseVNode("path", {
                class: "ch-line-path",
                d: s.d,
                stroke: s.color || unref(PALETTE)[si % unref(PALETTE).length],
                fill: "none",
                "stroke-width": "2",
                "stroke-linejoin": "round",
                "stroke-linecap": "round"
              }, null, 8, _hoisted_8)
            ]);
          }), 128)),
          hover.value >= 0 ? (openBlock(), createElementBlock("g", _hoisted_9, [
            createBaseVNode("line", {
              class: "ch-guide",
              x1: xAt(hover.value),
              x2: xAt(hover.value),
              y1: M.top,
              y2: M.top + innerH.value
            }, null, 8, _hoisted_10),
            (openBlock(true), createElementBlock(Fragment, null, renderList(paths.value, (s, si) => {
              return openBlock(), createElementBlock("circle", {
                key: "d" + si,
                cx: xAt(hover.value),
                cy: yAt(s.points[hover.value] ? s.points[hover.value].y : 0),
                r: "3.5",
                fill: s.color || unref(PALETTE)[si % unref(PALETTE).length],
                stroke: "#fff",
                "stroke-width": "1.5"
              }, null, 8, _hoisted_11);
            }), 128))
          ])) : createCommentVNode("", true)
        ], 40, _hoisted_2)),
        tip.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "ch-tip",
          style: normalizeStyle({ left: tip.value.left + "px", top: "8px" })
        }, [
          createBaseVNode("div", _hoisted_12, toDisplayString(tip.value.label), 1),
          (openBlock(true), createElementBlock(Fragment, null, renderList(tip.value.rows, (r, i) => {
            return openBlock(), createElementBlock("div", {
              key: i,
              class: "ch-tip-row"
            }, [
              createBaseVNode("i", {
                style: normalizeStyle({ background: r.color || unref(PALETTE)[i % unref(PALETTE).length] })
              }, null, 4),
              createBaseVNode("span", _hoisted_13, toDisplayString(r.name), 1),
              createBaseVNode("b", null, toDisplayString(__props.yFormat ? __props.yFormat(r.value) : r.value), 1)
            ]);
          }), 128))
        ], 4)) : createCommentVNode("", true)
      ], 512);
    };
  }
};
const LineChart = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0e52b108"]]);
export {
  BarChart as B,
  DonutChart as D,
  LineChart as L,
  PALETTE as P,
  emptyTextOf as e,
  toSeries as t,
  useWidth as u
};
