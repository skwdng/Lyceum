import { _ as _export_sfc, w as watch, o as openBlock, c as createElementBlock, a as createBaseVNode, t as toDisplayString, F as Fragment, b as createTextVNode, d as createCommentVNode, r as renderList, n as normalizeClass, e as withDirectives, v as vModelSelect, f as normalizeStyle, g as withModifiers, h as ref, i as contentApi, j as computed, k as toast, l as adminApi, m as onMounted, p as onBeforeUnmount, q as createBlock, u as unref, s as createVNode, x as useRouter, y as useRoute, z as withCtx, A as resolveComponent } from "./index-DEeojRwW.js";
import { u as useAdminStore } from "./admin-o3wTV2Mg.js";
import { e as errText } from "./helpers-BYCbhqGK.js";
import { u as userPop } from "./userPop-D7K1VMMP.js";
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
const _hoisted_1$1 = { class: "upop-head" };
const _hoisted_2$1 = {
  key: 0,
  class: "tag red"
};
const _hoisted_3$1 = {
  key: 1,
  class: "tag orange"
};
const _hoisted_4$1 = {
  key: 2,
  class: "tag ok"
};
const _hoisted_5$1 = { class: "upop-body" };
const _hoisted_6$1 = {
  key: 0,
  class: "muted",
  style: { "padding": "14px 0" }
};
const _hoisted_7$1 = {
  key: 1,
  class: "adm-error"
};
const _hoisted_8$1 = { class: "msg" };
const _hoisted_9$1 = { class: "upop-row" };
const _hoisted_10$1 = { class: "muted" };
const _hoisted_11$1 = { class: "upop-stats" };
const _hoisted_12 = { key: 0 };
const _hoisted_13 = { key: 0 };
const _hoisted_14 = {
  key: 0,
  class: "muted upop-empty"
};
const _hoisted_15 = { class: "muted" };
const _hoisted_16 = ["title"];
const _hoisted_17 = {
  key: 1,
  class: "muted upop-empty"
};
const _hoisted_18 = { class: "muted" };
const _hoisted_19 = ["title"];
const _hoisted_20 = { class: "upop-foot" };
const _hoisted_21 = ["disabled"];
const _hoisted_22 = ["disabled"];
const _hoisted_23 = ["disabled"];
const _hoisted_24 = {
  key: 0,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const W = 460;
const H = 420;
const _sfc_main$1 = {
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
    const pos = computed(() => {
      const left = Math.min(Math.max(12, props.x), Math.max(12, window.innerWidth - W - 12));
      const top = Math.min(Math.max(12, props.y), Math.max(12, window.innerHeight - H - 12));
      return { left: left + "px", top: top + "px", width: W + "px" };
    });
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        data.value = await contentApi.profile(props.userId);
      } catch (e) {
        error.value = errText(e) || "加载失败";
      } finally {
        loading.value = false;
      }
    }
    watch(() => props.userId, load, { immediate: true });
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
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "upop-mask",
        onClick: _cache[2] || (_cache[2] = withModifiers(($event) => emit("close"), ["self"]))
      }, [
        createBaseVNode("div", {
          class: "upop",
          style: normalizeStyle(pos.value)
        }, [
          createBaseVNode("div", _hoisted_1$1, [
            createBaseVNode("b", null, toDisplayString(__props.userId), 1),
            data.value && data.value.user.disabled ? (openBlock(), createElementBlock("span", _hoisted_2$1, "已封禁")) : data.value && data.value.moderation.muted ? (openBlock(), createElementBlock("span", _hoisted_3$1, "禁言中")) : (openBlock(), createElementBlock("span", _hoisted_4$1, "正常")),
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "upop-x",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_5$1, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_6$1, "加载中…")) : error.value ? (openBlock(), createElementBlock("div", _hoisted_7$1, [
              _cache[4] || (_cache[4] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_8$1, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : data.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_9$1, [
                createBaseVNode("span", null, [
                  _cache[5] || (_cache[5] = createTextVNode("昵称：", -1)),
                  createBaseVNode("b", null, toDisplayString(data.value.user.name || "(未命名)"), 1)
                ]),
                createBaseVNode("span", _hoisted_10$1, "注册于 " + toDisplayString(fmt(data.value.user.createdAt)), 1)
              ]),
              createBaseVNode("div", _hoisted_11$1, [
                createBaseVNode("span", null, [
                  createTextVNode("帖子 " + toDisplayString(data.value.stats.posts), 1),
                  data.value.stats.hiddenPosts ? (openBlock(), createElementBlock("i", _hoisted_12, "（已屏蔽 " + toDisplayString(data.value.stats.hiddenPosts) + "）", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("span", null, [
                  createTextVNode("评论 " + toDisplayString(data.value.stats.comments), 1),
                  data.value.stats.hiddenComments ? (openBlock(), createElementBlock("i", _hoisted_13, "（已屏蔽 " + toDisplayString(data.value.stats.hiddenComments) + "）", 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("span", null, "对局 " + toDisplayString(data.value.stats.matches), 1),
                createBaseVNode("span", null, "余额 " + toDisplayString(yuan(data.value.stats.walletCents)), 1)
              ]),
              _cache[6] || (_cache[6] = createBaseVNode("div", { class: "upop-sub" }, "禁言记录", -1)),
              !data.value.moderation.banHistory.length ? (openBlock(), createElementBlock("div", _hoisted_14, "没有禁言记录")) : createCommentVNode("", true),
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
                  createBaseVNode("span", _hoisted_15, toDisplayString(b.operator || "admin"), 1),
                  createBaseVNode("span", {
                    class: "upop-reason",
                    title: b.reason
                  }, toDisplayString(b.reason || "（无理由）"), 9, _hoisted_16)
                ]);
              }), 128)),
              _cache[7] || (_cache[7] = createBaseVNode("div", { class: "upop-sub" }, "被处置的内容", -1)),
              !data.value.moderation.hiddenContent.length ? (openBlock(), createElementBlock("div", _hoisted_17, "没有处置记录")) : createCommentVNode("", true),
              (openBlock(true), createElementBlock(Fragment, null, renderList(data.value.moderation.hiddenContent, (h) => {
                return openBlock(), createElementBlock("div", {
                  key: h.auditId,
                  class: "upop-item"
                }, [
                  createBaseVNode("span", {
                    class: normalizeClass(["tag", h.undone ? "ok" : "red"])
                  }, toDisplayString(h.undone ? "已恢复" : "已屏蔽"), 3),
                  createBaseVNode("span", null, toDisplayString(h.type) + " #" + toDisplayString(h.targetId), 1),
                  createBaseVNode("span", _hoisted_18, toDisplayString(fmt(h.createdAt)), 1),
                  createBaseVNode("span", {
                    class: "upop-reason",
                    title: h.detail
                  }, toDisplayString(h.detail), 9, _hoisted_19)
                ]);
              }), 128))
            ], 64)) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_20, [
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => muteDays.value = $event),
              class: "upop-sel"
            }, [..._cache[8] || (_cache[8] = [
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
            }, "禁言", 8, _hoisted_21),
            createBaseVNode("button", {
              class: "btn sm danger",
              disabled: !!busy.value,
              onClick: ban
            }, "封禁", 8, _hoisted_22),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: !!busy.value,
              onClick: unban
            }, "解封", 8, _hoisted_23),
            _cache[9] || (_cache[9] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            busy.value ? (openBlock(), createElementBlock("span", _hoisted_24, "处理中…")) : createCommentVNode("", true)
          ])
        ], 4)
      ]);
    };
  }
};
const UserProfilePop = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-6f381fbb"]]);
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
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "adm-brand" }, [
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
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "spacer" }, null, -1)),
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
        }, null, 8, ["user-id", "x", "y"])) : createCommentVNode("", true)
      ]);
    };
  }
};
export {
  _sfc_main as default
};
