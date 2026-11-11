import { o as onMounted, c as createElementBlock, d as createBaseVNode, x as createTextVNode, F as Fragment, e as renderList, t as toDisplayString, f as createCommentVNode, y as withModifiers, u as unref, p as withDirectives, v as vModelText, z as vModelSelect, r as ref, A as adminApi, s as toast, k as openBlock, n as normalizeClass } from "./index-KN7ZVkHG.js";
import { u as useAdminStore, r as reasonName, e as errText, a as actionName, f as fmtTime } from "./admin-DYeu0943.js";
const _hoisted_1 = { "data-panel": "reports" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = ["onClick"];
const _hoisted_4 = {
  key: 0,
  class: "muted",
  style: { "padding": "20px" }
};
const _hoisted_5 = {
  key: 1,
  class: "muted",
  style: { "padding": "28px", "text-align": "center" }
};
const _hoisted_6 = { key: 2 };
const _hoisted_7 = { style: { "font-weight": "600" } };
const _hoisted_8 = {
  class: "muted",
  style: { "font-size": "12px", "margin-top": "2px" }
};
const _hoisted_9 = {
  key: 0,
  class: "tag"
};
const _hoisted_10 = {
  key: 0,
  class: "tag red"
};
const _hoisted_11 = { class: "muted" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = {
  key: 3,
  class: "pager"
};
const _hoisted_14 = { class: "muted" };
const _hoisted_15 = ["disabled"];
const _hoisted_16 = ["disabled"];
const _hoisted_17 = {
  class: "modal",
  style: { "width": "620px" }
};
const _hoisted_18 = { class: "body" };
const _hoisted_19 = {
  key: 0,
  class: "muted",
  style: { "font-size": "12.5px", "margin-bottom": "10px" }
};
const _hoisted_20 = {
  class: "card",
  style: { "background": "#f7f8fa", "border": "1px solid #eff0f1", "border-radius": "10px", "padding": "12px 14px" }
};
const _hoisted_21 = { style: { "font-weight": "600" } };
const _hoisted_22 = {
  class: "muted",
  style: { "font-size": "12px", "margin-top": "4px" }
};
const _hoisted_23 = {
  key: 0,
  style: { "margin-top": "8px", "font-size": "12.5px" }
};
const _hoisted_24 = { class: "foot" };
const _sfc_main = {
  __name: "ReportsView",
  setup(__props) {
    const admin = useAdminStore();
    const reports = ref(null);
    const reportStatus = ref("PENDING");
    const detail = ref(null);
    const note = ref("");
    const banDays = ref(7);
    onMounted(() => loadReports(1));
    async function loadReports(page = 1, status) {
      if (status) reportStatus.value = status;
      try {
        reports.value = await adminApi.reports(reportStatus.value, page, 20);
      } catch (e) {
        toast(errText(e));
      }
    }
    async function openDetail(reportId) {
      detail.value = null;
      note.value = "";
      try {
        detail.value = await adminApi.report(reportId);
      } catch (e) {
        toast(errText(e));
      }
    }
    async function resolveReport(action) {
      const d = detail.value;
      if (!d || !d.report) return;
      const body = { action, note: note.value.trim() || null };
      if (action === "BAN" || action === "DELETE_AND_BAN") body.banDays = Number(banDays.value) || 7;
      try {
        await adminApi.resolve(d.report.reportId, body);
        detail.value = null;
        toast("已处理：" + actionName(action));
        await Promise.all([admin.loadStats(), loadReports(reports.value ? reports.value.page : 1)]);
      } catch (e) {
        toast(errText(e));
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[10] || (_cache[10] = createTextVNode(" 举报队列 ", -1)),
            _cache[11] || (_cache[11] = createBaseVNode("span", {
              class: "muted",
              style: { "font-weight": "400" }
            }, "按目标聚合 · 举报人数多的在前", -1)),
            _cache[12] || (_cache[12] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            (openBlock(), createElementBlock(Fragment, null, renderList([["PENDING", "待处理"], ["RESOLVED", "已处理"], ["REJECTED", "已驳回"]], (q) => {
              return createBaseVNode("button", {
                key: q[0],
                class: normalizeClass(["btn sm", { primary: reportStatus.value === q[0] }]),
                onClick: ($event) => loadReports(1, q[0])
              }, toDisplayString(q[1]), 11, _hoisted_3);
            }), 64))
          ]),
          !reports.value ? (openBlock(), createElementBlock("div", _hoisted_4, "加载中…")) : !(reports.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_5, " 没有待处理的举报 🎉 ")) : (openBlock(), createElementBlock("table", _hoisted_6, [
            _cache[13] || (_cache[13] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "72px" } }, "类型"),
                createBaseVNode("th", null, "被举报内容"),
                createBaseVNode("th", { style: { "width": "120px" } }, "举报人数"),
                createBaseVNode("th", { style: { "width": "200px" } }, "原因"),
                createBaseVNode("th", { style: { "width": "130px" } }, "最近"),
                createBaseVNode("th", { style: { "width": "80px" } })
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(reports.value.items, (it) => {
                return openBlock(), createElementBlock("tr", {
                  key: it.firstReportId
                }, [
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", it.targetType === "POST" ? "blue" : "orange"])
                    }, toDisplayString(it.targetType === "POST" ? "帖子" : "评论"), 3)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("div", _hoisted_7, toDisplayString(it.targetSummary || "（内容已删除）"), 1),
                    createBaseVNode("div", _hoisted_8, [
                      createTextVNode(toDisplayString(it.targetAuthor || "") + toDisplayString(it.postId ? " · 帖子 #" + it.postId : "") + " ", 1),
                      !it.targetExists ? (openBlock(), createElementBlock("span", _hoisted_9, "目标已删除")) : createCommentVNode("", true)
                    ])
                  ]),
                  createBaseVNode("td", null, [
                    createTextVNode(toDisplayString(it.reporterCount) + " 人 ", 1),
                    it.multiReport ? (openBlock(), createElementBlock("span", _hoisted_10, "多人举报")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("td", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(it.reasons || [], (r) => {
                      return openBlock(), createElementBlock("span", {
                        key: r,
                        class: "tag"
                      }, toDisplayString(unref(reasonName)(r)), 1);
                    }), 128))
                  ]),
                  createBaseVNode("td", _hoisted_11, toDisplayString(unref(fmtTime)(it.lastAt)), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("button", {
                      class: "btn sm primary",
                      onClick: ($event) => openDetail(it.firstReportId)
                    }, "处理", 8, _hoisted_12)
                  ])
                ]);
              }), 128))
            ])
          ])),
          reports.value && reports.value.total > reports.value.size ? (openBlock(), createElementBlock("div", _hoisted_13, [
            createBaseVNode("span", _hoisted_14, "共 " + toDisplayString(reports.value.total) + " 条 · 第 " + toDisplayString(reports.value.page) + " 页", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: reports.value.page <= 1,
              onClick: _cache[0] || (_cache[0] = ($event) => loadReports(reports.value.page - 1))
            }, "上一页", 8, _hoisted_15),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: reports.value.page >= Math.ceil(reports.value.total / reports.value.size),
              onClick: _cache[1] || (_cache[1] = ($event) => loadReports(reports.value.page + 1))
            }, " 下一页 ", 8, _hoisted_16)
          ])) : createCommentVNode("", true)
        ]),
        detail.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "mask",
          onClick: _cache[9] || (_cache[9] = withModifiers(($event) => detail.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_17, [
            _cache[17] || (_cache[17] = createBaseVNode("h3", null, "处理举报", -1)),
            createBaseVNode("div", _hoisted_18, [
              detail.value.report ? (openBlock(), createElementBlock("div", _hoisted_19, toDisplayString(detail.value.report.targetType === "POST" ? "帖子" : "评论") + " · 举报人 " + toDisplayString(detail.value.report.reporterName || detail.value.report.reporterId) + " · " + toDisplayString(unref(reasonName)(detail.value.report.reason)), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_20, [
                createBaseVNode("div", _hoisted_21, toDisplayString(detail.value.target && detail.value.target.summary || detail.value.report.targetSummary || "（内容已删除）"), 1),
                createBaseVNode("div", _hoisted_22, " 作者 " + toDisplayString(detail.value.target && detail.value.target.author || "-"), 1),
                detail.value.report.detail ? (openBlock(), createElementBlock("div", _hoisted_23, " 补充：" + toDisplayString(detail.value.report.detail), 1)) : createCommentVNode("", true)
              ]),
              _cache[15] || (_cache[15] = createBaseVNode("label", { style: { "margin-top": "12px", "display": "block" } }, "处理备注（可选）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => note.value = $event),
                placeholder: "写明依据，会记进审计",
                style: { "width": "100%" }
              }, null, 512), [
                [vModelText, note.value]
              ]),
              _cache[16] || (_cache[16] = createBaseVNode("label", { style: { "margin-top": "12px", "display": "block" } }, "禁言天数（选择「禁言」时生效）", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => banDays.value = $event),
                style: { "width": "140px" }
              }, [..._cache[14] || (_cache[14] = [
                createBaseVNode("option", { value: 1 }, "1 天", -1),
                createBaseVNode("option", { value: 3 }, "3 天", -1),
                createBaseVNode("option", { value: 7 }, "7 天", -1),
                createBaseVNode("option", { value: 30 }, "30 天", -1)
              ])], 512), [
                [vModelSelect, banDays.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_24, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[4] || (_cache[4] = ($event) => detail.value = null)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[5] || (_cache[5] = ($event) => resolveReport("IGNORE"))
              }, "忽略"),
              createBaseVNode("button", {
                class: "btn warn",
                onClick: _cache[6] || (_cache[6] = ($event) => resolveReport("BAN"))
              }, "禁言"),
              createBaseVNode("button", {
                class: "btn danger",
                onClick: _cache[7] || (_cache[7] = ($event) => resolveReport("DELETE"))
              }, "删除内容"),
              createBaseVNode("button", {
                class: "btn danger",
                onClick: _cache[8] || (_cache[8] = ($event) => resolveReport("DELETE_AND_BAN"))
              }, "删除并禁言")
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
export {
  _sfc_main as default
};
