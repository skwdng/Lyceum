import { _ as _export_sfc, o as onMounted, c as createElementBlock, d as createBaseVNode, x as createTextVNode, t as toDisplayString, F as Fragment, e as renderList, f as createCommentVNode, D as withModifiers, p as withDirectives, v as vModelText, h as computed, r as ref, J as videoAuditApi, s as toast, k as openBlock, n as normalizeClass } from "./index-CxdOnLWl.js";
import { e as errText } from "./helpers-CAoXNPN6.js";
const _hoisted_1 = { "data-panel": "video-audit" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  class: "muted",
  style: { "font-weight": "400", "font-size": "12px" }
};
const _hoisted_4 = { class: "body" };
const _hoisted_5 = { class: "va-bar" };
const _hoisted_6 = ["onClick"];
const _hoisted_7 = ["disabled"];
const _hoisted_8 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_9 = { class: "msg" };
const _hoisted_10 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_11 = {
  key: 2,
  class: "tbl-x"
};
const _hoisted_12 = { key: 0 };
const _hoisted_13 = { class: "muted" };
const _hoisted_14 = ["title"];
const _hoisted_15 = { class: "va-ops" };
const _hoisted_16 = ["disabled", "onClick"];
const _hoisted_17 = ["disabled", "onClick"];
const _hoisted_18 = ["disabled", "onClick"];
const _hoisted_19 = ["onClick"];
const _hoisted_20 = {
  class: "modal",
  style: { "width": "460px" }
};
const _hoisted_21 = { class: "body" };
const _hoisted_22 = { class: "foot" };
const _hoisted_23 = ["disabled"];
const _hoisted_24 = {
  class: "modal",
  style: { "width": "720px" }
};
const _hoisted_25 = { class: "body" };
const _hoisted_26 = {
  key: 0,
  class: "muted"
};
const _hoisted_27 = { key: 1 };
const _hoisted_28 = { class: "muted" };
const _hoisted_29 = { class: "tag" };
const _hoisted_30 = { class: "muted" };
const _hoisted_31 = { class: "muted" };
const _hoisted_32 = { class: "foot" };
const size = 30;
const _sfc_main = {
  __name: "VideoAuditView",
  setup(__props) {
    const STATUSES = [["REVIEW", "待复核"], ["PASSED", "已通过"], ["REJECTED", "已驳回"], ["ALL", "全部"]];
    const status = ref("REVIEW");
    const list = ref([]);
    const stats = ref(null);
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const logsOpen = ref(false);
    const logs = ref([]);
    const logsVideo = ref(null);
    const rejectOf = ref(null);
    const pendingCount = computed(() => stats.value ? stats.value.pending : 0);
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const res = await videoAuditApi.queue(status.value, size);
        list.value = res.list || [];
        stats.value = res.stats || null;
      } catch (e) {
        error.value = errText(e) || "加载失败";
        list.value = [];
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    async function act(key, fn, msg) {
      if (busy.value) return;
      busy.value = key;
      try {
        await fn();
        toast(msg);
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    const pass = (v) => act("pass" + v.id, () => videoAuditApi.decide(v.id, "PASS", null), `已通过 #${v.id}`);
    function openReject(v) {
      rejectOf.value = { id: v.id, reason: "" };
    }
    function submitReject() {
      const r = rejectOf.value;
      if (!r.reason.trim()) return toast("驳回需要填理由");
      act("reject" + r.id, () => videoAuditApi.decide(r.id, "REJECT", r.reason.trim()), `已驳回 #${r.id}`);
      rejectOf.value = null;
    }
    const restore = (v) => act("restore" + v.id, () => videoAuditApi.restore(v.id), `已恢复 #${v.id}`);
    async function openLogs(v) {
      logsOpen.value = true;
      logs.value = [];
      logsVideo.value = v;
      try {
        const res = await videoAuditApi.logs(v.id);
        logs.value = res.list || [];
        logsVideo.value = res.video || v;
      } catch (e) {
        toast(errText(e));
      }
    }
    function fmt(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    const ts = (v) => typeof v === "number" ? fmt(v) : v ? String(v).slice(0, 16).replace("T", " ") : "";
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[5] || (_cache[5] = createTextVNode(" 视频复核 ", -1)),
            _cache[6] || (_cache[6] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("span", _hoisted_3, " 待复核 " + toDisplayString(pendingCount.value) + " · 共 " + toDisplayString(stats.value ? stats.value.videos : 0) + " · 已通过 " + toDisplayString(stats.value ? stats.value.passed : 0) + " · 已驳回 " + toDisplayString(stats.value ? stats.value.rejected : 0), 1)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              (openBlock(), createElementBlock(Fragment, null, renderList(STATUSES, (s) => {
                return createBaseVNode("button", {
                  key: s[0],
                  class: normalizeClass(["btn sm", { primary: status.value === s[0] }]),
                  onClick: ($event) => {
                    status.value = s[0];
                    load();
                  }
                }, toDisplayString(s[1]), 11, _hoisted_6);
              }), 64)),
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              createBaseVNode("button", {
                class: "btn sm",
                disabled: loading.value,
                onClick: load
              }, "刷新", 8, _hoisted_7)
            ]),
            error.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              _cache[8] || (_cache[8] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_9, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_10, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_11, [
              createBaseVNode("table", null, [
                _cache[10] || (_cache[10] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", { style: { "width": "64px" } }, "ID"),
                    createBaseVNode("th", null, "标题"),
                    createBaseVNode("th", { style: { "width": "130px" } }, "作者"),
                    createBaseVNode("th", { style: { "width": "96px" } }, "审核状态"),
                    createBaseVNode("th", { style: { "width": "96px" } }, "上架"),
                    createBaseVNode("th", { style: { "width": "120px" } }, "理由"),
                    createBaseVNode("th", { style: { "width": "270px" } }, "操作")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  !list.value.length ? (openBlock(), createElementBlock("tr", _hoisted_12, [..._cache[9] || (_cache[9] = [
                    createBaseVNode("td", {
                      colspan: "7",
                      class: "muted",
                      style: { "padding": "22px", "text-align": "center" }
                    }, "这个筛选下没有视频", -1)
                  ])])) : createCommentVNode("", true),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(list.value, (v) => {
                    return openBlock(), createElementBlock("tr", {
                      key: v.id
                    }, [
                      createBaseVNode("td", _hoisted_13, toDisplayString(v.id), 1),
                      createBaseVNode("td", null, toDisplayString(v.title), 1),
                      createBaseVNode("td", null, toDisplayString(v.author || v.user_id), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["tag", v.audit_status === "PASSED" ? "ok" : v.audit_status === "REJECTED" ? "red" : "orange"])
                        }, toDisplayString(v.audit_status), 3)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["tag", v.online ? "ok" : ""])
                        }, toDisplayString(v.online ? "上架" : "下架"), 3)
                      ]),
                      createBaseVNode("td", {
                        class: "muted va-reason",
                        title: v.audit_reason || v.reason
                      }, toDisplayString(v.audit_reason || v.reason || "—"), 9, _hoisted_14),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_15, [
                          createBaseVNode("button", {
                            class: "btn sm",
                            disabled: !!busy.value,
                            onClick: ($event) => pass(v)
                          }, "通过", 8, _hoisted_16),
                          createBaseVNode("button", {
                            class: "btn sm danger",
                            disabled: !!busy.value,
                            onClick: ($event) => openReject(v)
                          }, "驳回", 8, _hoisted_17),
                          createBaseVNode("button", {
                            class: "btn sm",
                            disabled: !!busy.value,
                            onClick: ($event) => restore(v)
                          }, "恢复", 8, _hoisted_18),
                          createBaseVNode("button", {
                            class: "btn sm",
                            onClick: ($event) => openLogs(v)
                          }, "日志", 8, _hoisted_19)
                        ])
                      ])
                    ]);
                  }), 128))
                ])
              ])
            ]))
          ])
        ]),
        rejectOf.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "mask",
          onClick: _cache[2] || (_cache[2] = withModifiers(($event) => rejectOf.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_20, [
            createBaseVNode("h3", null, "驳回视频 #" + toDisplayString(rejectOf.value.id), 1),
            createBaseVNode("div", _hoisted_21, [
              _cache[11] || (_cache[11] = createBaseVNode("label", { class: "va-lb" }, "理由（必填，会写进审核日志）", -1)),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => rejectOf.value.reason = $event),
                class: "va-ta",
                rows: "3",
                maxlength: "200",
                placeholder: "例如：画面含违规内容"
              }, null, 512), [
                [vModelText, rejectOf.value.reason]
              ])
            ]),
            createBaseVNode("div", _hoisted_22, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[1] || (_cache[1] = ($event) => rejectOf.value = null)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn danger",
                disabled: !!busy.value,
                onClick: submitReject
              }, "确定驳回", 8, _hoisted_23)
            ])
          ])
        ])) : createCommentVNode("", true),
        logsOpen.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "mask",
          onClick: _cache[4] || (_cache[4] = withModifiers(($event) => logsOpen.value = false, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_24, [
            createBaseVNode("h3", null, "审核日志 · " + toDisplayString(logsVideo.value ? logsVideo.value.title : ""), 1),
            createBaseVNode("div", _hoisted_25, [
              !logs.value.length ? (openBlock(), createElementBlock("div", _hoisted_26, "没有审核记录")) : (openBlock(), createElementBlock("table", _hoisted_27, [
                _cache[12] || (_cache[12] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", { style: { "width": "60px" } }, "ID"),
                    createBaseVNode("th", { style: { "width": "90px" } }, "来源"),
                    createBaseVNode("th", { style: { "width": "90px" } }, "结果"),
                    createBaseVNode("th", null, "理由"),
                    createBaseVNode("th", { style: { "width": "130px" } }, "操作人"),
                    createBaseVNode("th", { style: { "width": "130px" } }, "时间")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(logs.value, (g) => {
                    return openBlock(), createElementBlock("tr", {
                      key: g.id
                    }, [
                      createBaseVNode("td", _hoisted_28, toDisplayString(g.id), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_29, toDisplayString(g.stage), 1)
                      ]),
                      createBaseVNode("td", null, toDisplayString(g.result), 1),
                      createBaseVNode("td", _hoisted_30, toDisplayString(g.reason), 1),
                      createBaseVNode("td", null, toDisplayString(g.operator), 1),
                      createBaseVNode("td", _hoisted_31, toDisplayString(ts(g.created_at)), 1)
                    ]);
                  }), 128))
                ])
              ]))
            ]),
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[3] || (_cache[3] = ($event) => logsOpen.value = false)
              }, "关闭")
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const VideoAuditView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-38a8c405"]]);
export {
  VideoAuditView as default
};
