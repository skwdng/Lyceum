import { _ as _export_sfc, J as onUnmounted, q as onMounted, c as createElementBlock, a as createBaseVNode, b as createTextVNode, t as toDisplayString, e as withDirectives, C as vModelText, D as withKeys, v as vModelSelect, F as Fragment, r as renderList, d as createCommentVNode, i as contentApi, h as ref, k as computed, o as openBlock, m as createVNode } from "./index-DDPgDnZA.js";
import { e as errText } from "./helpers-BK_Uoi_O.js";
import { M as ModerationBar } from "./ModerationBar-Ca3b3ny2.js";
import { u as userPop } from "./userPop-ByVsXC9s.js";
import { p as postDrawer } from "./postDrawer-C7Hff4yU.js";
const _hoisted_1 = { "data-panel": "content-comments" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  class: "muted",
  style: { "font-weight": "400", "font-size": "12px" }
};
const _hoisted_4 = { class: "body" };
const _hoisted_5 = { class: "cc-bar" };
const _hoisted_6 = ["value"];
const _hoisted_7 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_8 = { class: "msg" };
const _hoisted_9 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_10 = {
  key: 2,
  class: "tbl-x"
};
const _hoisted_11 = { key: 0 };
const _hoisted_12 = { class: "muted" };
const _hoisted_13 = { class: "cc-body" };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "tag" };
const _hoisted_16 = ["onClick"];
const _hoisted_17 = ["onClick"];
const _hoisted_18 = {
  key: 0,
  class: "tag red"
};
const _hoisted_19 = {
  key: 1,
  class: "tag ok"
};
const _hoisted_20 = { class: "muted" };
const _hoisted_21 = { class: "cc-ops" };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = { class: "cc-page" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = { class: "muted" };
const _hoisted_26 = ["disabled"];
const size = 20;
const _sfc_main = {
  __name: "ContentCommentsView",
  setup(__props) {
    function openPop(userId, ev) {
      userPop.open(userId, ev);
    }
    function openCommentPost(c, focus = true) {
      postDrawer.open(c.postId, focus ? c.id : null);
    }
    const STATUSES = [["", "全部状态"], ["1", "正常"], ["2", "已屏蔽"]];
    const q = ref("");
    const status = ref("");
    const author = ref("");
    const from = ref("");
    const to = ref("");
    const page = ref(1);
    const total = ref(0);
    const items = ref([]);
    const loading = ref(true);
    const error = ref("");
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const res = await contentApi.comments({
          q: q.value.trim() || void 0,
          status: status.value || void 0,
          authorId: author.value.trim() || void 0,
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
    const offPop = userPop.onChanged(load);
    const offDrawer = postDrawer.onChanged(load);
    onUnmounted(() => {
      offPop();
      offDrawer();
    });
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
    function fmt(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[8] || (_cache[8] = createTextVNode(" 评论管理 ", -1)),
            _cache[9] || (_cache[9] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("span", _hoisted_3, "共 " + toDisplayString(total.value) + " 条（含已屏蔽）", 1)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => q.value = $event),
                class: "cc-input",
                placeholder: "搜索评论内容…",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, q.value]
              ]),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => status.value = $event),
                class: "cc-input",
                style: { "width": "120px" },
                onChange: search
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(STATUSES, (s) => {
                  return createBaseVNode("option", {
                    key: s[0],
                    value: s[0]
                  }, toDisplayString(s[1]), 9, _hoisted_6);
                }), 64))
              ], 544), [
                [vModelSelect, status.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => author.value = $event),
                class: "cc-input",
                style: { "min-width": "150px" },
                placeholder: "作者 ID",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, author.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => from.value = $event),
                class: "cc-input",
                style: { "width": "150px" },
                type: "date",
                title: "起始日期",
                onChange: search
              }, null, 544), [
                [vModelText, from.value]
              ]),
              _cache[10] || (_cache[10] = createBaseVNode("span", {
                class: "muted",
                style: { "font-size": "12px" }
              }, "至", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => to.value = $event),
                class: "cc-input",
                style: { "width": "150px" },
                type: "date",
                title: "结束日期",
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
                onClick: _cache[5] || (_cache[5] = ($event) => {
                  q.value = "";
                  status.value = "";
                  author.value = "";
                  from.value = "";
                  to.value = "";
                  search();
                })
              }, "重置")
            ]),
            error.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
              _cache[11] || (_cache[11] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_8, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_9, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_10, [
              createBaseVNode("table", null, [
                _cache[13] || (_cache[13] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", { style: { "width": "64px" } }, "ID"),
                    createBaseVNode("th", null, "内容"),
                    createBaseVNode("th", { style: { "width": "74px" } }, "层级"),
                    createBaseVNode("th", { style: { "width": "130px" } }, "作者"),
                    createBaseVNode("th", { style: { "width": "200px" } }, "所在帖子"),
                    createBaseVNode("th", { style: { "width": "76px" } }, "状态"),
                    createBaseVNode("th", { style: { "width": "128px" } }, "时间"),
                    createBaseVNode("th", { style: { "width": "250px" } }, "操作")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  !items.value.length ? (openBlock(), createElementBlock("tr", _hoisted_11, [..._cache[12] || (_cache[12] = [
                    createBaseVNode("td", {
                      colspan: "8",
                      class: "muted",
                      style: { "padding": "22px", "text-align": "center" }
                    }, "没有符合条件的评论", -1)
                  ])])) : createCommentVNode("", true),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (c) => {
                    return openBlock(), createElementBlock("tr", {
                      key: c.id
                    }, [
                      createBaseVNode("td", _hoisted_12, toDisplayString(c.id), 1),
                      createBaseVNode("td", _hoisted_13, [
                        createBaseVNode("a", {
                          class: "cc-link",
                          onClick: ($event) => openCommentPost(c)
                        }, toDisplayString(c.body), 9, _hoisted_14)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_15, toDisplayString(c.floor), 1)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("a", {
                          class: "cc-author",
                          onClick: ($event) => openPop(c.authorId, $event)
                        }, toDisplayString(c.authorName || c.authorId), 9, _hoisted_16)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("a", {
                          class: "cc-link",
                          onClick: ($event) => openCommentPost(c, false)
                        }, "#" + toDisplayString(c.postId) + " " + toDisplayString(c.postTitle), 9, _hoisted_17)
                      ]),
                      createBaseVNode("td", null, [
                        c.hidden ? (openBlock(), createElementBlock("span", _hoisted_18, "已屏蔽")) : (openBlock(), createElementBlock("span", _hoisted_19, "正常"))
                      ]),
                      createBaseVNode("td", _hoisted_20, toDisplayString(fmt(c.createdAt)), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_21, [
                          createBaseVNode("button", {
                            class: "btn sm",
                            onClick: ($event) => openCommentPost(c)
                          }, "详情", 8, _hoisted_22),
                          createVNode(ModerationBar, {
                            type: "comment",
                            id: c.id,
                            "author-id": c.authorId,
                            hidden: c.hidden,
                            "show-user-actions": false,
                            onChanged: load
                          }, null, 8, ["id", "author-id", "hidden"])
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
                onClick: _cache[6] || (_cache[6] = ($event) => go(page.value - 1))
              }, "上一页", 8, _hoisted_24),
              createBaseVNode("span", _hoisted_25, toDisplayString(page.value) + " / " + toDisplayString(pages.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                disabled: page.value >= pages.value,
                onClick: _cache[7] || (_cache[7] = ($event) => go(page.value + 1))
              }, "下一页", 8, _hoisted_26)
            ])
          ])
        ])
      ]);
    };
  }
};
const ContentCommentsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-abf18a85"]]);
export {
  ContentCommentsView as default
};
