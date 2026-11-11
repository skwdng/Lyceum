import { _ as _export_sfc, k as openBlock, c as createElementBlock, t as toDisplayString, f as createCommentVNode, d as createBaseVNode, r as ref, h as computed, o as onMounted, F as Fragment, e as renderList, x as createTextVNode, g as createVNode, n as normalizeClass, b as createBlock, y as analyticsApi, s as toast } from "./index-DYGqTA6G.js";
import { u as useWidth, e as emptyTextOf, P as PALETTE, t as toSeries, L as LineChart, D as DonutChart, B as BarChart } from "./LineChart-BYm6SlLn.js";
import { e as errText } from "./helpers-D_KARve0.js";
const _hoisted_1$1 = {
  key: 0,
  class: "ch-spark-empty"
};
const _hoisted_2$1 = ["width", "height", "aria-label"];
const _hoisted_3$1 = ["d", "fill"];
const _hoisted_4$1 = ["d", "stroke"];
const _hoisted_5$1 = ["cx", "cy", "fill"];
const pad = 3;
const _sfc_main$1 = {
  __name: "Sparkline",
  props: {
    series: { type: Array, default: () => [] },
    points: { type: Array, default: () => [] },
    height: { type: Number, default: 32 },
    color: { type: String, default: "" },
    yFormat: { type: Function, default: null },
    empty: { type: [String, Boolean], default: "" },
    /** 是否填充线下方（默认填一点点，卡片上更像"趋势"） */
    area: { type: Boolean, default: true }
  },
  setup(__props) {
    const props = __props;
    const host = ref(null);
    const width = useWidth(host, 120, 40);
    const line = computed(() => toSeries(props)[0] || null);
    const pts = computed(() => line.value ? line.value.points.map((p) => ({ x: p.x, y: Number(p.y) || 0 })) : []);
    const hasData = computed(() => pts.value.length > 0);
    const emptyText = computed(() => emptyTextOf(props.empty, "—"));
    const stroke = computed(() => line.value && line.value.color || props.color || PALETTE[0]);
    const geometry = computed(() => {
      const n = pts.value.length;
      const w = Math.max(20, width.value);
      const h = Math.max(12, props.height);
      const ys = pts.value.map((p) => p.y);
      const min = Math.min(...ys, 0);
      const max = Math.max(...ys, 1);
      const span = max - min || 1;
      const xAt = (i) => n <= 1 ? w / 2 : pad + (w - pad * 2) * i / (n - 1);
      const yAt = (v) => h - pad - (h - pad * 2) * (v - min) / span;
      const points = pts.value.map((p, i) => ({ x: xAt(i), y: yAt(p.y), v: p.y }));
      const d = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
      const areaD = points.length ? d + ` L${points[points.length - 1].x.toFixed(1)},${h - pad} L${points[0].x.toFixed(1)},${h - pad} Z` : "";
      return { w, h, d, areaD, points, last: points[points.length - 1] };
    });
    const trendUp = computed(() => {
      const p = geometry.value.points;
      if (p.length < 2) return true;
      return p[p.length - 1].v >= p[p.length - 2].v;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        ref_key: "host",
        ref: host,
        class: "ch-spark"
      }, [
        !hasData.value ? (openBlock(), createElementBlock("span", _hoisted_1$1, toDisplayString(emptyText.value), 1)) : (openBlock(), createElementBlock("svg", {
          key: 1,
          width: geometry.value.w,
          height: geometry.value.h,
          role: "img",
          "aria-label": "趋势：" + pts.value.map((p) => p.y).join(" → ")
        }, [
          __props.area ? (openBlock(), createElementBlock("path", {
            key: 0,
            d: geometry.value.areaD,
            fill: stroke.value,
            opacity: "0.10"
          }, null, 8, _hoisted_3$1)) : createCommentVNode("", true),
          createBaseVNode("path", {
            class: "ch-spark-path",
            d: geometry.value.d,
            fill: "none",
            stroke: stroke.value,
            "stroke-width": "1.8",
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
          }, null, 8, _hoisted_4$1),
          geometry.value.last ? (openBlock(), createElementBlock("circle", {
            key: 1,
            cx: geometry.value.last.x,
            cy: geometry.value.last.y,
            r: "2.6",
            fill: trendUp.value ? "#00B42A" : "#F53F3F",
            stroke: "#fff",
            "stroke-width": "1"
          }, null, 8, _hoisted_5$1)) : createCommentVNode("", true)
        ], 8, _hoisted_2$1))
      ], 512);
    };
  }
};
const Sparkline = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-04d55f18"]]);
const _hoisted_1 = { "data-panel": "dashboard" };
const _hoisted_2 = { class: "adm-toolbar" };
const _hoisted_3 = { class: "adm-chips" };
const _hoisted_4 = ["onClick"];
const _hoisted_5 = {
  key: 0,
  class: "muted",
  style: { "font-size": "12.5px" }
};
const _hoisted_6 = {
  key: 0,
  class: "muted",
  style: { "padding": "24px" }
};
const _hoisted_7 = { class: "adm-kpis" };
const _hoisted_8 = { class: "k" };
const _hoisted_9 = { class: "v" };
const _hoisted_10 = { key: 0 };
const _hoisted_11 = { key: 0 };
const _hoisted_12 = {
  key: 1,
  class: "muted"
};
const _hoisted_13 = {
  class: "muted",
  style: { "margin-left": "6px" }
};
const _hoisted_14 = {
  class: "adm-grid",
  style: { "grid-template-columns": "1.6fr 1fr" }
};
const _hoisted_15 = { class: "panel" };
const _hoisted_16 = { class: "body" };
const _hoisted_17 = { class: "panel" };
const _hoisted_18 = { class: "body" };
const _hoisted_19 = {
  class: "panel",
  style: { "margin-top": "14px" }
};
const _hoisted_20 = { class: "body" };
const CHART_RANGE = "30d";
const _sfc_main = {
  __name: "DashboardView",
  setup(__props) {
    const RANGES = [["7d", "近 7 天"], ["30d", "近 30 天"]];
    const range = ref("7d");
    const loading = ref(true);
    const overview = ref(null);
    const modules = ref(null);
    const tiers = ref(null);
    const matchesTrend = ref([]);
    const postsTrend = ref([]);
    const activeTrend = ref([]);
    const MODULE_LABELS = {
      community: "社区",
      chat: "聊天",
      match: "多人辩论",
      solo: "单人辩论",
      video: "视频",
      hot: "热辩榜",
      diag: "能力分析",
      records: "辩论记录",
      wallet: "钱包",
      friends: "好友",
      admin: "管理台"
    };
    const moduleName = (k) => MODULE_LABELS[k] || k;
    function datesOf(token) {
      const n = Number(String(token).replace("d", "")) || 7;
      const to = /* @__PURE__ */ new Date();
      const from = new Date(to.getTime() - (n - 1) * 864e5);
      const f = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      return { from: f(from), to: f(to) };
    }
    const toPoints = (res) => res && res.points ? res.points : [];
    async function load() {
      loading.value = true;
      const { from, to } = datesOf(range.value);
      try {
        const [o] = await Promise.all([analyticsApi.overview(from, to)]);
        overview.value = o;
        if (!modules.value) {
          const [mod, tier, mt, pt, at] = await Promise.all([
            analyticsApi.modules(CHART_RANGE),
            analyticsApi.breakdown("tier", CHART_RANGE),
            analyticsApi.trend("matches", CHART_RANGE),
            analyticsApi.trend("posts", CHART_RANGE),
            analyticsApi.trend("active", CHART_RANGE)
          ]);
          modules.value = mod;
          tiers.value = tier;
          matchesTrend.value = toPoints(mt);
          postsTrend.value = toPoints(pt);
          activeTrend.value = toPoints(at);
        }
      } catch (e) {
        toast(errText(e));
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    const KPI_SERIES = {
      matches: () => matchesTrend.value,
      posts: () => postsTrend.value,
      avgDau: () => activeTrend.value
    };
    function sparkOf(key) {
      const pick = KPI_SERIES[key];
      return pick ? pick() : [];
    }
    function formatValue(item) {
      if (item.unit === "分") return "¥" + (Number(item.value || 0) / 100).toFixed(2);
      return Number(item.value || 0).toLocaleString("zh-CN");
    }
    function deltaText(item) {
      if (item.deltaPct === null || item.deltaPct === void 0) {
        return item.prev === 0 && item.value > 0 ? "新增" : "";
      }
      if (item.deltaPct === 0) return "持平";
      return (item.deltaPct > 0 ? "↑ " : "↓ ") + Math.abs(item.deltaPct) + "%";
    }
    const deltaClass = (item) => {
      if (item.deltaPct === null || item.deltaPct === void 0) return "up";
      return item.deltaPct >= 0 ? "up" : "down";
    };
    const moduleBars = computed(() => modules.value ? modules.value.modules.map((m) => ({ x: moduleName(m.module), y: m.pv })) : []);
    const tierDonut = computed(() => tiers.value ? tiers.value.points : []);
    const trendSeries = computed(() => [
      { name: "对局", color: "#165DFF", points: matchesTrend.value },
      { name: "发帖", color: "#00B42A", points: postsTrend.value }
    ]);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            (openBlock(), createElementBlock(Fragment, null, renderList(RANGES, (r) => {
              return createBaseVNode("button", {
                key: r[0],
                class: normalizeClass(["adm-chip", { on: range.value === r[0] }]),
                onClick: ($event) => {
                  range.value = r[0];
                  load();
                }
              }, toDisplayString(r[1]), 11, _hoisted_4);
            }), 64))
          ]),
          overview.value ? (openBlock(), createElementBlock("span", _hoisted_5, toDisplayString(overview.value.from) + " ~ " + toDisplayString(overview.value.to) + " · 对比 " + toDisplayString(overview.value.prevFrom) + " ~ " + toDisplayString(overview.value.prevTo), 1)) : createCommentVNode("", true)
        ]),
        loading.value ? (openBlock(), createElementBlock("div", _hoisted_6, "加载中…")) : overview.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("div", _hoisted_7, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(overview.value.items, (item) => {
              return openBlock(), createElementBlock("div", {
                key: item.key,
                class: "adm-kpi"
              }, [
                createBaseVNode("div", _hoisted_8, toDisplayString(item.label), 1),
                createBaseVNode("div", _hoisted_9, [
                  createTextVNode(toDisplayString(formatValue(item)) + " ", 1),
                  item.unit && item.unit !== "分" ? (openBlock(), createElementBlock("small", _hoisted_10, toDisplayString(item.unit), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", {
                  class: normalizeClass(["d", deltaClass(item)])
                }, [
                  deltaText(item) ? (openBlock(), createElementBlock("span", _hoisted_11, toDisplayString(deltaText(item)), 1)) : (openBlock(), createElementBlock("span", _hoisted_12, "—")),
                  createBaseVNode("span", _hoisted_13, "上期 " + toDisplayString(item.prev), 1)
                ], 2),
                sparkOf(item.key).length ? (openBlock(), createBlock(Sparkline, {
                  key: 0,
                  points: sparkOf(item.key),
                  height: 30
                }, null, 8, ["points"])) : createCommentVNode("", true)
              ]);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_14, [
            createBaseVNode("div", _hoisted_15, [
              createBaseVNode("h2", null, [
                _cache[0] || (_cache[0] = createTextVNode("近 30 天趋势", -1)),
                _cache[1] || (_cache[1] = createBaseVNode("span", { class: "spacer" }, null, -1)),
                createBaseVNode("span", {
                  class: "muted",
                  style: { "font-weight": "400" }
                }, toDisplayString(CHART_RANGE))
              ]),
              createBaseVNode("div", _hoisted_16, [
                createVNode(LineChart, {
                  series: trendSeries.value,
                  height: 230
                }, null, 8, ["series"])
              ])
            ]),
            createBaseVNode("div", _hoisted_17, [
              _cache[2] || (_cache[2] = createBaseVNode("h2", null, "档位分布", -1)),
              createBaseVNode("div", _hoisted_18, [
                createVNode(DonutChart, {
                  points: tierDonut.value,
                  height: 210,
                  "center-label": "对局"
                }, null, 8, ["points"])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_19, [
            _cache[3] || (_cache[3] = createBaseVNode("h2", null, "模块浏览排行（30 天 PV）", -1)),
            createBaseVNode("div", _hoisted_20, [
              createVNode(BarChart, {
                points: moduleBars.value,
                height: 200
              }, null, 8, ["points"])
            ])
          ])
        ], 64)) : createCommentVNode("", true)
      ]);
    };
  }
};
const DashboardView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-7a432264"]]);
export {
  DashboardView as default
};
