import { _ as _export_sfc, u as useAdminStore, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, f as withDirectives, G as vModelText, H as withKeys, v as vModelSelect, F as Fragment, r as renderList, e as createCommentVNode, h as withModifiers, i as ref, S as topicAdminApi, k as errText, p as computed, m as toast, a as openBlock, n as normalizeClass } from "./index-DLaNzalC.js";
const _hoisted_1 = { "data-panel": "topic-review" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  class: "muted",
  style: { "font-weight": "400", "font-size": "12px" }
};
const _hoisted_4 = { class: "body" };
const _hoisted_5 = { class: "tr-bar" };
const _hoisted_6 = ["value"];
const _hoisted_7 = ["value"];
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
const _hoisted_13 = ["title"];
const _hoisted_14 = { class: "tag" };
const _hoisted_15 = { class: "muted" };
const _hoisted_16 = ["title"];
const _hoisted_17 = { class: "muted" };
const _hoisted_18 = { class: "tr-ops" };
const _hoisted_19 = ["disabled", "onClick"];
const _hoisted_20 = ["disabled", "onClick"];
const _hoisted_21 = ["disabled", "onClick"];
const _hoisted_22 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_23 = { class: "tr-page" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = { class: "muted" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = {
  class: "modal",
  style: { "width": "480px" }
};
const _hoisted_28 = { class: "body" };
const _hoisted_29 = { class: "tr-hint" };
const _hoisted_30 = ["placeholder"];
const _hoisted_31 = { class: "foot" };
const _hoisted_32 = ["disabled"];
const size = 20;
const _sfc_main = {
  __name: "TopicReviewView",
  setup(__props) {
    const adminStore = useAdminStore();
    const canModerate = computed(() => adminStore.has("topic:moderate"));
    const STATUSES = [["ALL", "全部"], ["PASS", "正常"], ["REJECT", "已驳回/下架"], ["NEED_EDIT", "待修改"], ["pending", "待审"]];
    const SOURCES = [["", "全部来源"], ["official", "官方"], ["custom", "自定义"]];
    const modStatus = ref("ALL");
    const source = ref("");
    const q = ref("");
    const topicId = ref("");
    const from = ref("");
    const to = ref("");
    const page = ref(1);
    const total = ref(0);
    const items = ref([]);
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const prompt = ref(null);
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const res = await topicAdminApi.list({
          modStatus: modStatus.value,
          source: source.value || void 0,
          q: q.value.trim() || void 0,
          id: topicId.value.trim() || void 0,
          from: from.value || void 0,
          to: to.value || void 0,
          page: page.value,
          size
        });
        items.value = res.items || [];
        total.value = res.total || 0;
      } catch (e) {
        error.value = errText(e) || "加载失败";
        items.value = [];
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    function search() {
      page.value = 1;
      load();
    }
    function go(p) {
      if (p < 1 || p > pages.value) return;
      page.value = p;
      load();
    }
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
    const approve = (t) => act("ok" + t.id, () => topicAdminApi.approve(t.id), `已通过：${t.title}`);
    function openPrompt(t, mode) {
      prompt.value = { id: t.id, title: t.title, mode, reason: "" };
    }
    function submitPrompt() {
      const p = prompt.value;
      if (!p.reason.trim()) return toast("理由必填（留痕用）");
      const call = p.mode === "reject" ? topicAdminApi.reject(p.id, p.reason.trim()) : topicAdminApi.offline(p.id, p.reason.trim());
      act(p.mode + p.id, () => call, p.mode === "reject" ? "已驳回" : "已下架");
      prompt.value = null;
    }
    function fmt(ms) {
      if (!ms) return "—";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    const tagClass = (s) => s === "PASS" ? "ok" : s === "REJECT" ? "red" : "orange";
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[12] || (_cache[12] = createTextVNode(" 辩题审核 ", -1)),
            _cache[13] || (_cache[13] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("span", _hoisted_3, "共 " + toDisplayString(total.value) + " 题（含已驳回/下架）", 1)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => q.value = $event),
                class: "tr-input",
                placeholder: "搜索题目标题…",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, q.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => topicId.value = $event),
                class: "tr-input",
                style: { "min-width": "130px" },
                placeholder: "题目 ID（精确）",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, topicId.value]
              ]),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => modStatus.value = $event),
                class: "tr-input",
                style: { "width": "150px" },
                onChange: search
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(STATUSES, (s) => {
                  return createBaseVNode("option", {
                    key: s[0],
                    value: s[0]
                  }, toDisplayString(s[1]), 9, _hoisted_6);
                }), 64))
              ], 544), [
                [vModelSelect, modStatus.value]
              ]),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => source.value = $event),
                class: "tr-input",
                style: { "width": "120px" },
                onChange: search
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(SOURCES, (s) => {
                  return createBaseVNode("option", {
                    key: s[0],
                    value: s[0]
                  }, toDisplayString(s[1]), 9, _hoisted_7);
                }), 64))
              ], 544), [
                [vModelSelect, source.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => from.value = $event),
                class: "tr-input",
                style: { "width": "150px" },
                type: "date",
                title: "审核起始日期",
                onChange: search
              }, null, 544), [
                [vModelText, from.value]
              ]),
              _cache[14] || (_cache[14] = createBaseVNode("span", {
                class: "muted",
                style: { "font-size": "12px" }
              }, "至", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => to.value = $event),
                class: "tr-input",
                style: { "width": "150px" },
                type: "date",
                title: "审核结束日期",
                onChange: search
              }, null, 544), [
                [vModelText, to.value]
              ]),
              createBaseVNode("button", {
                class: "btn primary sm",
                onClick: search
              }, "搜索"),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: _cache[6] || (_cache[6] = ($event) => {
                  q.value = "";
                  topicId.value = "";
                  modStatus.value = "ALL";
                  source.value = "";
                  from.value = "";
                  to.value = "";
                  search();
                })
              }, "重置")
            ]),
            _cache[18] || (_cache[18] = createBaseVNode("div", {
              class: "muted",
              style: { "font-size": "11.5px", "margin": "-4px 0 12px" }
            }, " 日期筛的是「审核时间」；还没审核过的题没有审核时间，按日期筛不会出现 ", -1)),
            error.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              _cache[15] || (_cache[15] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_9, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_10, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_11, [
              createBaseVNode("table", null, [
                _cache[17] || (_cache[17] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", null, "标题"),
                    createBaseVNode("th", { style: { "width": "110px" } }, "分类"),
                    createBaseVNode("th", { style: { "width": "90px" } }, "难度"),
                    createBaseVNode("th", { style: { "width": "90px" } }, "来源"),
                    createBaseVNode("th", { style: { "width": "80px" } }, "热度"),
                    createBaseVNode("th", { style: { "width": "110px" } }, "审核状态"),
                    createBaseVNode("th", { style: { "width": "160px" } }, "理由"),
                    createBaseVNode("th", { style: { "width": "128px" } }, "审核时间"),
                    createBaseVNode("th", { style: { "width": "230px" } }, "操作")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  !items.value.length ? (openBlock(), createElementBlock("tr", _hoisted_12, [..._cache[16] || (_cache[16] = [
                    createBaseVNode("td", {
                      colspan: "9",
                      class: "muted",
                      style: { "padding": "22px", "text-align": "center" }
                    }, "没有符合条件的辩题", -1)
                  ])])) : createCommentVNode("", true),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (t) => {
                    return openBlock(), createElementBlock("tr", {
                      key: t.id
                    }, [
                      createBaseVNode("td", {
                        class: "tr-title",
                        title: t.title
                      }, toDisplayString(t.title), 9, _hoisted_13),
                      createBaseVNode("td", null, toDisplayString(t.cat), 1),
                      createBaseVNode("td", null, toDisplayString(t.diff), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_14, toDisplayString(t.source === "custom" ? "自定义" : "官方"), 1)
                      ]),
                      createBaseVNode("td", _hoisted_15, toDisplayString(t.plays), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", {
                          class: normalizeClass(["tag", tagClass(t.modStatus)])
                        }, toDisplayString(t.modStatus), 3)
                      ]),
                      createBaseVNode("td", {
                        class: "muted tr-reason",
                        title: t.modReason
                      }, toDisplayString(t.modReason || "—"), 9, _hoisted_16),
                      createBaseVNode("td", _hoisted_17, toDisplayString(fmt(t.modAt)), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_18, [
                          canModerate.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                            createBaseVNode("button", {
                              class: "btn sm",
                              disabled: !!busy.value,
                              onClick: ($event) => approve(t)
                            }, "通过", 8, _hoisted_19),
                            createBaseVNode("button", {
                              class: "btn sm danger",
                              disabled: !!busy.value,
                              onClick: ($event) => openPrompt(t, "reject")
                            }, "驳回", 8, _hoisted_20),
                            createBaseVNode("button", {
                              class: "btn sm warn",
                              disabled: !!busy.value,
                              onClick: ($event) => openPrompt(t, "offline")
                            }, "下架", 8, _hoisted_21)
                          ], 64)) : (openBlock(), createElementBlock("span", _hoisted_22, "只读"))
                        ])
                      ])
                    ]);
                  }), 128))
                ])
              ])
            ])),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("button", {
                class: "btn sm",
                disabled: page.value <= 1,
                onClick: _cache[7] || (_cache[7] = ($event) => go(page.value - 1))
              }, "上一页", 8, _hoisted_24),
              createBaseVNode("span", _hoisted_25, toDisplayString(page.value) + " / " + toDisplayString(pages.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                disabled: page.value >= pages.value,
                onClick: _cache[8] || (_cache[8] = ($event) => go(page.value + 1))
              }, "下一页", 8, _hoisted_26)
            ])
          ])
        ]),
        prompt.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "mask",
          onClick: _cache[11] || (_cache[11] = withModifiers(($event) => prompt.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_27, [
            createBaseVNode("h3", null, toDisplayString(prompt.value.mode === "reject" ? "驳回" : "下架") + "辩题", 1),
            createBaseVNode("div", _hoisted_28, [
              createBaseVNode("div", _hoisted_29, toDisplayString(prompt.value.title), 1),
              _cache[19] || (_cache[19] = createBaseVNode("label", { class: "tr-lb" }, "理由（必填，会留痕）", -1)),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => prompt.value.reason = $event),
                class: "tr-ta",
                rows: "3",
                maxlength: "300",
                placeholder: prompt.value.mode === "reject" ? "例如：辩题立场不中立" : "例如：收到用户投诉，暂时下架"
              }, null, 8, _hoisted_30), [
                [vModelText, prompt.value.reason]
              ]),
              _cache[20] || (_cache[20] = createBaseVNode("div", {
                class: "muted",
                style: { "font-size": "11.5px", "margin-top": "6px" }
              }, " 下架后前台题库立刻看不到这道题，管理端仍可查到并改回「通过」。 ", -1))
            ]),
            createBaseVNode("div", _hoisted_31, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[10] || (_cache[10] = ($event) => prompt.value = null)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn danger",
                disabled: !!busy.value,
                onClick: submitPrompt
              }, "确定", 8, _hoisted_32)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const TopicReviewView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5a1da155"]]);
export {
  TopicReviewView as default
};
