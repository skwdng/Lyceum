import { _ as _export_sfc, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, F as Fragment, r as renderList, p as computed, i as ref, V as configApi, O as errText, a as openBlock, e as createCommentVNode, f as withDirectives, v as vModelSelect, G as vModelText, n as normalizeClass, m as toast } from "./index-DP-xkCoN.js";
const _hoisted_1 = {
  class: "panel",
  "data-panel": "config"
};
const _hoisted_2 = {
  class: "muted",
  style: { "font-size": "12.5px" }
};
const _hoisted_3 = { class: "body" };
const _hoisted_4 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_5 = { class: "msg" };
const _hoisted_6 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_7 = ["data-group"];
const _hoisted_8 = { class: "tbl-x" };
const _hoisted_9 = ["data-cfg-key", "data-source"];
const _hoisted_10 = { class: "cfg-label" };
const _hoisted_11 = {
  key: 0,
  class: "cfg-hint"
};
const _hoisted_12 = { class: "cfg-key" };
const _hoisted_13 = ["onUpdate:modelValue"];
const _hoisted_14 = ["onUpdate:modelValue", "min", "max"];
const _hoisted_15 = ["onUpdate:modelValue", "min", "max"];
const _hoisted_16 = ["onUpdate:modelValue"];
const _hoisted_17 = {
  key: 4,
  class: "cfg-hint"
};
const _hoisted_18 = {
  key: 5,
  class: "cfg-err",
  "data-cfg-error": ""
};
const _hoisted_19 = ["data-source"];
const _hoisted_20 = { class: "muted" };
const _hoisted_21 = { class: "cfg-ops" };
const _hoisted_22 = ["disabled", "onClick"];
const _hoisted_23 = ["onClick"];
const _hoisted_24 = {
  key: 0,
  class: "cfg-histrow"
};
const _hoisted_25 = { colspan: "6" };
const _hoisted_26 = ["data-cfg-hist"];
const _hoisted_27 = {
  key: 0,
  class: "muted"
};
const _hoisted_28 = {
  key: 1,
  class: "muted"
};
const _hoisted_29 = { key: 2 };
const _hoisted_30 = ["data-cfg-log"];
const _hoisted_31 = { class: "muted" };
const _hoisted_32 = { class: "muted" };
const _hoisted_33 = ["disabled", "onClick"];
const _sfc_main = {
  __name: "ConfigView",
  setup(__props) {
    const items = ref([]);
    const groups = ref([]);
    const loading = ref(true);
    const error = ref("");
    const drafts = ref({});
    const busy = ref("");
    const rowErrors = ref({});
    const histories = ref({});
    const itemsOf = (group) => items.value.filter((it) => it.group === group);
    const dirty = (it) => drafts.value[it.key] !== void 0 && drafts.value[it.key] !== it.value;
    const isBool = (it) => it.type === "BOOL";
    function fmt(ms) {
      if (!ms) return "—";
      const d = new Date(Number(ms));
      const p2 = (n) => String(n).padStart(2, "0");
      return d.getMonth() + 1 + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    }
    function rangeText(it) {
      if (it.type !== "INT" && it.type !== "DOUBLE") return "";
      if (it.min === null && it.max === null) return "";
      const kind = it.type === "DOUBLE" ? "小数，" : "";
      if (it.min !== null && it.max !== null) return kind + "范围 " + it.min + " - " + it.max;
      return kind + (it.min !== null ? "不小于 " + it.min : "不大于 " + it.max);
    }
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await configApi.list();
        items.value = r && r.items || [];
        groups.value = r && r.groups || [];
        const next = {};
        for (const it of items.value) next[it.key] = it.value;
        drafts.value = next;
      } catch (e) {
        error.value = errText(e);
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    function localError(it, raw) {
      const v = String(raw === void 0 || raw === null ? "" : raw).trim();
      if (it.type === "BOOL") {
        return v === "true" || v === "false" ? "" : "只能是 开 或 关";
      }
      if (it.type === "INT") {
        if (!/^-?\d+$/.test(v)) return "必须是整数";
        const n = Number(v);
        if (it.min !== null && it.min !== void 0 && n < it.min) return "不能小于 " + it.min;
        if (it.max !== null && it.max !== void 0 && n > it.max) return "不能大于 " + it.max;
        return "";
      }
      if (it.type === "DOUBLE") {
        if (!/^-?(\d+\.?\d*|\.\d+)$/.test(v)) return "必须是数字（可带小数）";
        const n = Number(v);
        if (!Number.isFinite(n)) return "必须是有限的数字";
        if (it.min !== null && it.min !== void 0 && n < it.min) return "不能小于 " + it.min;
        if (it.max !== null && it.max !== void 0 && n > it.max) return "不能大于 " + it.max;
        return "";
      }
      if (!v) return "不能为空";
      if (v.length > 500) return "太长（最多 500 字符）";
      if (it.key === "ai.tiers.basic.base-url" && !/^https?:\/\//.test(v)) {
        return "地址要以 http:// 或 https:// 开头";
      }
      return "";
    }
    function patchItem(next) {
      const i = items.value.findIndex((x) => x.key === next.key);
      if (i >= 0) items.value.splice(i, 1, next);
      drafts.value[next.key] = next.value;
    }
    async function save(it) {
      const value = drafts.value[it.key];
      const bad = localError(it, value);
      rowErrors.value[it.key] = bad;
      if (bad) return;
      busy.value = it.key;
      try {
        const r = await configApi.set(it.key, String(value).trim());
        if (r && r.item) patchItem(r.item);
        toast(it.effectLabel === "立即生效" ? "已保存「" + it.label + "」，立即生效" : "已保存「" + it.label + "」，下次扫描生效");
        if (histories.value[it.key] && histories.value[it.key].open) await loadHistory(it);
      } catch (e) {
        rowErrors.value[it.key] = errText(e);
      } finally {
        busy.value = "";
      }
    }
    async function loadHistory(it) {
      const st = histories.value[it.key] || { open: true, loading: false, items: [] };
      st.loading = true;
      histories.value = { ...histories.value, [it.key]: st };
      try {
        const r = await configApi.log(it.key, 20);
        st.items = r && r.items || [];
      } catch (e) {
        toast(errText(e));
        st.items = [];
      } finally {
        st.loading = false;
        histories.value = { ...histories.value, [it.key]: { ...st } };
      }
    }
    async function toggleHistory(it) {
      const st = histories.value[it.key];
      if (st && st.open) {
        histories.value = { ...histories.value, [it.key]: { ...st, open: false } };
        return;
      }
      histories.value = { ...histories.value, [it.key]: { open: true, loading: true, items: st && st.items || [] } };
      await loadHistory(it);
    }
    function oldText(it, row) {
      return row.oldValue === null || row.oldValue === void 0 ? "（默认 " + it.defaultValue + "）" : row.oldValue;
    }
    async function rollback(it, row) {
      const msg = "把「" + it.label + "」回滚到 " + oldText(it, row) + " 吗？回滚本身也会记一条历史。";
      if (!window.confirm(msg)) return;
      busy.value = it.key;
      try {
        const r = await configApi.rollback(row.id);
        if (r && r.item) patchItem(r.item);
        toast("已回滚「" + it.label + "」");
        await loadHistory(it);
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    const overridden = computed(() => items.value.filter((it) => it.source === "DB").length);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("h2", null, [
          _cache[0] || (_cache[0] = createTextVNode(" 参数管理 ", -1)),
          _cache[1] || (_cache[1] = createBaseVNode("span", { class: "spacer" }, null, -1)),
          createBaseVNode("span", _hoisted_2, " 仅超管 · " + toDisplayString(overridden.value) + " / " + toDisplayString(items.value.length) + " 项已改过 ", 1)
        ]),
        createBaseVNode("div", _hoisted_3, [
          _cache[7] || (_cache[7] = createBaseVNode("p", { class: "muted cfg-intro" }, [
            createTextVNode(" 改完不用重启：标「立即生效」的下一次请求就按新值算；标「下次扫描生效」的要等下一次告警扫描 （或点一次告警页的「立即扫描」）。「来源」写"),
            createBaseVNode("b", null, "默认值"),
            createTextVNode("表示这一项还没被改过， 删掉库里的那行也会回到默认值。 ")
          ], -1)),
          error.value ? (openBlock(), createElementBlock("div", _hoisted_4, [
            _cache[2] || (_cache[2] = createBaseVNode("b", null, "加载失败", -1)),
            createBaseVNode("span", _hoisted_5, toDisplayString(error.value), 1),
            createBaseVNode("button", {
              class: "btn sm",
              onClick: load
            }, "重试")
          ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_6, "加载中…")) : (openBlock(true), createElementBlock(Fragment, { key: 2 }, renderList(groups.value, (g) => {
            return openBlock(), createElementBlock("section", {
              key: g,
              class: "cfg-group",
              "data-group": g
            }, [
              createBaseVNode("h3", null, toDisplayString(g), 1),
              createBaseVNode("div", _hoisted_8, [
                createBaseVNode("table", null, [
                  _cache[6] || (_cache[6] = createBaseVNode("thead", null, [
                    createBaseVNode("tr", null, [
                      createBaseVNode("th", { style: { "width": "34%" } }, "参数"),
                      createBaseVNode("th", { style: { "width": "26%" } }, "值"),
                      createBaseVNode("th", { style: { "width": "110px" } }, "生效"),
                      createBaseVNode("th", { style: { "width": "90px" } }, "来源"),
                      createBaseVNode("th", { style: { "width": "150px" } }, "最后修改"),
                      createBaseVNode("th", { style: { "width": "150px" } }, "操作")
                    ])
                  ], -1)),
                  createBaseVNode("tbody", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(itemsOf(g), (it) => {
                      return openBlock(), createElementBlock(Fragment, {
                        key: it.key
                      }, [
                        createBaseVNode("tr", {
                          "data-cfg-key": it.key,
                          "data-source": it.source
                        }, [
                          createBaseVNode("td", null, [
                            createBaseVNode("b", _hoisted_10, toDisplayString(it.label), 1),
                            it.hint ? (openBlock(), createElementBlock("div", _hoisted_11, toDisplayString(it.hint), 1)) : createCommentVNode("", true),
                            createBaseVNode("div", _hoisted_12, toDisplayString(it.key), 1)
                          ]),
                          createBaseVNode("td", null, [
                            isBool(it) ? withDirectives((openBlock(), createElementBlock("select", {
                              key: 0,
                              "onUpdate:modelValue": ($event) => drafts.value[it.key] = $event,
                              class: "cfg-input",
                              "data-cfg-input": ""
                            }, [..._cache[3] || (_cache[3] = [
                              createBaseVNode("option", { value: "true" }, "开", -1),
                              createBaseVNode("option", { value: "false" }, "关", -1)
                            ])], 8, _hoisted_13)), [
                              [vModelSelect, drafts.value[it.key]]
                            ]) : it.type === "INT" ? withDirectives((openBlock(), createElementBlock("input", {
                              key: 1,
                              "onUpdate:modelValue": ($event) => drafts.value[it.key] = $event,
                              class: "cfg-input",
                              type: "number",
                              step: "1",
                              min: it.min,
                              max: it.max,
                              "data-cfg-input": ""
                            }, null, 8, _hoisted_14)), [
                              [vModelText, drafts.value[it.key]]
                            ]) : it.type === "DOUBLE" ? withDirectives((openBlock(), createElementBlock("input", {
                              key: 2,
                              "onUpdate:modelValue": ($event) => drafts.value[it.key] = $event,
                              class: "cfg-input",
                              type: "number",
                              step: "0.05",
                              min: it.min,
                              max: it.max,
                              "data-cfg-input": ""
                            }, null, 8, _hoisted_15)), [
                              [vModelText, drafts.value[it.key]]
                            ]) : withDirectives((openBlock(), createElementBlock("input", {
                              key: 3,
                              "onUpdate:modelValue": ($event) => drafts.value[it.key] = $event,
                              class: "cfg-input",
                              type: "text",
                              "data-cfg-input": ""
                            }, null, 8, _hoisted_16)), [
                              [vModelText, drafts.value[it.key]]
                            ]),
                            rangeText(it) ? (openBlock(), createElementBlock("div", _hoisted_17, toDisplayString(rangeText(it)), 1)) : createCommentVNode("", true),
                            rowErrors.value[it.key] ? (openBlock(), createElementBlock("div", _hoisted_18, toDisplayString(rowErrors.value[it.key]), 1)) : createCommentVNode("", true)
                          ]),
                          createBaseVNode("td", null, [
                            createBaseVNode("span", {
                              class: normalizeClass(["tag", { ok: it.effect === "NOW" }])
                            }, toDisplayString(it.effectLabel), 3)
                          ]),
                          createBaseVNode("td", null, [
                            createBaseVNode("span", {
                              class: normalizeClass(["cfg-src", { db: it.source === "DB" }]),
                              "data-source": it.source
                            }, toDisplayString(it.sourceLabel), 11, _hoisted_19)
                          ]),
                          createBaseVNode("td", _hoisted_20, toDisplayString(it.updatedBy ? it.updatedBy + " · " + fmt(it.updatedAt) : "—"), 1),
                          createBaseVNode("td", _hoisted_21, [
                            createBaseVNode("button", {
                              class: "btn sm primary",
                              "data-cfg-save": "",
                              disabled: busy.value === it.key || !dirty(it),
                              onClick: ($event) => save(it)
                            }, toDisplayString(busy.value === it.key ? "保存中…" : "保存"), 9, _hoisted_22),
                            createBaseVNode("button", {
                              class: "btn sm",
                              "data-cfg-history": "",
                              onClick: ($event) => toggleHistory(it)
                            }, toDisplayString(histories.value[it.key] && histories.value[it.key].open ? "收起" : "历史"), 9, _hoisted_23)
                          ])
                        ], 8, _hoisted_9),
                        histories.value[it.key] && histories.value[it.key].open ? (openBlock(), createElementBlock("tr", _hoisted_24, [
                          createBaseVNode("td", _hoisted_25, [
                            createBaseVNode("div", {
                              class: "cfg-hist",
                              "data-cfg-hist": it.key
                            }, [
                              histories.value[it.key].loading ? (openBlock(), createElementBlock("div", _hoisted_27, "加载历史…")) : !histories.value[it.key].items.length ? (openBlock(), createElementBlock("div", _hoisted_28, " 还没有改过这一项（默认值 " + toDisplayString(it.defaultValue) + "）。 ", 1)) : (openBlock(), createElementBlock("table", _hoisted_29, [
                                _cache[5] || (_cache[5] = createBaseVNode("thead", null, [
                                  createBaseVNode("tr", null, [
                                    createBaseVNode("th", { style: { "width": "150px" } }, "时间"),
                                    createBaseVNode("th", { style: { "width": "120px" } }, "谁"),
                                    createBaseVNode("th", null, "改动"),
                                    createBaseVNode("th", { style: { "width": "90px" } }, "操作")
                                  ])
                                ], -1)),
                                createBaseVNode("tbody", null, [
                                  (openBlock(true), createElementBlock(Fragment, null, renderList(histories.value[it.key].items, (row) => {
                                    return openBlock(), createElementBlock("tr", {
                                      key: row.id,
                                      "data-cfg-log": row.id
                                    }, [
                                      createBaseVNode("td", _hoisted_31, toDisplayString(fmt(row.createdAt)), 1),
                                      createBaseVNode("td", _hoisted_32, toDisplayString(row.operator || "—"), 1),
                                      createBaseVNode("td", null, [
                                        createBaseVNode("code", null, toDisplayString(oldText(it, row)), 1),
                                        _cache[4] || (_cache[4] = createBaseVNode("span", { class: "muted" }, " → ", -1)),
                                        createBaseVNode("code", null, toDisplayString(row.newValue), 1)
                                      ]),
                                      createBaseVNode("td", null, [
                                        createBaseVNode("button", {
                                          class: "btn sm",
                                          disabled: busy.value === it.key,
                                          onClick: ($event) => rollback(it, row)
                                        }, " 回滚 ", 8, _hoisted_33)
                                      ])
                                    ], 8, _hoisted_30);
                                  }), 128))
                                ])
                              ]))
                            ], 8, _hoisted_26)
                          ])
                        ])) : createCommentVNode("", true)
                      ], 64);
                    }), 128))
                  ])
                ])
              ])
            ], 8, _hoisted_7);
          }), 128))
        ])
      ]);
    };
  }
};
const ConfigView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1319c0b3"]]);
export {
  ConfigView as default
};
