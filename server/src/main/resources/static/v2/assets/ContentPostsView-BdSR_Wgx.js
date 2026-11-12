import { _ as _export_sfc, k as openBlock, c as createElementBlock, f as createCommentVNode, F as Fragment, e as renderList, d as createBaseVNode, t as toDisplayString, g as createVNode, n as normalizeClass, w as watch, x as createTextVNode, D as withModifiers, r as ref, I as contentApi, s as toast, h as computed, E as nextTick, o as onMounted, p as withDirectives, v as vModelText, q as withKeys, G as vModelSelect, b as createBlock, j as useRoute } from "./index-DeYGo5O-.js";
import { e as errText } from "./helpers-1QlzAgox.js";
import { M as ModerationBar } from "./ModerationBar-79fcgH6i.js";
import { U as UserProfilePop } from "./UserProfilePop-axOBZqiB.js";
const _hoisted_1$2 = { class: "ct" };
const _hoisted_2$2 = {
  key: 0,
  class: "muted",
  style: { "padding": "12px 0" }
};
const _hoisted_3$2 = ["id"];
const _hoisted_4$2 = { class: "ct-head" };
const _hoisted_5$2 = { class: "ct-author" };
const _hoisted_6$2 = { class: "tag" };
const _hoisted_7$2 = {
  key: 0,
  class: "tag red"
};
const _hoisted_8$2 = { class: "muted ct-time" };
const _hoisted_9$2 = ["id"];
const _hoisted_10$2 = { class: "ct-head" };
const _hoisted_11$2 = { class: "ct-author" };
const _hoisted_12$2 = {
  key: 0,
  class: "tag red"
};
const _hoisted_13$2 = { class: "muted ct-time" };
const _sfc_main$2 = {
  __name: "CommentTree",
  props: {
    items: { type: Array, default: () => [] }
  },
  emits: ["changed"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    function fmtTime(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        !__props.items.length ? (openBlock(), createElementBlock("div", _hoisted_2$2, "这个帖子还没有评论")) : createCommentVNode("", true),
        (openBlock(true), createElementBlock(Fragment, null, renderList(__props.items, (root) => {
          return openBlock(), createElementBlock("div", {
            id: "c-" + root.id,
            key: root.id,
            class: "ct-item ct-root"
          }, [
            createBaseVNode("div", _hoisted_4$2, [
              createBaseVNode("span", _hoisted_5$2, toDisplayString(root.authorName || root.authorId), 1),
              createBaseVNode("span", _hoisted_6$2, toDisplayString(root.floor), 1),
              root.hidden ? (openBlock(), createElementBlock("span", _hoisted_7$2, "已屏蔽")) : createCommentVNode("", true),
              createBaseVNode("span", _hoisted_8$2, toDisplayString(fmtTime(root.createdAt)), 1),
              _cache[2] || (_cache[2] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              createVNode(ModerationBar, {
                type: "comment",
                id: root.id,
                "author-id": root.authorId,
                hidden: root.hidden,
                onChanged: _cache[0] || (_cache[0] = ($event) => emit("changed"))
              }, null, 8, ["id", "author-id", "hidden"])
            ]),
            createBaseVNode("div", {
              class: normalizeClass(["ct-body", { dim: root.hidden }])
            }, toDisplayString(root.body), 3),
            (openBlock(true), createElementBlock(Fragment, null, renderList(root.replies, (r) => {
              return openBlock(), createElementBlock("div", {
                id: "c-" + r.id,
                key: r.id,
                class: "ct-item ct-reply"
              }, [
                createBaseVNode("div", _hoisted_10$2, [
                  createBaseVNode("span", _hoisted_11$2, toDisplayString(r.authorName || r.authorId), 1),
                  _cache[3] || (_cache[3] = createBaseVNode("span", { class: "tag" }, "楼中楼", -1)),
                  r.hidden ? (openBlock(), createElementBlock("span", _hoisted_12$2, "已屏蔽")) : createCommentVNode("", true),
                  createBaseVNode("span", _hoisted_13$2, toDisplayString(fmtTime(r.createdAt)), 1),
                  _cache[4] || (_cache[4] = createBaseVNode("span", { class: "spacer" }, null, -1)),
                  createVNode(ModerationBar, {
                    type: "comment",
                    id: r.id,
                    "author-id": r.authorId,
                    hidden: r.hidden,
                    onChanged: _cache[1] || (_cache[1] = ($event) => emit("changed"))
                  }, null, 8, ["id", "author-id", "hidden"])
                ]),
                createBaseVNode("div", {
                  class: normalizeClass(["ct-body", { dim: r.hidden }])
                }, toDisplayString(r.body), 3)
              ], 8, _hoisted_9$2);
            }), 128))
          ], 8, _hoisted_3$2);
        }), 128))
      ]);
    };
  }
};
const CommentTree = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-a0c7cf1e"]]);
const _hoisted_1$1 = {
  class: "modal",
  style: { "width": "860px" }
};
const _hoisted_2$1 = {
  key: 0,
  class: "tag red",
  style: { "margin-left": "8px" }
};
const _hoisted_3$1 = { class: "body" };
const _hoisted_4$1 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_5$1 = { class: "msg" };
const _hoisted_6$1 = {
  key: 1,
  class: "muted"
};
const _hoisted_7$1 = { class: "pd-title" };
const _hoisted_8$1 = { class: "pd-meta" };
const _hoisted_9$1 = { class: "tag blue" };
const _hoisted_10$1 = { class: "muted" };
const _hoisted_11$1 = { class: "pd-stats" };
const _hoisted_12$1 = { class: "pd-body" };
const _hoisted_13$1 = { class: "pd-actions" };
const _hoisted_14$1 = { class: "pd-sub" };
const _hoisted_15$1 = {
  key: 0,
  style: { "text-align": "center", "margin-top": "10px" }
};
const _hoisted_16$1 = ["disabled"];
const _hoisted_17$1 = { class: "foot" };
const size$1 = 20;
const _sfc_main$1 = {
  __name: "PostDetailDrawer",
  props: {
    postId: { type: [Number, String], required: true },
    focusCommentId: { type: [Number, String], default: null }
  },
  emits: ["close", "changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const detail = ref(null);
    const comments = ref([]);
    const total = ref(0);
    const page = ref(1);
    const loading = ref(true);
    const error = ref("");
    const loadingMore = ref(false);
    const hasMore = computed(() => comments.value.length < total.value);
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const [d, c] = await Promise.all([
          contentApi.post(props.postId),
          contentApi.postComments(props.postId, 1, size$1)
        ]);
        detail.value = d;
        comments.value = c.items || [];
        total.value = c.total || 0;
        page.value = 1;
        focus();
      } catch (e) {
        error.value = errText(e) || "加载失败";
        toast(errText(e));
      } finally {
        loading.value = false;
      }
    }
    async function loadMore() {
      if (loadingMore.value) return;
      loadingMore.value = true;
      try {
        const next = page.value + 1;
        const c = await contentApi.postComments(props.postId, next, size$1);
        comments.value = comments.value.concat(c.items || []);
        total.value = c.total || total.value;
        page.value = next;
      } catch (e) {
        toast(errText(e));
      } finally {
        loadingMore.value = false;
      }
    }
    async function focus() {
      const target = props.focusCommentId;
      if (!target) return;
      await nextTick();
      const el = document.querySelector("#c-" + target);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("is-hl");
      setTimeout(() => el.classList.remove("is-hl"), 2e3);
    }
    watch(() => props.postId, load, { immediate: true });
    watch(() => props.focusCommentId, focus);
    async function refresh() {
      await load();
      emit("changed");
    }
    function fmt(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "mask",
        onClick: _cache[1] || (_cache[1] = withModifiers(($event) => emit("close"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$1, [
          createBaseVNode("h3", null, [
            createTextVNode(" 帖子 #" + toDisplayString(__props.postId) + " ", 1),
            detail.value && detail.value.post.hidden ? (openBlock(), createElementBlock("span", _hoisted_2$1, "已屏蔽")) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_3$1, [
            error.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, [
              _cache[2] || (_cache[2] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_5$1, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_6$1, "加载中…")) : detail.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_7$1, toDisplayString(detail.value.post.title), 1),
              createBaseVNode("div", _hoisted_8$1, [
                createBaseVNode("span", _hoisted_9$1, toDisplayString(detail.value.post.type), 1),
                createBaseVNode("span", null, [
                  _cache[3] || (_cache[3] = createTextVNode("作者：", -1)),
                  createBaseVNode("b", null, toDisplayString(detail.value.author.name || detail.value.author.id), 1),
                  createTextVNode("（" + toDisplayString(detail.value.author.id) + "）", 1)
                ]),
                createBaseVNode("span", _hoisted_10$1, toDisplayString(fmt(detail.value.post.createdAt)), 1)
              ]),
              createBaseVNode("div", _hoisted_11$1, [
                createBaseVNode("span", null, "评论 " + toDisplayString(detail.value.stats.comments), 1),
                createBaseVNode("span", null, "楼 " + toDisplayString(detail.value.stats.rootComments), 1),
                createBaseVNode("span", null, "点赞 " + toDisplayString(detail.value.stats.likes), 1),
                createBaseVNode("span", null, "浏览 " + toDisplayString(detail.value.stats.views), 1)
              ]),
              createBaseVNode("div", _hoisted_12$1, toDisplayString(detail.value.body), 1),
              createBaseVNode("div", _hoisted_13$1, [
                createVNode(ModerationBar, {
                  type: "post",
                  id: __props.postId,
                  "author-id": detail.value.author.id,
                  hidden: detail.value.post.hidden,
                  onChanged: refresh
                }, null, 8, ["id", "author-id", "hidden"])
              ]),
              createBaseVNode("div", _hoisted_14$1, [
                createTextVNode(" 评论（" + toDisplayString(total.value) + " 个楼） ", 1),
                _cache[4] || (_cache[4] = createBaseVNode("span", {
                  class: "muted",
                  style: { "font-size": "11.5px" }
                }, "含已屏蔽，仅管理端可见", -1))
              ]),
              createVNode(CommentTree, {
                items: comments.value,
                onChanged: refresh
              }, null, 8, ["items"]),
              hasMore.value ? (openBlock(), createElementBlock("div", _hoisted_15$1, [
                createBaseVNode("button", {
                  class: "btn sm",
                  disabled: loadingMore.value,
                  onClick: loadMore
                }, toDisplayString(loadingMore.value ? "加载中…" : "加载更多楼"), 9, _hoisted_16$1)
              ])) : createCommentVNode("", true)
            ], 64)) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_17$1, [
            createBaseVNode("button", {
              class: "btn",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
            }, "关闭")
          ])
        ])
      ]);
    };
  }
};
const PostDetailDrawer = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-51ac0ad5"]]);
const _hoisted_1 = { "data-panel": "content-posts" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  class: "muted",
  style: { "font-weight": "400", "font-size": "12px" }
};
const _hoisted_4 = { class: "body" };
const _hoisted_5 = { class: "cp-bar" };
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
const _hoisted_13 = { class: "muted" };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "tag blue" };
const _hoisted_16 = ["onClick"];
const _hoisted_17 = {
  key: 0,
  class: "tag red"
};
const _hoisted_18 = {
  key: 1,
  class: "tag ok"
};
const _hoisted_19 = { class: "muted" };
const _hoisted_20 = { class: "cp-ops" };
const _hoisted_21 = ["onClick"];
const _hoisted_22 = { class: "cp-page" };
const _hoisted_23 = ["disabled"];
const _hoisted_24 = { class: "muted" };
const _hoisted_25 = ["disabled"];
const size = 20;
const _sfc_main = {
  __name: "ContentPostsView",
  setup(__props) {
    const TYPES = [["", "全部类型"], ["CHAT", "闲聊"], ["GUIDE", "攻略"], ["HELP", "求助"]];
    const STATUSES = [["", "全部状态"], ["1", "正常"], ["2", "已屏蔽"]];
    const q = ref("");
    const type = ref("");
    const status = ref("");
    const author = ref("");
    const from = ref("");
    const to = ref("");
    const page = ref(1);
    const total = ref(0);
    const items = ref([]);
    const loading = ref(true);
    const error = ref("");
    const drawer = ref(null);
    const route = useRoute();
    const pop = ref(null);
    function openPop(userId, ev) {
      if (!userId) return;
      pop.value = { id: userId, x: ev.clientX, y: ev.clientY };
    }
    function openFromQuery() {
      const postId = route.query.post;
      if (!postId) return;
      drawer.value = { id: Number(postId), focusCommentId: route.query.comment || null };
    }
    watch(() => route.query, openFromQuery, { immediate: true });
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const res = await contentApi.posts({
          q: q.value.trim() || void 0,
          type: type.value || void 0,
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
    function openDrawer(id, focusCommentId = null) {
      drawer.value = { id, focusCommentId };
    }
    function fmt(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function onChanged() {
      load();
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[11] || (_cache[11] = createTextVNode(" 帖子管理 ", -1)),
            _cache[12] || (_cache[12] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("span", _hoisted_3, "共 " + toDisplayString(total.value) + " 条（含已屏蔽）", 1)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => q.value = $event),
                class: "cp-input",
                placeholder: "搜索标题或正文…",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, q.value]
              ]),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => type.value = $event),
                class: "cp-input",
                style: { "width": "120px" },
                onChange: search
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(TYPES, (t) => {
                  return createBaseVNode("option", {
                    key: t[0],
                    value: t[0]
                  }, toDisplayString(t[1]), 9, _hoisted_6);
                }), 64))
              ], 544), [
                [vModelSelect, type.value]
              ]),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => status.value = $event),
                class: "cp-input",
                style: { "width": "120px" },
                onChange: search
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(STATUSES, (s) => {
                  return createBaseVNode("option", {
                    key: s[0],
                    value: s[0]
                  }, toDisplayString(s[1]), 9, _hoisted_7);
                }), 64))
              ], 544), [
                [vModelSelect, status.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => author.value = $event),
                class: "cp-input",
                style: { "min-width": "150px" },
                placeholder: "作者 ID（如 ao279609）",
                onKeyup: withKeys(search, ["enter"])
              }, null, 544), [
                [vModelText, author.value]
              ]),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => from.value = $event),
                class: "cp-input",
                style: { "width": "150px" },
                type: "date",
                title: "起始日期",
                onChange: search
              }, null, 544), [
                [vModelText, from.value]
              ]),
              _cache[13] || (_cache[13] = createBaseVNode("span", {
                class: "muted",
                style: { "font-size": "12px" }
              }, "至", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => to.value = $event),
                class: "cp-input",
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
                onClick: _cache[6] || (_cache[6] = ($event) => {
                  q.value = "";
                  type.value = "";
                  status.value = "";
                  author.value = "";
                  from.value = "";
                  to.value = "";
                  search();
                })
              }, "重置")
            ]),
            error.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
              _cache[14] || (_cache[14] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_9, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_10, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_11, [
              createBaseVNode("table", null, [
                _cache[16] || (_cache[16] = createBaseVNode("thead", null, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("th", { style: { "width": "64px" } }, "ID"),
                    createBaseVNode("th", null, "标题"),
                    createBaseVNode("th", { style: { "width": "76px" } }, "类型"),
                    createBaseVNode("th", { style: { "width": "130px" } }, "作者"),
                    createBaseVNode("th", { style: { "width": "76px" } }, "状态"),
                    createBaseVNode("th", { style: { "width": "80px" } }, "评论"),
                    createBaseVNode("th", { style: { "width": "128px" } }, "发布时间"),
                    createBaseVNode("th", { style: { "width": "300px" } }, "操作")
                  ])
                ], -1)),
                createBaseVNode("tbody", null, [
                  !items.value.length ? (openBlock(), createElementBlock("tr", _hoisted_12, [..._cache[15] || (_cache[15] = [
                    createBaseVNode("td", {
                      colspan: "8",
                      class: "muted",
                      style: { "padding": "22px", "text-align": "center" }
                    }, "没有符合条件的帖子", -1)
                  ])])) : createCommentVNode("", true),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (p) => {
                    return openBlock(), createElementBlock("tr", {
                      key: p.id
                    }, [
                      createBaseVNode("td", _hoisted_13, toDisplayString(p.id), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("a", {
                          class: "cp-link",
                          onClick: ($event) => openDrawer(p.id)
                        }, toDisplayString(p.title), 9, _hoisted_14)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_15, toDisplayString(p.type), 1)
                      ]),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", {
                          class: "cp-link",
                          onClick: ($event) => openPop(p.authorId, $event)
                        }, toDisplayString(p.authorName || p.authorId), 9, _hoisted_16)
                      ]),
                      createBaseVNode("td", null, [
                        p.hidden ? (openBlock(), createElementBlock("span", _hoisted_17, "已屏蔽")) : (openBlock(), createElementBlock("span", _hoisted_18, "正常"))
                      ]),
                      createBaseVNode("td", null, toDisplayString(p.comments), 1),
                      createBaseVNode("td", _hoisted_19, toDisplayString(fmt(p.createdAt)), 1),
                      createBaseVNode("td", null, [
                        createBaseVNode("span", _hoisted_20, [
                          createBaseVNode("button", {
                            class: "btn sm",
                            onClick: ($event) => openDrawer(p.id)
                          }, "详情", 8, _hoisted_21),
                          createVNode(ModerationBar, {
                            type: "post",
                            id: p.id,
                            "author-id": p.authorId,
                            hidden: p.hidden,
                            "show-user-actions": false,
                            onChanged
                          }, null, 8, ["id", "author-id", "hidden"])
                        ])
                      ])
                    ]);
                  }), 128))
                ])
              ])
            ])),
            createBaseVNode("div", _hoisted_22, [
              createBaseVNode("button", {
                class: "btn sm",
                disabled: page.value <= 1,
                onClick: _cache[7] || (_cache[7] = ($event) => go(page.value - 1))
              }, "上一页", 8, _hoisted_23),
              createBaseVNode("span", _hoisted_24, toDisplayString(page.value) + " / " + toDisplayString(pages.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                disabled: page.value >= pages.value,
                onClick: _cache[8] || (_cache[8] = ($event) => go(page.value + 1))
              }, "下一页", 8, _hoisted_25)
            ])
          ])
        ]),
        drawer.value ? (openBlock(), createBlock(PostDetailDrawer, {
          key: 0,
          "post-id": drawer.value.id,
          "focus-comment-id": drawer.value.focusCommentId,
          onClose: _cache[9] || (_cache[9] = ($event) => drawer.value = null),
          onChanged
        }, null, 8, ["post-id", "focus-comment-id"])) : createCommentVNode("", true),
        pop.value ? (openBlock(), createBlock(UserProfilePop, {
          key: 1,
          "user-id": pop.value.id,
          x: pop.value.x,
          y: pop.value.y,
          onClose: _cache[10] || (_cache[10] = ($event) => pop.value = null),
          onChanged: load
        }, null, 8, ["user-id", "x", "y"])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ContentPostsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6d954284"]]);
export {
  ContentPostsView as default
};
