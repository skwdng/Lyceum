import { J as getAdminToken, K as API_BASE, I as analyticsApi, L as ApiError, _ as _export_sfc, u as useAdminStore, o as onMounted, c as createElementBlock, b as createBaseVNode, F as Fragment, r as renderList, e as createCommentVNode, t as toDisplayString, d as createTextVNode, x as createVNode, i as ref, k as errText, m as toast, p as computed, a as openBlock, n as normalizeClass } from "./index-CCT1IxrH.js";
import { B as BarChart, D as DonutChart, L as LineChart } from "./LineChart-CNV5-idP.js";
async function downloadExport(params, fallbackName = "export.csv") {
  const token = getAdminToken();
  const resp = await fetch(API_BASE + analyticsApi.exportPath(params), {
    headers: token ? { Authorization: "Bearer " + token } : {}
  });
  if (!resp.ok) {
    let message = "导出失败（HTTP " + resp.status + "）";
    try {
      const body = await resp.json();
      if (body && (body.message || body.code)) message = body.message || body.code;
    } catch (e) {
    }
    throw new ApiError(message, "EXPORT_FAILED", resp.status);
  }
  const blob = await resp.blob();
  const name = filenameOf(resp.headers.get("Content-Disposition")) || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
  return name;
}
function filenameOf(contentDisposition) {
  if (!contentDisposition) return "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (m) {
    try {
      return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
    } catch (e) {
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : "";
}
const _hoisted_1 = { "data-panel": "analytics" };
const _hoisted_2 = { class: "adm-toolbar" };
const _hoisted_3 = { class: "adm-chips" };
const _hoisted_4 = ["onClick"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = {
  key: 0,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_7 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_8 = { class: "msg" };
const _hoisted_9 = {
  key: 1,
  class: "panel"
};
const _hoisted_10 = { class: "panel" };
const _hoisted_11 = ["disabled"];
const _hoisted_12 = ["disabled"];
const _hoisted_13 = { class: "body scroll" };
const _hoisted_14 = { class: "adm-split" };
const _hoisted_15 = { class: "adm-pane" };
const _hoisted_16 = { class: "adm-pane" };
const _hoisted_17 = {
  key: 0,
  class: "tbl-x",
  style: { "margin-top": "12px" }
};
const _hoisted_18 = { class: "muted" };
const _hoisted_19 = {
  key: 1,
  class: "muted",
  style: { "font-size": "11.5px", "margin-top": "8px" }
};
const _hoisted_20 = {
  class: "panel",
  style: { "margin-top": "14px" }
};
const _hoisted_21 = ["disabled"];
const _hoisted_22 = ["disabled"];
const _hoisted_23 = { class: "body" };
const _hoisted_24 = { class: "adm-stats" };
const _hoisted_25 = { class: "adm-stat" };
const _hoisted_26 = { class: "v" };
const _hoisted_27 = { class: "adm-stat" };
const _hoisted_28 = { class: "v" };
const _hoisted_29 = { class: "adm-stat" };
const _hoisted_30 = { class: "v" };
const _hoisted_31 = {
  class: "panel",
  style: { "margin-top": "14px" }
};
const _hoisted_32 = ["disabled"];
const _hoisted_33 = ["disabled"];
const _hoisted_34 = ["disabled"];
const _hoisted_35 = { class: "body" };
const _hoisted_36 = { class: "adm-split" };
const _hoisted_37 = { class: "adm-pane" };
const _hoisted_38 = { class: "adm-pane" };
const _hoisted_39 = {
  class: "panel",
  style: { "margin-top": "14px" }
};
const _hoisted_40 = ["disabled"];
const _hoisted_41 = ["disabled"];
const _hoisted_42 = { class: "body" };
const _hoisted_43 = { class: "adm-split" };
const _hoisted_44 = { class: "adm-pane" };
const _hoisted_45 = { class: "adm-pane" };
const _hoisted_46 = {
  class: "panel",
  style: { "margin-top": "14px" }
};
const _hoisted_47 = ["disabled"];
const _hoisted_48 = ["disabled"];
const _hoisted_49 = { class: "body" };
const _hoisted_50 = { class: "adm-stats" };
const _hoisted_51 = { class: "adm-stat" };
const _hoisted_52 = { class: "v" };
const _hoisted_53 = { class: "adm-stat" };
const _hoisted_54 = { class: "v" };
const _hoisted_55 = { class: "adm-stat" };
const _hoisted_56 = { class: "v" };
const _sfc_main = {
  __name: "AnalyticsView",
  setup(__props) {
    const adminStore = useAdminStore();
    const canExport = computed(() => adminStore.has("analytics:export"));
    const RANGES = [["7d", "近 7 天"], ["30d", "近 30 天"], ["90d", "近 90 天"]];
    const range = ref("30d");
    const loading = ref(true);
    const error = ref("");
    const exporting = ref("");
    const modules = ref(null);
    const active = ref(null);
    const quality = ref(null);
    const reportsTrend = ref([]);
    const postsTrend = ref([]);
    const revenueTrend = ref([]);
    const reasonDonut = ref([]);
    const tierDonut = ref([]);
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
    const toPoints = (res) => res && res.points ? res.points : [];
    async function load() {
      loading.value = true;
      error.value = "";
      const r = range.value;
      try {
        const [mod, act, q, rt, pt, vt, reason, tier] = await Promise.all([
          analyticsApi.modules(r),
          analyticsApi.active(r),
          analyticsApi.quality(r),
          analyticsApi.trend("reports", r),
          analyticsApi.trend("posts", r),
          analyticsApi.trend("revenue", r),
          analyticsApi.breakdown("report_reason", r),
          analyticsApi.breakdown("tier", r)
        ]);
        modules.value = mod;
        active.value = act;
        quality.value = q;
        reportsTrend.value = toPoints(rt);
        postsTrend.value = toPoints(pt);
        revenueTrend.value = toPoints(vt).map((p) => ({ x: p.x, y: Math.round(p.y / 100 * 100) / 100 }));
        reasonDonut.value = reasonLabeled(toPoints(reason));
        tierDonut.value = toPoints(tier);
      } catch (e) {
        error.value = errText(e) || "请求失败";
        toast(errText(e));
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    function reasonLabeled(points) {
      const m = { SPAM: "垃圾广告", ABUSE: "人身攻击", ILLEGAL: "违法违规", OTHER: "其他" };
      return points.map((p) => ({ x: m[p.x] || p.x, y: p.y }));
    }
    const moduleBars = computed(() => modules.value ? modules.value.modules.slice(0, 10).map((m) => ({ x: moduleName(m.module), y: m.pv })) : []);
    const moduleDonut = computed(() => modules.value ? modules.value.modules.slice(0, 6).map((m) => ({ x: moduleName(m.module), y: m.pv })) : []);
    const moduleTrendSeries = computed(() => {
      if (!modules.value || !modules.value.trend) return [];
      const colors = ["#165DFF", "#00B42A", "#FF7D00", "#722ED1", "#0FC6C2"];
      const days = modules.value.trend.days || [];
      return modules.value.trend.series.slice(0, 5).map((s, i) => ({
        name: moduleName(s.module),
        color: colors[i % colors.length],
        points: days.map((d, idx) => ({ x: d, y: s.pv[idx] || 0 }))
      }));
    });
    const qualityBars = computed(() => quality.value ? quality.value.dims.map((d) => ({ x: d.label, y: d.value })) : []);
    async function exportReport(params, key) {
      if (exporting.value) return;
      exporting.value = "export";
      try {
        const name = await downloadExport({ ...params, range: range.value });
        toast("已导出 " + name);
      } catch (e) {
        toast(errText(e));
      } finally {
        exporting.value = "";
      }
    }
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
          createBaseVNode("button", {
            class: "btn sm",
            disabled: loading.value,
            onClick: _cache[0] || (_cache[0] = ($event) => load())
          }, "刷新", 8, _hoisted_5),
          exporting.value ? (openBlock(), createElementBlock("span", _hoisted_6, "导出中…")) : createCommentVNode("", true),
          _cache[13] || (_cache[13] = createBaseVNode("span", {
            class: "muted",
            style: { "font-size": "12px" }
          }, "服务端缓存 5 秒；今天的数据包含尚未落库的实时增量", -1))
        ]),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
          _cache[14] || (_cache[14] = createBaseVNode("b", null, "加载失败", -1)),
          createBaseVNode("span", _hoisted_8, toDisplayString(error.value), 1),
          createBaseVNode("button", {
            class: "btn sm",
            onClick: _cache[1] || (_cache[1] = ($event) => load())
          }, "重试")
        ])) : createCommentVNode("", true),
        loading.value && !modules.value ? (openBlock(), createElementBlock("div", _hoisted_9, [..._cache[15] || (_cache[15] = [
          createBaseVNode("div", { class: "body" }, [
            createBaseVNode("div", {
              class: "sk",
              style: { "height": "240px" }
            }),
            createBaseVNode("div", {
              class: "sk sk-row",
              style: { "width": "60%" }
            }),
            createBaseVNode("div", {
              class: "sk sk-row",
              style: { "width": "85%" }
            })
          ], -1)
        ])])) : !error.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("div", _hoisted_10, [
            createBaseVNode("h2", null, [
              _cache[16] || (_cache[16] = createTextVNode(" 模块浏览 ", -1)),
              _cache[17] || (_cache[17] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[2] || (_cache[2] = ($event) => exportReport({ format: "csv", report: "modules" }))
              }, "CSV", 8, _hoisted_11)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[3] || (_cache[3] = ($event) => exportReport({ format: "xlsx", report: "modules" }))
              }, "XLSX", 8, _hoisted_12)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("div", _hoisted_14, [
                createBaseVNode("div", _hoisted_15, [
                  _cache[18] || (_cache[18] = createBaseVNode("div", { class: "adm-pane-t" }, "PV 排行（前 10）", -1)),
                  createVNode(BarChart, {
                    points: moduleBars.value,
                    height: 210,
                    empty: "这段时间没有浏览数据"
                  }, null, 8, ["points"])
                ]),
                createBaseVNode("div", _hoisted_16, [
                  _cache[19] || (_cache[19] = createBaseVNode("div", { class: "adm-pane-t" }, "PV 占比（前 6）", -1)),
                  createVNode(DonutChart, {
                    points: moduleDonut.value,
                    height: 210,
                    "center-label": "总浏览",
                    empty: "暂无占比"
                  }, null, 8, ["points"])
                ])
              ]),
              _cache[21] || (_cache[21] = createBaseVNode("div", {
                class: "adm-pane-t",
                style: { "margin-top": "14px" }
              }, "PV 趋势（前 5 模块）", -1)),
              createVNode(LineChart, {
                series: moduleTrendSeries.value,
                height: 220,
                empty: "暂无趋势数据"
              }, null, 8, ["series"]),
              modules.value && modules.value.modules.length ? (openBlock(), createElementBlock("div", _hoisted_17, [
                createBaseVNode("table", null, [
                  _cache[20] || (_cache[20] = createBaseVNode("thead", null, [
                    createBaseVNode("tr", null, [
                      createBaseVNode("th", null, "模块"),
                      createBaseVNode("th", { style: { "width": "100px" } }, "PV"),
                      createBaseVNode("th", { style: { "width": "120px" } }, "UV（人天）"),
                      createBaseVNode("th", { style: { "width": "120px" } }, "单日峰值 UV"),
                      createBaseVNode("th", { style: { "width": "90px" } }, "占比")
                    ])
                  ], -1)),
                  createBaseVNode("tbody", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(modules.value.modules, (m) => {
                      return openBlock(), createElementBlock("tr", {
                        key: m.module
                      }, [
                        createBaseVNode("td", null, toDisplayString(moduleName(m.module)), 1),
                        createBaseVNode("td", null, toDisplayString(m.pv), 1),
                        createBaseVNode("td", null, toDisplayString(m.uv), 1),
                        createBaseVNode("td", null, toDisplayString(m.uvPeak), 1),
                        createBaseVNode("td", _hoisted_18, toDisplayString(m.sharePct) + "%", 1)
                      ]);
                    }), 128))
                  ])
                ])
              ])) : createCommentVNode("", true),
              modules.value && modules.value.liveToday ? (openBlock(), createElementBlock("div", _hoisted_19, " 今日数据 = 已落库 + 尚未回写的实时增量（回写每 5 分钟一次，刚浏览完也能看到） ")) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("div", _hoisted_20, [
            createBaseVNode("h2", null, [
              _cache[22] || (_cache[22] = createTextVNode(" 活跃用户 ", -1)),
              _cache[23] || (_cache[23] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[4] || (_cache[4] = ($event) => exportReport({ format: "csv", report: "active" }))
              }, "CSV", 8, _hoisted_21)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[5] || (_cache[5] = ($event) => exportReport({ format: "xlsx", report: "active" }))
              }, "XLSX", 8, _hoisted_22)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("div", _hoisted_25, [
                  _cache[24] || (_cache[24] = createBaseVNode("div", { class: "k" }, "今日 DAU", -1)),
                  createBaseVNode("div", _hoisted_26, toDisplayString(active.value ? active.value.dau : 0), 1)
                ]),
                createBaseVNode("div", _hoisted_27, [
                  _cache[25] || (_cache[25] = createBaseVNode("div", { class: "k" }, "WAU（近 7 天去重）", -1)),
                  createBaseVNode("div", _hoisted_28, toDisplayString(active.value ? active.value.wau : 0), 1)
                ]),
                createBaseVNode("div", _hoisted_29, [
                  _cache[26] || (_cache[26] = createBaseVNode("div", { class: "k" }, "MAU（近 30 天去重）", -1)),
                  createBaseVNode("div", _hoisted_30, toDisplayString(active.value ? active.value.mau : 0), 1)
                ])
              ]),
              createVNode(LineChart, {
                series: [{ name: "DAU", color: "#165DFF", points: active.value ? active.value.points : [] }],
                height: 200,
                "y-format": (v) => v + " 人",
                empty: "还没有日活数据（每天 00:05 落库）"
              }, null, 8, ["series", "y-format"])
            ])
          ]),
          createBaseVNode("div", _hoisted_31, [
            createBaseVNode("h2", null, [
              _cache[27] || (_cache[27] = createTextVNode(" 内容与治理 ", -1)),
              _cache[28] || (_cache[28] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[6] || (_cache[6] = ($event) => exportReport({ format: "csv", report: "trend", metric: "reports" }))
              }, "举报 CSV", 8, _hoisted_32)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[7] || (_cache[7] = ($event) => exportReport({ format: "csv", report: "trend", metric: "posts" }))
              }, "发帖 CSV", 8, _hoisted_33)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 2,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[8] || (_cache[8] = ($event) => exportReport({ format: "xlsx", report: "breakdown", dim: "report_reason" }))
              }, "举报原因 XLSX", 8, _hoisted_34)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_35, [
              createBaseVNode("div", _hoisted_36, [
                createBaseVNode("div", _hoisted_37, [
                  _cache[29] || (_cache[29] = createBaseVNode("div", { class: "adm-pane-t" }, "举报数", -1)),
                  createVNode(LineChart, {
                    series: [{ name: "举报", color: "#F53F3F", points: reportsTrend.value }],
                    height: 180,
                    empty: "没有举报"
                  }, null, 8, ["series"])
                ]),
                createBaseVNode("div", _hoisted_38, [
                  _cache[30] || (_cache[30] = createBaseVNode("div", { class: "adm-pane-t" }, "举报原因分布", -1)),
                  createVNode(DonutChart, {
                    points: reasonDonut.value,
                    height: 180,
                    "center-label": "举报",
                    empty: "没有举报"
                  }, null, 8, ["points"])
                ])
              ]),
              _cache[31] || (_cache[31] = createBaseVNode("div", {
                class: "adm-pane-t",
                style: { "margin-top": "12px" }
              }, "发帖数", -1)),
              createVNode(LineChart, {
                series: [{ name: "发帖", color: "#00B42A", points: postsTrend.value }],
                height: 180,
                empty: "没有发帖"
              }, null, 8, ["series"])
            ])
          ]),
          createBaseVNode("div", _hoisted_39, [
            createBaseVNode("h2", null, [
              _cache[32] || (_cache[32] = createTextVNode(" 营收 ", -1)),
              _cache[33] || (_cache[33] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[9] || (_cache[9] = ($event) => exportReport({ format: "csv", report: "trend", metric: "revenue" }))
              }, "CSV", 8, _hoisted_40)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[10] || (_cache[10] = ($event) => exportReport({ format: "xlsx", report: "breakdown", dim: "tier" }))
              }, "档位 XLSX", 8, _hoisted_41)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_42, [
              createBaseVNode("div", _hoisted_43, [
                createBaseVNode("div", _hoisted_44, [
                  _cache[34] || (_cache[34] = createBaseVNode("div", { class: "adm-pane-t" }, "每日充值收入（元）", -1)),
                  createVNode(LineChart, {
                    series: [{ name: "收入", color: "#FF7D00", points: revenueTrend.value }],
                    height: 180,
                    "y-format": (v) => v + " 元",
                    empty: "没有充值记录"
                  }, null, 8, ["series", "y-format"])
                ]),
                createBaseVNode("div", _hoisted_45, [
                  _cache[35] || (_cache[35] = createBaseVNode("div", { class: "adm-pane-t" }, "对局档位分布", -1)),
                  createVNode(DonutChart, {
                    points: tierDonut.value,
                    height: 180,
                    "center-label": "对局",
                    empty: "没有对局"
                  }, null, 8, ["points"])
                ])
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_46, [
            createBaseVNode("h2", null, [
              _cache[36] || (_cache[36] = createTextVNode(" 对局质量 ", -1)),
              _cache[37] || (_cache[37] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[11] || (_cache[11] = ($event) => exportReport({ format: "csv", report: "quality" }))
              }, "CSV", 8, _hoisted_47)) : createCommentVNode("", true),
              canExport.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "btn sm",
                disabled: !!exporting.value,
                onClick: _cache[12] || (_cache[12] = ($event) => exportReport({ format: "xlsx", report: "quality" }))
              }, "XLSX", 8, _hoisted_48)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_49, [
              createBaseVNode("div", _hoisted_50, [
                createBaseVNode("div", _hoisted_51, [
                  _cache[38] || (_cache[38] = createBaseVNode("div", { class: "k" }, "平均轮数", -1)),
                  createBaseVNode("div", _hoisted_52, toDisplayString(quality.value ? quality.value.avgTurns : 0), 1)
                ]),
                createBaseVNode("div", _hoisted_53, [
                  _cache[39] || (_cache[39] = createBaseVNode("div", { class: "k" }, "AI 发言占比", -1)),
                  createBaseVNode("div", _hoisted_54, toDisplayString(quality.value ? quality.value.aiRatio : 0) + "%", 1)
                ]),
                createBaseVNode("div", _hoisted_55, [
                  _cache[40] || (_cache[40] = createBaseVNode("div", { class: "k" }, "复盘样本", -1)),
                  createBaseVNode("div", _hoisted_56, toDisplayString(quality.value ? quality.value.samples : 0), 1)
                ])
              ]),
              _cache[41] || (_cache[41] = createBaseVNode("div", { class: "adm-pane-t" }, "六维平均分", -1)),
              createVNode(BarChart, {
                points: qualityBars.value,
                height: 200,
                "y-format": (v) => v + " 分",
                empty: "还没有复盘数据"
              }, null, 8, ["points", "y-format"])
            ])
          ])
        ], 64)) : createCommentVNode("", true)
      ]);
    };
  }
};
const AnalyticsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-01f6e6f8"]]);
export {
  AnalyticsView as default
};
