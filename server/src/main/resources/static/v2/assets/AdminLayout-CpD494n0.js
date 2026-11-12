import { r as ref, w as watch, o as onMounted, a as onBeforeUnmount, c as createElementBlock, b as createBlock, n as normalizeClass, d as createBaseVNode, F as Fragment, e as renderList, u as unref, f as createCommentVNode, t as toDisplayString, g as createVNode, h as computed, i as useRouter, j as useRoute, k as openBlock, l as withCtx, m as resolveComponent } from "./index-CcwKJfyj.js";
import { u as useAdminStore } from "./admin-BSjeUhc-.js";
import "./helpers-DxF3KBWn.js";
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
            _cache[0] || (_cache[0] = createBaseVNode("div", { class: "adm-brand" }, [
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
              _cache[1] || (_cache[1] = createBaseVNode("span", { class: "spacer" }, null, -1)),
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
        ], 2))
      ]);
    };
  }
};
export {
  _sfc_main as default
};
