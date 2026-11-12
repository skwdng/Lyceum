import { _ as _export_sfc, w as watch, k as openBlock, c as createElementBlock, d as createBaseVNode, t as toDisplayString, F as Fragment, x as createTextVNode, f as createCommentVNode, e as renderList, n as normalizeClass, p as withDirectives, G as vModelSelect, C as normalizeStyle, D as withModifiers, r as ref, I as contentApi, h as computed, s as toast, H as adminApi } from "./index-B1yuYSaQ.js";
import { e as errText } from "./helpers-QSB0v9jR.js";
const _hoisted_1 = { class: "upop-head" };
const _hoisted_2 = {
  key: 0,
  class: "tag red"
};
const _hoisted_3 = {
  key: 1,
  class: "tag orange"
};
const _hoisted_4 = {
  key: 2,
  class: "tag ok"
};
const _hoisted_5 = { class: "upop-body" };
const _hoisted_6 = {
  key: 0,
  class: "muted",
  style: { "padding": "14px 0" }
};
const _hoisted_7 = {
  key: 1,
  class: "adm-error"
};
const _hoisted_8 = { class: "msg" };
const _hoisted_9 = { class: "upop-row" };
const _hoisted_10 = { class: "muted" };
const _hoisted_11 = { class: "upop-stats" };
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
const _sfc_main = {
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
          createBaseVNode("div", _hoisted_1, [
            createBaseVNode("b", null, toDisplayString(__props.userId), 1),
            data.value && data.value.user.disabled ? (openBlock(), createElementBlock("span", _hoisted_2, "已封禁")) : data.value && data.value.moderation.muted ? (openBlock(), createElementBlock("span", _hoisted_3, "禁言中")) : (openBlock(), createElementBlock("span", _hoisted_4, "正常")),
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "upop-x",
              onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_5, [
            loading.value ? (openBlock(), createElementBlock("div", _hoisted_6, "加载中…")) : error.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
              _cache[4] || (_cache[4] = createBaseVNode("b", null, "加载失败", -1)),
              createBaseVNode("span", _hoisted_8, toDisplayString(error.value), 1),
              createBaseVNode("button", {
                class: "btn sm",
                onClick: load
              }, "重试")
            ])) : data.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("span", null, [
                  _cache[5] || (_cache[5] = createTextVNode("昵称：", -1)),
                  createBaseVNode("b", null, toDisplayString(data.value.user.name || "(未命名)"), 1)
                ]),
                createBaseVNode("span", _hoisted_10, "注册于 " + toDisplayString(fmt(data.value.user.createdAt)), 1)
              ]),
              createBaseVNode("div", _hoisted_11, [
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
const UserProfilePop = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6f381fbb"]]);
export {
  UserProfilePop as U
};
