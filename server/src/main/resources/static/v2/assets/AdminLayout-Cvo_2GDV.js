import { _ as _export_sfc, w as watch, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, F as Fragment, d as createTextVNode, e as createCommentVNode, r as renderList, n as normalizeClass, f as withDirectives, v as vModelSelect, g as normalizeStyle, h as withModifiers, i as ref, j as contentApi, k as nextTick, l as toast, m as computed, p as adminApi, u as unref, q as createVNode, s as onBeforeUnmount, x as createBlock, y as useRouter, z as useRoute, A as withCtx, B as resolveComponent } from "./index-CMPBEC9e.js";
import { u as useAdminStore } from "./admin-DCE69cwy.js";
import { e as errText } from "./helpers-Cva5FjfT.js";
import { p as postDrawer } from "./postDrawer-DT6Y4eDB.js";
import { u as userPop } from "./userPop-B_WIxOUW.js";
import { M as ModerationBar } from "./ModerationBar-ZBMQFtGG.js";
const ADMIN_MENU = [
  {
    group: "总览",
    items: [
      { to: "/admin/dashboard", label: "概览", icon: "◧" },
      { to: "/admin/analytics", label: "报表分析", icon: "◔" }
    ]
  },
  {
    group: "运营",
    items: [
      { to: "/admin/reports", label: "举报处理", icon: "⚑", badge: "pendingReports" },
      { to: "/admin/content/posts", label: "帖子管理", icon: "▤" },
      { to: "/admin/content/comments", label: "评论管理", icon: "☷" },
      { to: "/admin/video-audit", label: "视频复核", icon: "▷" },
      { to: "/admin/topics", label: "辩题审核", icon: "❓" },
      { to: "/admin/users", label: "用户管理", icon: "☰" },
      { to: "/admin/audit", label: "处理记录", icon: "⟲" }
    ]
  },
  {
    group: "系统",
    items: [
      { to: "/admin/settings", label: "设置", icon: "⚙" }
    ]
  }
];
const _hoisted_1$3 = { class: "upop-head" };
const _hoisted_2$3 = {
  key: 0,
  class: "tag red"
};
const _hoisted_3$3 = {
  key: 1,
  class: "tag orange"
};
const _hoisted_4$3 = {
  key: 2,
  class: "tag ok"
};
const _hoisted_5$3 = { class: "upop-body" };
const _hoisted_6$3 = {
  key: 0,
  class: "muted",
  style: { "padding": "14px 0" }
};
const _hoisted_7$3 = {
  key: 1,
  class: "adm-error"
};
const _hoisted_8$3 = { class: "msg" };
const _hoisted_9$3 = { class: "upop-row" };
const _hoisted_10$3 = { class: "muted" };
const _hoisted_11$3 = { class: "upop-stats" };
const _hoisted_12$2 = { key: 0 };
const _hoisted_13$2 = { key: 0 };
const _hoisted_14$1 = {
  key: 0,
  class: "muted upop-empty"
};
const _hoisted_15$1 = { class: "muted" };
const _hoisted_16$1 = ["title"];
const _hoisted_17$1 = { class: "upop-sub" };
const _hoisted_18 = {
  key: 0,
  class: "muted",
  style: { "font-weight": "400", "font-size": "11px" }
};
const _hoisted_19 = {
  key: 1,
  class: "muted upop-empty"
};
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "muted" };
const _hoisted_22 = ["title"];
const _hoisted_23 = {
  key: 2,
  class: "upop-pager"
};
const _hoisted_24 = ["disabled"];
const _hoisted_25 = { class: "muted" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = { class: "upop-foot" };
const _hoisted_28 = ["disabled"];
const _hoisted_29 = ["disabled"];
const _hoisted_30 = ["disabled"];
const _hoisted_31 = {
  key: 0,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const W = 460;
const H_FALLBACK = 420;
const HIDDEN_PAGE_SIZE = 6;
const _sfc_main$3 = {
  __name: "UserProfilePop",
  props: {
    userId: { type: String, required: true },
    /** 点击处的视口坐标，用来就近弹出 */
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  emits: ["close", "changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const data = ref(null);
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const muteDays = ref(3);
    const hiddenPage = ref(1);
    const popEl = ref(null);
    const measuredH = ref(H_FALLBACK);
    const pos = computed(() => {
      const h = Math.min(measuredH.value, Math.max(240, window.innerHeight - 24));
      const left = Math.min(Math.max(12, props.x), Math.max(12, window.innerWidth - W - 12));
      const top = Math.min(Math.max(12, props.y), Math.max(12, window.innerHeight - h - 12));
      return { left: left + "px", top: top + "px", width: W + "px", maxHeight: window.innerHeight - 24 + "px" };
    });
    function measure() {
      if (popEl.value) measuredH.value = popEl.value.offsetHeight || H_FALLBACK;
    }
    const hiddenPageItems = computed(() => {
      const all = data.value && data.value.moderation && data.value.moderation.hiddenContent || [];
      const start = (hiddenPage.value - 1) * HIDDEN_PAGE_SIZE;
      return all.slice(start, start + HIDDEN_PAGE_SIZE);
    });
    const hiddenPages = computed(() => {
      const all = data.value && data.value.moderation && data.value.moderation.hiddenContent || [];
      return Math.max(1, Math.ceil(all.length / HIDDEN_PAGE_SIZE));
    });
    function goHidden(p) {
      if (p < 1 || p > hiddenPages.value) return;
      hiddenPage.value = p;
      nextTick(measure);
    }
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        data.value = await contentApi.profile(props.userId);
        hiddenPage.value = 1;
      } catch (e) {
        error.value = errText(e) || "加载失败";
      } finally {
        loading.value = false;
        nextTick(measure);
      }
    }
    watch(() => props.userId, load, { immediate: true });
    onMounted(() => nextTick(measure));
    watch(measuredH, () => {
    });
    async function act(key, fn, msg) {
      if (busy.value) return;
      busy.value = key;
      try {
        await fn();
        toast(msg);
        await load();
        emit("changed");
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    const mute = () => act("mute", () => contentApi.mute(props.userId, muteDays.value, null), `已禁言 ${muteDays.value} 天`);
    const ban = () => act("ban", () => adminApi.setStatus(props.userId, 0), "已全站封禁");
    const unban = () => act("unban", () => adminApi.setStatus(props.userId, 1), "已解封");
    function fmt(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    const yuan = (cents) => "¥" + (Number(cents || 0) / 100).toFixed(2);
    function jump(h) {
      if (!h || !h.postId) return toast("这条记录找不到所属帖子（内容可能已被彻底删除）");
      const commentId = h.type === "COMMENT" ? h.targetId : null;
      emit("close");
      postDrawer.open(h.postId, commentId);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "upop-mask",
        onClick: _cache[4] || (_cache[4] = withModifiers(($event) => emit("close"), ["self"]))
      }, [
        createBaseVNode("div", {
          ref_key: "popEl",
          ref: popEl,
          class: "upop",
          style: normalizeStyle(pos.value)
        }, [
          createBaseVNode("div", _hoisted_1$3, [
            createBaseVNode("b", null, toDisplayString(__props.userId), 1),
            data.value && data.value.user.disabled ? (openBlock(), createElementBlock("span", _hoisted_2$3, "已封禁")) : data.value && data.value.moderation.muted ? (openBlock(), createElementBlock("span", _hoisted_3$3, "禁言中")) : (openBlock(), createElementBlock("span", _hoisted_4$3, "正常")),
            _cache[5] || (_cache[5] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "upop-x",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_5$3, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_6$3, "加载中…")) : error.value ? (openBlock(), createElementBlock("div", _hoisted_7$3, [
              _cache[6] || (_cache[6] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_8$3, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : data.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_9$3, [
                createBaseVNode("span", null, [
                  _cache[7] || (_cache[7] = createTextVNode("昵称：", -1)),
                  createBaseVNode("b", null, toDisplayString(data.value.user.name || "(未命名)"), 1)
                ]),
                createBaseVNode("span", _hoisted_10$3, "注册于 " + toDisplayString(fmt(data.value.user.createdAt)), 1)
              ]),
              createBaseVNode("div", _hoisted_11$3, [
                createBaseVNode("span", null, [
                  createTextVNode("帖子 " + toDisplayString(data.value.stats.posts), 1),
                  data.value.stats.hiddenPosts ? (openBlock(), createElementBlock("i", _hoisted_12$2, "（已屏蔽 " + toDisplayString(data.value.stats.hiddenPosts) + "）", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("span", null, [
                  createTextVNode("评论 " + toDisplayString(data.value.stats.comments), 1),
                  data.value.stats.hiddenComments ? (openBlock(), createElementBlock("i", _hoisted_13$2, "（已屏蔽 " + toDisplayString(data.value.stats.hiddenComments) + "）", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("span", null, "对局 " + toDisplayString(data.value.stats.matches), 1),
                createBaseVNode("span", null, "余额 " + toDisplayString(yuan(data.value.stats.walletCents)), 1)
              ]),
              _cache[9] || (_cache[9] = createBaseVNode("div", { class: "upop-sub" }, "禁言记录", -1)),
              !data.value.moderation.banHistory.length ? (openBlock(), createElementBlock("div", _hoisted_14$1, "没有禁言记录")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(data.value.moderation.banHistory, (b, i) => {
                return openBlock(), createElementBlock("div", {
                  key: i,
                  class: "upop-item"
                }, [
                  createBaseVNode("span", {
                    class: normalizeClass(["tag", b.active ? "orange" : ""])
                  }, toDisplayString(b.active ? "生效中" : "已过期"), 3),
                  createBaseVNode("span", null, toDisplayString(fmt(b.createdAt)), 1),
                  createBaseVNode("span", null, "至 " + toDisplayString(fmt(b.untilAt)), 1),
                  createBaseVNode("span", _hoisted_15$1, toDisplayString(b.operator || "admin"), 1),
                  createBaseVNode("span", {
                    class: "upop-reason",
                    title: b.reason
                  }, toDisplayString(b.reason || "（无理由）"), 9, _hoisted_16$1)
                ]);
              }), 128)),
              createBaseVNode("div", _hoisted_17$1, [
                _cache[8] || (_cache[8] = createTextVNode(" 被处置的内容 ", -1)),
                data.value.moderation.hiddenContent.length ? (openBlock(), createElementBlock("span", _hoisted_18, " · 共 " + toDisplayString(data.value.moderation.hiddenContent.length) + " 条 ", 1)) : createCommentVNode("", true)
              ]),
              !data.value.moderation.hiddenContent.length ? (openBlock(), createElementBlock("div", _hoisted_19, "没有处置记录")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(hiddenPageItems.value, (h) => {
                return openBlock(), createElementBlock("div", {
                  key: h.auditId,
                  class: "upop-item"
                }, [
                  createBaseVNode("span", {
                    class: normalizeClass(["tag", h.undone ? "ok" : "red"])
                  }, toDisplayString(h.undone ? "已恢复" : "已屏蔽"), 3),
                  createBaseVNode("a", {
                    class: "upop-jump",
                    onClick: ($event) => jump(h)
                  }, toDisplayString(h.type === "POST" ? "帖子" : "评论") + " #" + toDisplayString(h.targetId), 9, _hoisted_20),
                  createBaseVNode("span", _hoisted_21, toDisplayString(fmt(h.createdAt)), 1),
                  createBaseVNode("span", {
                    class: "upop-reason",
                    title: h.detail
                  }, toDisplayString(h.detail), 9, _hoisted_22)
                ]);
              }), 128)),
              hiddenPages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_23, [
                createBaseVNode("button", {
                  class: "btn sm",
                  disabled: hiddenPage.value <= 1,
                  onClick: _cache[1] || (_cache[1] = ($event) => goHidden(hiddenPage.value - 1))
                }, "上一页", 8, _hoisted_24),
                createBaseVNode("span", _hoisted_25, toDisplayString(hiddenPage.value) + " / " + toDisplayString(hiddenPages.value), 1),
                createBaseVNode("button", {
                  class: "btn sm",
                  disabled: hiddenPage.value >= hiddenPages.value,
                  onClick: _cache[2] || (_cache[2] = ($event) => goHidden(hiddenPage.value + 1))
                }, "下一页", 8, _hoisted_26)
              ])) : createCommentVNode("", true)
            ], 64)) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_27, [
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => muteDays.value = $event),
              class: "upop-sel"
            }, [..._cache[10] || (_cache[10] = [
              createBaseVNode("option", { value: 1 }, "1 天", -1),
              createBaseVNode("option", { value: 3 }, "3 天", -1),
              createBaseVNode("option", { value: 7 }, "7 天", -1)
            ])], 512), [
              [
                vModelSelect,
                muteDays.value,
                void 0,
                { number: true }
              ]
            ]),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: !!busy.value,
              onClick: mute
            }, "禁言", 8, _hoisted_28),
            createBaseVNode("button", {
              class: "btn sm danger",
              disabled: !!busy.value,
              onClick: ban
            }, "封禁", 8, _hoisted_29),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: !!busy.value,
              onClick: unban
            }, "解封", 8, _hoisted_30),
            _cache[11] || (_cache[11] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            busy.value ? (openBlock(), createElementBlock("span", _hoisted_31, "处理中…")) : createCommentVNode("", true)
          ])
        ], 4)
      ]);
    };
  }
};
const UserProfilePop = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-4e63add6"]]);
const _hoisted_1$2 = { class: "ct" };
const _hoisted_2$2 = {
  key: 0,
  class: "muted",
  style: { "padding": "12px 0" }
};
const _hoisted_3$2 = ["id"];
const _hoisted_4$2 = { class: "ct-head" };
const _hoisted_5$2 = ["onClick"];
const _hoisted_6$2 = { class: "tag" };
const _hoisted_7$2 = {
  key: 0,
  class: "tag red"
};
const _hoisted_8$2 = { class: "muted ct-time" };
const _hoisted_9$2 = ["id"];
const _hoisted_10$2 = { class: "ct-head" };
const _hoisted_11$2 = ["onClick"];
const _hoisted_12$1 = {
  key: 0,
  class: "tag red"
};
const _hoisted_13$1 = { class: "muted ct-time" };
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
              createBaseVNode("span", {
                class: "ct-author",
                onClick: ($event) => unref(userPop).open(root.authorId, $event)
              }, toDisplayString(root.authorName || root.authorId), 9, _hoisted_5$2),
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
                  createBaseVNode("span", {
                    class: "ct-author",
                    onClick: ($event) => unref(userPop).open(r.authorId, $event)
                  }, toDisplayString(r.authorName || r.authorId), 9, _hoisted_11$2),
                  _cache[3] || (_cache[3] = createBaseVNode("span", { class: "tag" }, "楼中楼", -1)),
                  r.hidden ? (openBlock(), createElementBlock("span", _hoisted_12$1, "已屏蔽")) : createCommentVNode("", true),
                  createBaseVNode("span", _hoisted_13$1, toDisplayString(fmtTime(r.createdAt)), 1),
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
const CommentTree = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-29f73305"]]);
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
const _hoisted_12 = { class: "pd-body" };
const _hoisted_13 = { class: "pd-actions" };
const _hoisted_14 = { class: "pd-sub" };
const _hoisted_15 = {
  key: 0,
  style: { "text-align": "center", "margin-top": "10px" }
};
const _hoisted_16 = ["disabled"];
const _hoisted_17 = { class: "foot" };
const size = 20;
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
          contentApi.postComments(props.postId, 1, size)
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
        const c = await contentApi.postComments(props.postId, next, size);
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
        onClick: _cache[2] || (_cache[2] = withModifiers(($event) => emit("close"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$1, [
          createBaseVNode("h3", null, [
            createTextVNode(" 帖子 #" + toDisplayString(__props.postId) + " ", 1),
            detail.value && detail.value.post.hidden ? (openBlock(), createElementBlock("span", _hoisted_2$1, "已屏蔽")) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_3$1, [
            error.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, [
              _cache[3] || (_cache[3] = createBaseVNode("b", null, "加载失败", -1)),
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
                  _cache[4] || (_cache[4] = createTextVNode("作者：", -1)),
                  createBaseVNode("b", {
                    class: "who",
                    onClick: _cache[0] || (_cache[0] = ($event) => unref(userPop).open(detail.value.author.id, $event))
                  }, toDisplayString(detail.value.author.name || detail.value.author.id), 1),
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
              createBaseVNode("div", _hoisted_12, toDisplayString(detail.value.body), 1),
              createBaseVNode("div", _hoisted_13, [
                createVNode(ModerationBar, {
                  type: "post",
                  id: __props.postId,
                  "author-id": detail.value.author.id,
                  hidden: detail.value.post.hidden,
                  onChanged: refresh
                }, null, 8, ["id", "author-id", "hidden"])
              ]),
              createBaseVNode("div", _hoisted_14, [
                createTextVNode(" 评论（" + toDisplayString(total.value) + " 个楼） ", 1),
                _cache[5] || (_cache[5] = createBaseVNode("span", {
                  class: "muted",
                  style: { "font-size": "11.5px" }
                }, "含已屏蔽，仅管理端可见", -1))
              ]),
              createVNode(CommentTree, {
                items: comments.value,
                onChanged: refresh
              }, null, 8, ["items"]),
              hasMore.value ? (openBlock(), createElementBlock("div", _hoisted_15, [
                createBaseVNode("button", {
                  class: "btn sm",
                  disabled: loadingMore.value,
                  onClick: loadMore
                }, toDisplayString(loadingMore.value ? "加载中…" : "加载更多楼"), 9, _hoisted_16)
              ])) : createCommentVNode("", true)
            ], 64)) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_17, [
            createBaseVNode("button", {
              class: "btn",
              onClick: _cache[1] || (_cache[1] = ($event) => emit("close"))
            }, "关闭")
          ])
        ])
      ]);
    };
  }
};
const PostDetailDrawer = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-2529eda7"]]);
const _hoisted_1 = { class: "adm-root" };
const _hoisted_2 = { class: "adm-side" };
const _hoisted_3 = { class: "adm-nav" };
const _hoisted_4 = { class: "g" };
const _hoisted_5 = { class: "ic" };
const _hoisted_6 = { class: "lb" };
const _hoisted_7 = {
  key: 0,
  class: "badge"
};
const _hoisted_8 = { class: "adm-top" };
const _hoisted_9 = { class: "adm-title" };
const _hoisted_10 = { class: "adm-who" };
const _hoisted_11 = { class: "adm-body" };
const _sfc_main = {
  __name: "AdminLayout",
  setup(__props) {
    const route = useRoute();
    const router = useRouter();
    const admin = useAdminStore();
    const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 760px)") : null;
    const isNarrow = ref(mq ? mq.matches : false);
    const drawerOpen = ref(false);
    const isGuest = computed(() => route.meta.guest === true);
    const title = computed(() => route.meta && route.meta.title || "管理台");
    const mainEl = ref(null);
    watch(() => route.fullPath, () => {
      if (mainEl.value) mainEl.value.scrollTop = 0;
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    });
    const collapsed = computed(() => admin.collapsed && !isNarrow.value);
    function badgeOf(key) {
      if (key !== "pendingReports") return "";
      const n = admin.pendingCount;
      if (!n) return "";
      return n > 99 ? "99+" : String(n);
    }
    function onToggle() {
      if (isNarrow.value) drawerOpen.value = !drawerOpen.value;
      else admin.toggleCollapsed();
    }
    watch(() => route.path, () => {
      drawerOpen.value = false;
    });
    function closeDrawer() {
      drawerOpen.value = false;
    }
    function onMediaChange(e) {
      isNarrow.value = e.matches;
      if (!e.matches) drawerOpen.value = false;
    }
    function logout() {
      admin.logout();
      router.replace("/admin/login");
    }
    function handleUnauthorized() {
      admin.onUnauthorized();
      if (route.path !== "/admin/login") router.replace("/admin/login");
    }
    onMounted(() => {
      window.addEventListener("sy:admin-unauthorized", handleUnauthorized);
      if (mq && mq.addEventListener) mq.addEventListener("change", onMediaChange);
      if (admin.hasToken()) admin.loadStats();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("sy:admin-unauthorized", handleUnauthorized);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMediaChange);
    });
    return (_ctx, _cache) => {
      const _component_RouterView = resolveComponent("RouterView");
      const _component_RouterLink = resolveComponent("RouterLink");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        isGuest.value ? (openBlock(), createBlock(_component_RouterView, { key: 0 })) : (openBlock(), createElementBlock("div", {
          key: 1,
          class: normalizeClass(["adm-layout", { collapsed: collapsed.value, drawer: drawerOpen.value }])
        }, [
          createBaseVNode("aside", _hoisted_2, [
            _cache[4] || (_cache[4] = createBaseVNode("div", { class: "adm-brand" }, [
              createBaseVNode("div", { class: "m" }, "思"),
              createBaseVNode("div", null, [
                createBaseVNode("b", null, "思弈阁"),
                createBaseVNode("span", null, "管理后台")
              ])
            ], -1)),
            createBaseVNode("nav", _hoisted_3, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(ADMIN_MENU), (group, gi) => {
                return openBlock(), createElementBlock(Fragment, { key: gi }, [
                  createBaseVNode("div", _hoisted_4, toDisplayString(group.group), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(group.items, (item) => {
                    return openBlock(), createBlock(_component_RouterLink, {
                      key: item.to,
                      to: item.to,
                      title: item.label,
                      class: normalizeClass({ on: unref(route).path === item.to }),
                      onClick: closeDrawer
                    }, {
                      default: withCtx(() => [
                        createBaseVNode("span", _hoisted_5, toDisplayString(item.icon), 1),
                        createBaseVNode("span", _hoisted_6, toDisplayString(item.label), 1),
                        badgeOf(item.badge) ? (openBlock(), createElementBlock("span", _hoisted_7, toDisplayString(badgeOf(item.badge)), 1)) : createCommentVNode("", true)
                      ]),
                      _: 2
                    }, 1032, ["to", "title", "class"]);
                  }), 128))
                ], 64);
              }), 128))
            ])
          ]),
          drawerOpen.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            class: "adm-mask",
            "aria-label": "关闭菜单",
            onClick: closeDrawer
          })) : createCommentVNode("", true),
          createBaseVNode("div", {
            class: "adm-main",
            ref_key: "mainEl",
            ref: mainEl
          }, [
            createBaseVNode("header", _hoisted_8, [
              createBaseVNode("button", {
                class: "adm-iconbtn",
                "aria-label": "展开/收起菜单",
                onClick: onToggle
              }, "☰"),
              createBaseVNode("h1", _hoisted_9, toDisplayString(title.value), 1),
              _cache[5] || (_cache[5] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              createBaseVNode("span", _hoisted_10, toDisplayString(unref(admin).account || "管理员"), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: logout
              }, "退出登录")
            ]),
            createBaseVNode("div", _hoisted_11, [
              createVNode(_component_RouterView)
            ])
          ], 512)
        ], 2)),
        unref(userPop).state.open ? (openBlock(), createBlock(UserProfilePop, {
          key: 2,
          "user-id": unref(userPop).state.userId,
          x: unref(userPop).state.x,
          y: unref(userPop).state.y,
          onClose: _cache[0] || (_cache[0] = ($event) => unref(userPop).close()),
          onChanged: _cache[1] || (_cache[1] = ($event) => unref(userPop).fireChanged())
        }, null, 8, ["user-id", "x", "y"])) : createCommentVNode("", true),
        unref(postDrawer).state.open ? (openBlock(), createBlock(PostDetailDrawer, {
          key: unref(postDrawer).state.seq,
          "post-id": unref(postDrawer).state.postId,
          "focus-comment-id": unref(postDrawer).state.commentId,
          onClose: _cache[2] || (_cache[2] = ($event) => unref(postDrawer).close()),
          onChanged: _cache[3] || (_cache[3] = ($event) => unref(postDrawer).fireChanged())
        }, null, 8, ["post-id", "focus-comment-id"])) : createCommentVNode("", true)
      ]);
    };
  }
};
export {
  _sfc_main as default
};
