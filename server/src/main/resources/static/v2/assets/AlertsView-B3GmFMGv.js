import { _ as _export_sfc, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, s as unref, n as normalizeClass, F as Fragment, r as renderList, e as createCommentVNode, h as withModifiers, f as withDirectives, G as vModelText, H as withKeys, v as vModelSelect, m as toast, i as ref, p as computed, D as useRouter, a as openBlock, M as fmtTime } from "./index-CwiQzl4-.js";
import { u as useAlertStore } from "./alert-CtS5DYRb.js";
import { u as userPop } from "./userPop-9VvZ5N_m.js";
import { p as postDrawer } from "./postDrawer-6eDHskDo.js";
const _hoisted_1 = {
  class: "panel",
  "data-panel": "alerts"
};
const _hoisted_2 = {
  class: "muted",
  style: { "font-size": "12.5px" }
};
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "al-tabs" };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_7 = { class: "msg" };
const _hoisted_8 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_9 = {
  key: 2,
  class: "tbl-x"
};
const _hoisted_10 = ["data-alert-id", "data-rule"];
const _hoisted_11 = { class: "al-title" };
const _hoisted_12 = { class: "al-sub" };
const _hoisted_13 = { class: "al-rule" };
const _hoisted_14 = { key: 0 };
const _hoisted_15 = { key: 1 };
const _hoisted_16 = { class: "muted" };
const _hoisted_17 = { class: "al-ops" };
const _hoisted_18 = ["disabled", "onClick"];
const _hoisted_19 = ["disabled", "onClick"];
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { key: 0 };
const _hoisted_22 = {
  class: "modal",
  style: { "width": "460px" },
  "data-panel": "alert-ack"
};
const _hoisted_23 = { class: "body" };
const _hoisted_24 = { style: { "font-size": "13px", "line-height": "1.7" } };
const _hoisted_25 = { class: "foot" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = ["disabled"];
const _hoisted_28 = {
  class: "modal",
  style: { "width": "440px" },
  "data-panel": "alert-mute"
};
const _hoisted_29 = { class: "body" };
const _hoisted_30 = ["value"];
const _hoisted_31 = ["value"];
const _hoisted_32 = { class: "foot" };
const _hoisted_33 = ["disabled"];
const _hoisted_34 = ["disabled"];
const _sfc_main = {
  __name: "AlertsView",
  setup(__props) {
    const router = useRouter();
    const alert = useAlertStore();
    const tab = ref("OPEN");
    const ackTarget = ref(null);
    const ackNote = ref("");
    const muteOpen = ref(false);
    const muteRule = ref("USER_REPORT_BURST");
    const muteSpan = ref("1h");
    const busy = ref("");
    const RULES = [
      ["USER_REPORT_BURST", "用户被举报激增"],
      ["POST_REPORT_BURST", "内容被举报激增"],
      ["REPORT_BACKLOG", "举报积压"],
      ["DAU_MISSING", "活跃统计缺失"]
    ];
    const SPANS = [
      ["1h", "1 小时"],
      ["today", "今天剩余时间"],
      ["3d", "3 天"]
    ];
    const rows = computed(() => alert.items || []);
    onMounted(() => alert.refreshList(tab.value));
    function switchTab(t) {
      tab.value = t;
      alert.refreshList(t);
    }
    function levelClass(a) {
      return a.level === "CRIT" ? "al-crit" : "al-warn";
    }
    function statusText(a) {
      if (a.status === "OPEN") return "未处理";
      if (a.status === "ACKED") return "已处理";
      return "已恢复";
    }
    function ruleLabel(k) {
      const hit = RULES.find((r) => r[0] === k);
      return hit ? hit[1] : k;
    }
    function openAck(a) {
      ackTarget.value = a;
      ackNote.value = "";
    }
    async function doAck() {
      const a = ackTarget.value;
      if (!a || busy.value) return;
      busy.value = "ack";
      try {
        const r = await alert.ack(a.id, ackNote.value.trim() || null);
        toast("已标记处理，未处理剩 " + (r && r.unread || 0) + " 条");
        ackTarget.value = null;
      } catch (e) {
        toast(e && e.message || "标记失败");
      } finally {
        busy.value = "";
      }
    }
    async function reopen(a) {
      if (busy.value) return;
      busy.value = "reopen";
      try {
        await alert.reopen(a.id);
        toast("已撤回，回到未处理");
      } catch (e) {
        toast(e && e.message || "撤回失败");
      } finally {
        busy.value = "";
      }
    }
    function goSee(a) {
      const t = a.targetType;
      if (t === "USER") {
        userPop.open(String(a.targetId), window.innerWidth / 2, 160);
        return;
      }
      if (t === "POST" || t === "COMMENT") {
        postDrawer.open(a.targetId, t === "COMMENT" ? a.targetId : null);
        return;
      }
      if (a.ruleKey === "REPORT_BACKLOG") {
        router.push("/admin/reports");
        return;
      }
      if (a.ruleKey === "DAU_MISSING") {
        router.push("/admin/analytics");
        return;
      }
      toast("这条告警没有可跳转的对象");
    }
    function canSee(a) {
      return !!a.targetType || a.ruleKey === "REPORT_BACKLOG" || a.ruleKey === "DAU_MISSING";
    }
    function spanUntil(span) {
      const now = Date.now();
      if (span === "1h") return now + 36e5;
      if (span === "3d") return now + 3 * 864e5;
      const end = /* @__PURE__ */ new Date();
      end.setHours(23, 59, 59, 0);
      return Math.max(now + 6e4, end.getTime());
    }
    async function doMute() {
      if (busy.value) return;
      busy.value = "mute";
      try {
        await alert.mute(muteRule.value, spanUntil(muteSpan.value));
        toast("已静音「" + ruleLabel(muteRule.value) + "」，期间不再产生新告警");
        muteOpen.value = false;
      } catch (e) {
        toast(e && e.message || "静音失败");
      } finally {
        busy.value = "";
      }
    }
    async function doUnmute(m) {
      try {
        await alert.unmute(m.ruleKey);
        toast("已解除静音");
      } catch (e) {
        toast(e && e.message || "解除失败");
      }
    }
    async function doScan() {
      if (busy.value) return;
      busy.value = "scan";
      try {
        const r = await alert.scan();
        toast("扫描完成：新增 " + r.raised + " · 回落 " + r.resolved);
      } catch (e) {
        toast(e && e.message || "扫描失败");
      } finally {
        busy.value = "";
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("h2", null, [
          _cache[11] || (_cache[11] = createTextVNode(" 告警 ", -1)),
          _cache[12] || (_cache[12] = createBaseVNode("span", { class: "spacer" }, null, -1)),
          createBaseVNode("span", _hoisted_2, " 未处理 " + toDisplayString(unref(alert).openTotal) + " · 全部 " + toDisplayString(unref(alert).total), 1),
          createBaseVNode("button", {
            class: "btn sm",
            disabled: busy.value === "scan",
            onClick: doScan
          }, toDisplayString(busy.value === "scan" ? "扫描中…" : "立即扫描"), 9, _hoisted_3),
          createBaseVNode("button", {
            class: "btn sm",
            onClick: _cache[0] || (_cache[0] = ($event) => muteOpen.value = true)
          }, "静音规则")
        ]),
        createBaseVNode("div", _hoisted_4, [
          createBaseVNode("button", {
            class: normalizeClass(["btn sm", { primary: tab.value === "OPEN" }]),
            onClick: _cache[1] || (_cache[1] = ($event) => switchTab("OPEN"))
          }, " 只看未处理 ", 2),
          createBaseVNode("button", {
            class: normalizeClass(["btn sm", { primary: tab.value === "ALL" }]),
            onClick: _cache[2] || (_cache[2] = ($event) => switchTab("ALL"))
          }, " 全部 ", 2),
          _cache[13] || (_cache[13] = createBaseVNode("span", { class: "spacer" }, null, -1)),
          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(alert).mutes, (m) => {
            return openBlock(), createElementBlock("span", {
              key: m.ruleKey,
              class: "al-mute"
            }, [
              createTextVNode(toDisplayString(m.label || ruleLabel(m.ruleKey)) + " 静音至 " + toDisplayString(unref(fmtTime)(m.until)) + " ", 1),
              createBaseVNode("i", {
                onClick: ($event) => doUnmute(m)
              }, "✕", 8, _hoisted_5)
            ]);
          }), 128))
        ]),
        unref(alert).error ? (openBlock(), createElementBlock("div", _hoisted_6, [
          _cache[14] || (_cache[14] = createBaseVNode("b", null, "加载失败", -1)),
          createBaseVNode("span", _hoisted_7, toDisplayString(unref(alert).error), 1),
          createBaseVNode("button", {
            class: "btn sm",
            onClick: _cache[3] || (_cache[3] = ($event) => unref(alert).refreshList(tab.value))
          }, "重试")
        ])) : unref(alert).loading ? (openBlock(), createElementBlock("div", _hoisted_8, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_9, [
          createBaseVNode("table", null, [
            _cache[16] || (_cache[16] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "70px" } }, "级别"),
                createBaseVNode("th", null, "告警"),
                createBaseVNode("th", { style: { "width": "80px" } }, "实际值"),
                createBaseVNode("th", { style: { "width": "150px" } }, "最近触发"),
                createBaseVNode("th", { style: { "width": "90px" } }, "状态"),
                createBaseVNode("th", { style: { "width": "190px" } }, "操作")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(rows.value, (a) => {
                return openBlock(), createElementBlock("tr", {
                  key: a.id,
                  "data-alert-id": a.id,
                  "data-rule": a.ruleKey
                }, [
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["al-lv", levelClass(a)])
                    }, toDisplayString(a.level), 3)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("div", _hoisted_11, toDisplayString(a.title), 1),
                    createBaseVNode("div", _hoisted_12, [
                      createBaseVNode("span", _hoisted_13, toDisplayString(a.ruleLabel || ruleLabel(a.ruleKey)), 1),
                      a.detail ? (openBlock(), createElementBlock("span", _hoisted_14, " · " + toDisplayString(a.detail), 1)) : createCommentVNode("", true),
                      a.ackedAt ? (openBlock(), createElementBlock("span", _hoisted_15, [
                        createTextVNode(" · " + toDisplayString(a.ackedBy) + " " + toDisplayString(unref(fmtTime)(a.ackedAt)) + " ", 1),
                        a.ackedNote ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                          createTextVNode("「" + toDisplayString(a.ackedNote) + "」", 1)
                        ], 64)) : createCommentVNode("", true)
                      ])) : createCommentVNode("", true)
                    ])
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("b", null, toDisplayString(a.metric), 1)
                  ]),
                  createBaseVNode("td", _hoisted_16, toDisplayString(unref(fmtTime)(a.lastSeen)), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["al-st", "st-" + a.status])
                    }, toDisplayString(statusText(a)), 3)
                  ]),
                  createBaseVNode("td", _hoisted_17, [
                    a.status === "OPEN" ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      class: "btn sm primary",
                      disabled: !!busy.value,
                      onClick: ($event) => openAck(a)
                    }, " 已处理 ", 8, _hoisted_18)) : a.status === "ACKED" ? (openBlock(), createElementBlock("button", {
                      key: 1,
                      class: "btn sm",
                      disabled: !!busy.value,
                      onClick: ($event) => reopen(a)
                    }, " 撤回 ", 8, _hoisted_19)) : createCommentVNode("", true),
                    canSee(a) ? (openBlock(), createElementBlock("button", {
                      key: 2,
                      class: "btn sm",
                      onClick: ($event) => goSee(a)
                    }, "去看", 8, _hoisted_20)) : createCommentVNode("", true)
                  ])
                ], 8, _hoisted_10);
              }), 128)),
              !rows.value.length ? (openBlock(), createElementBlock("tr", _hoisted_21, [..._cache[15] || (_cache[15] = [
                createBaseVNode("td", {
                  colspan: "6",
                  class: "muted",
                  style: { "text-align": "center", "padding": "26px 0" }
                }, " 没有告警。扫描每 5 分钟自动跑一次，也可以点右上角「立即扫描」。 ", -1)
              ])])) : createCommentVNode("", true)
            ])
          ])
        ])),
        _cache[24] || (_cache[24] = createBaseVNode("p", {
          class: "muted",
          style: { "font-size": "12px", "margin-top": "12px" }
        }, [
          createTextVNode(" 阈值与规则在 "),
          createBaseVNode("code", null, "AlertRule.java"),
          createTextVNode("（验证期 3，上线改 30）；每 5 分钟自动扫一次。 「已处理」只改告警自己的状态，不写进处理记录页。 ")
        ], -1)),
        ackTarget.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "mask",
          onClick: _cache[6] || (_cache[6] = withModifiers(($event) => ackTarget.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_22, [
            _cache[19] || (_cache[19] = createBaseVNode("h3", null, "标记已处理", -1)),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("p", _hoisted_24, toDisplayString(ackTarget.value.title), 1),
              _cache[17] || (_cache[17] = createBaseVNode("label", { class: "al-lb" }, "备注（可空，会显示在「全部」视图里）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => ackNote.value = $event),
                class: "al-input",
                maxlength: "200",
                "data-ack-note": "",
                placeholder: "例如：已联系当事人 / 已知问题，正在修",
                onKeyup: withKeys(doAck, ["enter"])
              }, null, 544), [
                [vModelText, ackNote.value]
              ]),
              _cache[18] || (_cache[18] = createBaseVNode("p", {
                class: "muted",
                style: { "font-size": "11.5px", "margin-top": "8px" }
              }, " 处理后当天不会为同一个对象再提醒；指标回落会自动恢复，已处理的不会来回跳。 ", -1))
            ]),
            createBaseVNode("div", _hoisted_25, [
              createBaseVNode("button", {
                class: "btn",
                disabled: busy.value === "ack",
                onClick: _cache[5] || (_cache[5] = ($event) => ackTarget.value = null)
              }, "取消", 8, _hoisted_26),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: busy.value === "ack",
                onClick: doAck
              }, toDisplayString(busy.value === "ack" ? "提交中…" : "标记已处理"), 9, _hoisted_27)
            ])
          ])
        ])) : createCommentVNode("", true),
        muteOpen.value ? (openBlock(), createElementBlock("div", {
          key: 4,
          class: "mask",
          onClick: _cache[10] || (_cache[10] = withModifiers(($event) => muteOpen.value = false, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_28, [
            _cache[23] || (_cache[23] = createBaseVNode("h3", null, "静音规则", -1)),
            createBaseVNode("div", _hoisted_29, [
              _cache[20] || (_cache[20] = createBaseVNode("label", { class: "al-lb" }, "规则", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => muteRule.value = $event),
                class: "al-input"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(RULES, (r) => {
                  return createBaseVNode("option", {
                    key: r[0],
                    value: r[0]
                  }, toDisplayString(r[1]), 9, _hoisted_30);
                }), 64))
              ], 512), [
                [vModelSelect, muteRule.value]
              ]),
              _cache[21] || (_cache[21] = createBaseVNode("label", {
                class: "al-lb",
                style: { "margin-top": "12px" }
              }, "静音时长", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => muteSpan.value = $event),
                class: "al-input"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(SPANS, (s) => {
                  return createBaseVNode("option", {
                    key: s[0],
                    value: s[0]
                  }, toDisplayString(s[1]), 9, _hoisted_31);
                }), 64))
              ], 512), [
                [vModelSelect, muteSpan.value]
              ]),
              _cache[22] || (_cache[22] = createBaseVNode("p", {
                class: "muted",
                style: { "font-size": "11.5px", "margin-top": "10px" }
              }, [
                createTextVNode(" 静音期间"),
                createBaseVNode("b", null, "不再产生新告警"),
                createTextVNode("，已经存在的照常显示（该处理的还是要处理）。 ")
              ], -1))
            ]),
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("button", {
                class: "btn",
                disabled: busy.value === "mute",
                onClick: _cache[9] || (_cache[9] = ($event) => muteOpen.value = false)
              }, "取消", 8, _hoisted_33),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: busy.value === "mute",
                onClick: doMute
              }, toDisplayString(busy.value === "mute" ? "提交中…" : "确定静音"), 9, _hoisted_34)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const AlertsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5b6f4c1c"]]);
export {
  AlertsView as default
};
