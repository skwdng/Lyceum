import { _ as _export_sfc, u as useAdminStore, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, e as createCommentVNode, f as withDirectives, G as vModelText, H as withKeys, v as vModelSelect, F as Fragment, r as renderList, i as ref, q as adminApi, m as toast, k as errText, a as openBlock, s as unref, P as fmtTime, n as normalizeClass, O as actionName, p as computed } from "./index-QjTgHLis.js";
import { u as userPop } from "./userPop-PzRW_4zj.js";
import { p as postDrawer } from "./postDrawer-Dqm0X26Y.js";
const _hoisted_1 = { "data-panel": "audit" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  key: 0,
  class: "muted",
  style: { "font-weight": "400", "font-size": "12px" }
};
const _hoisted_4 = { class: "au-bar" };
const _hoisted_5 = ["value"];
const _hoisted_6 = ["value"];
const _hoisted_7 = ["value"];
const _hoisted_8 = ["value"];
const _hoisted_9 = {
  key: 0,
  class: "muted",
  style: { "padding": "20px" }
};
const _hoisted_10 = {
  key: 1,
  class: "muted",
  style: { "padding": "28px", "text-align": "center" }
};
const _hoisted_11 = { key: 2 };
const _hoisted_12 = {
  class: "muted",
  style: { "white-space": "nowrap" }
};
const _hoisted_13 = { style: { "white-space": "nowrap" } };
const _hoisted_14 = {
  key: 0,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_15 = { style: { "white-space": "nowrap" } };
const _hoisted_16 = ["onClick"];
const _hoisted_17 = ["onClick"];
const _hoisted_18 = ["onClick"];
const _hoisted_19 = { style: { "white-space": "nowrap" } };
const _hoisted_20 = {
  key: 0,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_21 = {
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_22 = {
  key: 2,
  class: "tag ok"
};
const _hoisted_23 = { style: { "text-align": "right" } };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_26 = {
  key: 2,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_27 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_28 = {
  key: 3,
  class: "pager"
};
const _hoisted_29 = { class: "muted" };
const _hoisted_30 = ["disabled"];
const _hoisted_31 = ["disabled"];
const _sfc_main = {
  __name: "AuditView",
  setup(__props) {
    const admin = useAdminStore();
    const canRestore = computed(() => admin.has("audit:restore"));
    const audit = ref(null);
    const f = ref({ q: "", adm: "", action: "", verdict: "", targetType: "", source: "", from: "", to: "" });
    const ACTIONS = [
      ["", "全部动作"],
      ["REPORT_RESOLVE", "举报处置 / 内容处置"],
      ["RESTORE", "撤销处理"],
      ["VIDEO_DECIDE", "视频复核"],
      ["VIDEO_RESTORE", "视频恢复"],
      ["TOPIC_APPROVE", "辩题通过"],
      ["TOPIC_REJECT", "辩题驳回"],
      ["TOPIC_OFFLINE", "辩题下架"],
      ["USER_BAN", "全站封禁"],
      ["USER_UNBAN", "解除封禁"],
      ["ADMIN_CREATE", "创建管理员"],
      ["ADMIN_ROLE", "改管理员角色"],
      ["ADMIN_DISABLE", "停用管理员"],
      ["ADMIN_ENABLE", "启用管理员"],
      ["ADMIN_RESET_PWD", "重置管理员密码"]
    ];
    const VERDICTS = [
      ["", "全部结果"],
      ["IGNORE", "忽略"],
      ["DELETE", "删除内容"],
      ["BAN", "禁言"],
      ["DELETE_AND_BAN", "删除+禁言"],
      ["PASS", "通过"],
      ["REJECT", "驳回"],
      ["UNBAN", "解封"]
    ];
    const TARGETS = [
      ["", "全部对象"],
      ["POST", "帖子"],
      ["COMMENT", "评论"],
      ["USER", "用户"],
      ["VIDEO", "视频"],
      ["TOPIC", "辩题"],
      ["ADMIN", "管理员"]
    ];
    const SOURCES = [["", "全部来源"], ["REPORT", "举报"], ["MANUAL", "管理台"]];
    onMounted(() => loadAudit(1));
    function filters() {
      const v = f.value;
      return {
        q: v.q.trim() || void 0,
        admin: v.adm.trim() || void 0,
        action: v.action || void 0,
        verdict: v.verdict || void 0,
        targetType: v.targetType || void 0,
        source: v.source || void 0,
        from: v.from || void 0,
        to: v.to || void 0
      };
    }
    function actionLabel(r) {
      if (r.action === "REPORT_RESOLVE") return r.source === "MANUAL" ? "内容处置" : "举报处置";
      if (r.action === "RESTORE") return r.source === "MANUAL" ? "解除屏蔽" : "撤销处理";
      return actionName(r.action);
    }
    function openTarget(r) {
      if (r.targetType === "POST") return postDrawer.open(r.postId || r.targetId, null);
      if (r.targetType === "COMMENT") {
        if (!r.postId) return toast("这条评论所属的帖子已经不在了");
        return postDrawer.open(r.postId, r.targetId);
      }
    }
    async function loadAudit(page = 1) {
      try {
        audit.value = await adminApi.auditFiltered({ ...filters(), page, size: 20 });
      } catch (e) {
        toast(errText(e));
      }
    }
    function search() {
      loadAudit(1);
    }
    function resetFilters() {
      f.value = { q: "", adm: "", action: "", verdict: "", targetType: "", source: "", from: "", to: "" };
      loadAudit(1);
    }
    async function restoreAudit(id) {
      if (!window.confirm("确认撤销这次处理？内容会重新可见")) return;
      try {
        await adminApi.restoreAudit(id);
        toast("已恢复：内容重新可见（禁言不会一并解除）");
        await Promise.all([
          loadAudit(audit.value ? audit.value.page : 1),
          admin.loadStats()
        ]);
      } catch (e) {
        toast(errText(e));
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[10] || (_cache[10] = createTextVNode(" 处理记录 ", -1)),
            _cache[11] || (_cache[11] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            audit.value ? (openBlock(), createElementBlock("span", _hoisted_3, "共 " + toDisplayString(audit.value.total) + " 条", 1)) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_4, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => f.value.q = $event),
              class: "au-input",
              placeholder: "关键词（详情/操作人/作者）",
              onKeyup: withKeys(search, ["enter"])
            }, null, 544), [
              [vModelText, f.value.q]
            ]),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => f.value.adm = $event),
              class: "au-input",
              style: { "min-width": "130px" },
              placeholder: "操作人（id 或账号）",
              onKeyup: withKeys(search, ["enter"])
            }, null, 544), [
              [vModelText, f.value.adm]
            ]),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => f.value.action = $event),
              class: "au-input",
              style: { "width": "120px" },
              onChange: search
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(ACTIONS, (o) => {
                return createBaseVNode("option", {
                  key: o[0],
                  value: o[0]
                }, toDisplayString(o[1]), 9, _hoisted_5);
              }), 64))
            ], 544), [
              [vModelSelect, f.value.action]
            ]),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => f.value.verdict = $event),
              class: "au-input",
              style: { "width": "130px" },
              onChange: search
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(VERDICTS, (o) => {
                return createBaseVNode("option", {
                  key: o[0],
                  value: o[0]
                }, toDisplayString(o[1]), 9, _hoisted_6);
              }), 64))
            ], 544), [
              [vModelSelect, f.value.verdict]
            ]),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => f.value.targetType = $event),
              class: "au-input",
              style: { "width": "110px" },
              onChange: search
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(TARGETS, (o) => {
                return createBaseVNode("option", {
                  key: o[0],
                  value: o[0]
                }, toDisplayString(o[1]), 9, _hoisted_7);
              }), 64))
            ], 544), [
              [vModelSelect, f.value.targetType]
            ]),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => f.value.source = $event),
              class: "au-input",
              style: { "width": "120px" },
              onChange: search
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(SOURCES, (o) => {
                return createBaseVNode("option", {
                  key: o[0],
                  value: o[0]
                }, toDisplayString(o[1]), 9, _hoisted_8);
              }), 64))
            ], 544), [
              [vModelSelect, f.value.source]
            ]),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => f.value.from = $event),
              class: "au-input",
              style: { "width": "150px" },
              type: "date",
              title: "起始日期",
              onChange: search
            }, null, 544), [
              [vModelText, f.value.from]
            ]),
            _cache[12] || (_cache[12] = createBaseVNode("span", {
              class: "muted",
              style: { "font-size": "12px" }
            }, "至", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => f.value.to = $event),
              class: "au-input",
              style: { "width": "150px" },
              type: "date",
              title: "结束日期",
              onChange: search
            }, null, 544), [
              [vModelText, f.value.to]
            ]),
            createBaseVNode("button", {
              class: "btn primary sm",
              onClick: search
            }, "搜索"),
            createBaseVNode("button", {
              class: "btn sm",
              onClick: resetFilters
            }, "重置")
          ]),
          !audit.value ? (openBlock(), createElementBlock("div", _hoisted_9, "加载中…")) : !(audit.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_10, " 没有符合条件的处理记录 ")) : (openBlock(), createElementBlock("table", _hoisted_11, [
            _cache[16] || (_cache[16] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "130px" } }, "时间"),
                createBaseVNode("th", { style: { "width": "90px" } }, "操作人"),
                createBaseVNode("th", { style: { "width": "140px" } }, "动作"),
                createBaseVNode("th", { style: { "width": "110px" } }, "对象"),
                createBaseVNode("th", { style: { "width": "80px" } }, "来源"),
                createBaseVNode("th", null, "详情"),
                createBaseVNode("th", { style: { "width": "100px" } }, "状态"),
                createBaseVNode("th", { style: { "width": "90px" } })
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(audit.value.items, (r) => {
                return openBlock(), createElementBlock("tr", {
                  key: r.id
                }, [
                  createBaseVNode("td", _hoisted_12, toDisplayString(unref(fmtTime)(r.createdAt)), 1),
                  createBaseVNode("td", null, toDisplayString(r.adminName || "#" + r.adminId), 1),
                  createBaseVNode("td", _hoisted_13, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", r.action === "RESTORE" ? "blue" : r.source === "REPORT" ? "orange" : ""])
                    }, toDisplayString(actionLabel(r)), 3),
                    r.verdict ? (openBlock(), createElementBlock("div", _hoisted_14, toDisplayString(unref(actionName)(r.verdict)), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("td", _hoisted_15, [
                    r.targetType === "USER" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      _cache[13] || (_cache[13] = createTextVNode(" 用户 ", -1)),
                      createBaseVNode("a", {
                        class: "au-link",
                        onClick: ($event) => unref(userPop).open(r.targetOwner, $event)
                      }, toDisplayString(r.targetOwner || ""), 9, _hoisted_16)
                    ], 64)) : r.targetType === "TOPIC" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      createTextVNode("辩题 " + toDisplayString(r.targetOwner || ""), 1)
                    ], 64)) : r.targetType === "VIDEO" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                      createTextVNode("视频 #" + toDisplayString(r.targetId), 1)
                    ], 64)) : r.targetType === "ADMIN" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                      _cache[14] || (_cache[14] = createTextVNode(" 管理员 ", -1)),
                      createBaseVNode("b", null, toDisplayString(r.targetOwner || "#" + r.targetId), 1)
                    ], 64)) : r.targetType === "POST" ? (openBlock(), createElementBlock("a", {
                      key: 4,
                      class: "au-link",
                      onClick: ($event) => openTarget(r)
                    }, "帖子 #" + toDisplayString(r.targetId), 9, _hoisted_17)) : r.targetType === "COMMENT" ? (openBlock(), createElementBlock("a", {
                      key: 5,
                      class: "au-link",
                      onClick: ($event) => openTarget(r)
                    }, "评论 #" + toDisplayString(r.targetId), 9, _hoisted_18)) : (openBlock(), createElementBlock(Fragment, { key: 6 }, [
                      createTextVNode("-")
                    ], 64))
                  ]),
                  createBaseVNode("td", _hoisted_19, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", r.source === "MANUAL" ? "blue" : ""])
                    }, toDisplayString(r.source === "MANUAL" ? "管理台" : "举报"), 3)
                  ]),
                  createBaseVNode("td", null, toDisplayString(r.detail || ""), 1),
                  createBaseVNode("td", null, [
                    r.action === "RESTORE" ? (openBlock(), createElementBlock("span", _hoisted_20, "—")) : r.undone ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      _cache[15] || (_cache[15] = createBaseVNode("span", { class: "tag" }, "已撤销", -1)),
                      createBaseVNode("div", _hoisted_21, toDisplayString(unref(fmtTime)(r.undoAt)), 1)
                    ], 64)) : (openBlock(), createElementBlock("span", _hoisted_22, "生效中"))
                  ]),
                  createBaseVNode("td", _hoisted_23, [
                    r.action !== "RESTORE" && !r.undone ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      r.canRestore && canRestore.value ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        class: "btn sm danger",
                        onClick: ($event) => restoreAudit(r.id)
                      }, "恢复", 8, _hoisted_24)) : r.canRestore ? (openBlock(), createElementBlock("span", _hoisted_25, "无撤销权限")) : (openBlock(), createElementBlock("span", _hoisted_26, "不可恢复"))
                    ], 64)) : r.action !== "RESTORE" ? (openBlock(), createElementBlock("span", _hoisted_27, "已撤销")) : createCommentVNode("", true)
                  ])
                ]);
              }), 128))
            ])
          ])),
          audit.value && audit.value.total > audit.value.size ? (openBlock(), createElementBlock("div", _hoisted_28, [
            createBaseVNode("span", _hoisted_29, "共 " + toDisplayString(audit.value.total) + " 条 · 第 " + toDisplayString(audit.value.page) + " 页", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: audit.value.page <= 1,
              onClick: _cache[8] || (_cache[8] = ($event) => loadAudit(audit.value.page - 1))
            }, "上一页", 8, _hoisted_30),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: audit.value.page >= Math.ceil(audit.value.total / audit.value.size),
              onClick: _cache[9] || (_cache[9] = ($event) => loadAudit(audit.value.page + 1))
            }, " 下一页 ", 8, _hoisted_31)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const AuditView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-9e115ead"]]);
export {
  AuditView as default
};
