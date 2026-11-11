import { o as onMounted, c as createElementBlock, d as createBaseVNode, x as createTextVNode, F as Fragment, e as renderList, t as toDisplayString, f as createCommentVNode, r as ref, H as adminApi, s as toast, k as openBlock, u as unref, n as normalizeClass } from "./index-DGMQj2O6.js";
import { u as useAdminStore } from "./admin-fgwnEZDm.js";
import { e as errText, f as fmtTime, a as actionName } from "./helpers-DTG4n1BK.js";
const _hoisted_1 = { "data-panel": "audit" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  key: 0,
  class: "muted",
  style: { "padding": "20px" }
};
const _hoisted_4 = {
  key: 1,
  class: "muted",
  style: { "padding": "28px", "text-align": "center" }
};
const _hoisted_5 = { key: 2 };
const _hoisted_6 = {
  class: "muted",
  style: { "white-space": "nowrap" }
};
const _hoisted_7 = { style: { "white-space": "nowrap" } };
const _hoisted_8 = {
  key: 0,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_9 = { style: { "white-space": "nowrap" } };
const _hoisted_10 = {
  key: 0,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_11 = {
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_12 = {
  key: 2,
  class: "tag ok"
};
const _hoisted_13 = { style: { "text-align": "right" } };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_16 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_17 = {
  key: 3,
  class: "pager"
};
const _hoisted_18 = { class: "muted" };
const _hoisted_19 = ["disabled"];
const _hoisted_20 = ["disabled"];
const _sfc_main = {
  __name: "AuditView",
  setup(__props) {
    const admin = useAdminStore();
    const audit = ref(null);
    onMounted(() => loadAudit(1));
    async function loadAudit(page = 1) {
      try {
        audit.value = await adminApi.audit(page, 20);
      } catch (e) {
        toast(errText(e));
      }
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
          _cache[4] || (_cache[4] = createBaseVNode("h2", null, [
            createTextVNode("处理记录"),
            createBaseVNode("span", { class: "spacer" })
          ], -1)),
          !audit.value ? (openBlock(), createElementBlock("div", _hoisted_3, "加载中…")) : !(audit.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_4, " 还没有处理记录 ")) : (openBlock(), createElementBlock("table", _hoisted_5, [
            _cache[3] || (_cache[3] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "130px" } }, "时间"),
                createBaseVNode("th", { style: { "width": "90px" } }, "操作人"),
                createBaseVNode("th", { style: { "width": "140px" } }, "动作"),
                createBaseVNode("th", { style: { "width": "110px" } }, "对象"),
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
                  createBaseVNode("td", _hoisted_6, toDisplayString(unref(fmtTime)(r.createdAt)), 1),
                  createBaseVNode("td", null, toDisplayString(r.adminName || "#" + r.adminId), 1),
                  createBaseVNode("td", _hoisted_7, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", r.action === "RESTORE" ? "blue" : "orange"])
                    }, toDisplayString(unref(actionName)(r.action)), 3),
                    r.verdict ? (openBlock(), createElementBlock("div", _hoisted_8, toDisplayString(unref(actionName)(r.verdict)), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("td", _hoisted_9, toDisplayString(r.targetType ? (r.targetType === "POST" ? "帖子" : "评论") + " #" + r.targetId : "-"), 1),
                  createBaseVNode("td", null, toDisplayString(r.detail || ""), 1),
                  createBaseVNode("td", null, [
                    r.action === "RESTORE" ? (openBlock(), createElementBlock("span", _hoisted_10, "—")) : r.undone ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      _cache[2] || (_cache[2] = createBaseVNode("span", { class: "tag" }, "已撤销", -1)),
                      createBaseVNode("div", _hoisted_11, toDisplayString(unref(fmtTime)(r.undoAt)), 1)
                    ], 64)) : (openBlock(), createElementBlock("span", _hoisted_12, "生效中"))
                  ]),
                  createBaseVNode("td", _hoisted_13, [
                    r.action !== "RESTORE" && !r.undone ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      r.canRestore ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        class: "btn sm danger",
                        onClick: ($event) => restoreAudit(r.id)
                      }, "恢复", 8, _hoisted_14)) : (openBlock(), createElementBlock("span", _hoisted_15, "不可恢复"))
                    ], 64)) : r.action !== "RESTORE" ? (openBlock(), createElementBlock("span", _hoisted_16, "已撤销")) : createCommentVNode("", true)
                  ])
                ]);
              }), 128))
            ])
          ])),
          audit.value && audit.value.total > audit.value.size ? (openBlock(), createElementBlock("div", _hoisted_17, [
            createBaseVNode("span", _hoisted_18, "共 " + toDisplayString(audit.value.total) + " 条 · 第 " + toDisplayString(audit.value.page) + " 页", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: audit.value.page <= 1,
              onClick: _cache[0] || (_cache[0] = ($event) => loadAudit(audit.value.page - 1))
            }, "上一页", 8, _hoisted_19),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: audit.value.page >= Math.ceil(audit.value.total / audit.value.size),
              onClick: _cache[1] || (_cache[1] = ($event) => loadAudit(audit.value.page + 1))
            }, " 下一页 ", 8, _hoisted_20)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
export {
  _sfc_main as default
};
