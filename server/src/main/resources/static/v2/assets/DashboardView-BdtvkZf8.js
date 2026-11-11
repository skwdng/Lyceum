import { u as useAdminStore } from "./admin-CzrI9OMV.js";
import { c as createElementBlock, d as createBaseVNode, t as toDisplayString, u as unref, k as openBlock } from "./index-CNvC6fMv.js";
const _hoisted_1 = { "data-panel": "dashboard" };
const _hoisted_2 = { class: "cards" };
const _hoisted_3 = { class: "card" };
const _hoisted_4 = { class: "v" };
const _hoisted_5 = { class: "card" };
const _hoisted_6 = { class: "v" };
const _hoisted_7 = { class: "card" };
const _hoisted_8 = { class: "v" };
const _sfc_main = {
  __name: "DashboardView",
  setup(__props) {
    const admin = useAdminStore();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[0] || (_cache[0] = createBaseVNode("div", { class: "k" }, "待处理举报", -1)),
            createBaseVNode("div", _hoisted_4, toDisplayString(unref(admin).pendingCount), 1)
          ]),
          createBaseVNode("div", _hoisted_5, [
            _cache[1] || (_cache[1] = createBaseVNode("div", { class: "k" }, "今日新增", -1)),
            createBaseVNode("div", _hoisted_6, toDisplayString(unref(admin).stats && unref(admin).stats.todayReports || 0), 1)
          ]),
          createBaseVNode("div", _hoisted_7, [
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "k" }, "禁言中用户", -1)),
            createBaseVNode("div", _hoisted_8, toDisplayString(unref(admin).stats && unref(admin).stats.bannedUsers || 0), 1)
          ])
        ])
      ]);
    };
  }
};
export {
  _sfc_main as default
};
