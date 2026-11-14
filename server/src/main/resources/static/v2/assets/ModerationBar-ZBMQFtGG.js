import { _ as _export_sfc, a as openBlock, c as createElementBlock, n as normalizeClass, F as Fragment, b as createBaseVNode, e as createCommentVNode, h as withModifiers, t as toDisplayString, r as renderList, f as withDirectives, C as vModelText, m as computed, l as toast, i as ref, j as contentApi, p as adminApi } from "./index-CMPBEC9e.js";
import { e as errText } from "./helpers-Cva5FjfT.js";
const _hoisted_1 = { class: "mb" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = ["disabled"];
const _hoisted_4 = ["disabled"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = {
  key: 3,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_8 = {
  class: "modal",
  style: { "width": "420px" }
};
const _hoisted_9 = { class: "body" };
const _hoisted_10 = { class: "mb-days" };
const _hoisted_11 = ["onClick"];
const _hoisted_12 = { class: "foot" };
const _hoisted_13 = ["disabled"];
const _sfc_main = {
  __name: "ModerationBar",
  props: {
    /** 'post' | 'comment' */
    type: { type: String, required: true },
    id: { type: [Number, String], required: true },
    authorId: { type: String, default: "" },
    hidden: { type: Boolean, default: false },
    /** 是否显示"禁言/封禁"（列表行里可以关掉，浮窗里必须显示） */
    showUserActions: { type: Boolean, default: true },
    size: { type: String, default: "sm" }
  },
  emits: ["changed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const busy = ref("");
    const muteOpen = ref(false);
    const muteDays = ref(3);
    const muteReason = ref("");
    const disabled = computed(() => !!busy.value);
    async function run(key, fn, okMsg) {
      if (busy.value) return;
      busy.value = key;
      try {
        await fn();
        toast(okMsg);
        emit("changed");
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    function hide() {
      const note = window.prompt("屏蔽理由（可空，会写进处理记录并通知作者）", "");
      if (note === null) return;
      run("hide", () => contentApi.hide(props.type, props.id, note || null), "已屏蔽");
    }
    function unhide() {
      run("unhide", () => contentApi.unhide(props.type, props.id), "已解除屏蔽");
    }
    function openMute() {
      if (!props.authorId) return toast("这条内容没有作者信息");
      muteDays.value = 3;
      muteReason.value = "";
      muteOpen.value = true;
    }
    function submitMute() {
      run(
        "mute",
        () => contentApi.mute(props.authorId, muteDays.value, muteReason.value || null),
        `已禁言 ${muteDays.value} 天`
      );
      muteOpen.value = false;
    }
    function ban() {
      if (!props.authorId) return toast("这条内容没有作者信息");
      if (!window.confirm(`确定全站封禁 ${props.authorId}？封禁后该用户下一次请求就会被踢下线。`)) return;
      run("ban", () => adminApi.setStatus(props.authorId, 0), "已全站封禁");
    }
    function unban() {
      if (!props.authorId) return;
      run("unban", () => adminApi.setStatus(props.authorId, 1), "已解封");
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("span", _hoisted_1, [
        !__props.hidden ? (openBlock(), createElementBlock("button", {
          key: 0,
          class: normalizeClass(["btn", __props.size]),
          disabled: disabled.value,
          onClick: hide
        }, "屏蔽", 10, _hoisted_2)) : (openBlock(), createElementBlock("button", {
          key: 1,
          class: normalizeClass(["btn", __props.size]),
          disabled: disabled.value,
          onClick: unhide
        }, "解除屏蔽", 10, _hoisted_3)),
        __props.showUserActions && __props.authorId ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("button", {
            class: normalizeClass(["btn", __props.size]),
            disabled: disabled.value,
            onClick: openMute
          }, "禁言", 10, _hoisted_4),
          createBaseVNode("button", {
            class: normalizeClass(["btn", __props.size]),
            disabled: disabled.value,
            onClick: ban
          }, "封禁", 10, _hoisted_5),
          createBaseVNode("button", {
            class: normalizeClass(["btn", __props.size]),
            disabled: disabled.value,
            onClick: unban
          }, "解封", 10, _hoisted_6)
        ], 64)) : createCommentVNode("", true),
        busy.value ? (openBlock(), createElementBlock("span", _hoisted_7, "处理中…")) : createCommentVNode("", true),
        muteOpen.value ? (openBlock(), createElementBlock("div", {
          key: 4,
          class: "mask",
          onClick: _cache[2] || (_cache[2] = withModifiers(($event) => muteOpen.value = false, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("h3", null, "禁言 " + toDisplayString(__props.authorId), 1),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                (openBlock(), createElementBlock(Fragment, null, renderList([1, 3, 7], (d) => {
                  return createBaseVNode("button", {
                    key: d,
                    class: normalizeClass(["btn sm", { primary: muteDays.value === d }]),
                    onClick: ($event) => muteDays.value = d
                  }, toDisplayString(d) + " 天", 11, _hoisted_11);
                }), 64))
              ]),
              _cache[3] || (_cache[3] = createBaseVNode("label", { class: "mb-lb" }, "理由（可空，≤200 字）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => muteReason.value = $event),
                class: "mb-input",
                maxlength: "200",
                placeholder: "例如：刷屏广告"
              }, null, 512), [
                [vModelText, muteReason.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_12, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[1] || (_cache[1] = ($event) => muteOpen.value = false)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: disabled.value,
                onClick: submitMute
              }, "确定禁言 " + toDisplayString(muteDays.value) + " 天", 9, _hoisted_13)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ModerationBar = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a7a5a54f"]]);
export {
  ModerationBar as M
};
