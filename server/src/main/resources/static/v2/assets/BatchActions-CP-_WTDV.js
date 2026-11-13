import { _ as _export_sfc, a as openBlock, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, f as withDirectives, v as vModelSelect, e as createCommentVNode, F as Fragment, r as renderList, n as normalizeClass, h as withModifiers, C as vModelText, m as computed, i as ref, l as toast, j as contentApi } from "./index-DY3kDvSJ.js";
import { e as errText } from "./helpers-7N7rPuXs.js";
const _hoisted_1 = {
  key: 0,
  class: "batch"
};
const _hoisted_2 = { class: "batch-n" };
const _hoisted_3 = ["disabled", "onClick"];
const _hoisted_4 = ["disabled"];
const _hoisted_5 = {
  key: 1,
  class: "muted",
  style: { "font-size": "11.5px" }
};
const _hoisted_6 = {
  class: "modal",
  style: { "width": "460px" }
};
const _hoisted_7 = { class: "body" };
const _hoisted_8 = { class: "batch-lb" };
const _hoisted_9 = { class: "foot" };
const _hoisted_10 = ["disabled"];
const _sfc_main = {
  __name: "BatchActions",
  props: {
    /** 'post' | 'comment' | 'user' */
    kind: { type: String, required: true },
    ids: { type: Array, default: () => [] }
  },
  emits: ["clear", "done"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const busy = ref("");
    const modal = ref(null);
    const note = ref("");
    const muteDays = ref(3);
    const count = computed(() => props.ids.length);
    const isUser = computed(() => props.kind === "user");
    const BUTTONS = computed(() => isUser.value ? [
      { action: "mute", label: "批量禁言", needNote: true, cls: "warn" },
      { action: "ban", label: "批量封禁", needNote: true, cls: "danger" },
      { action: "unban", label: "批量解封", needNote: false, cls: "" }
    ] : [
      { action: "hide", label: "批量屏蔽", needNote: true, cls: "danger" },
      { action: "unhide", label: "批量解除屏蔽", needNote: false, cls: "" }
    ]);
    function open(b) {
      if (!count.value) return toast("请先勾选");
      note.value = "";
      if (b.needNote) {
        modal.value = { action: b.action, title: b.label };
      } else {
        run(b.action, null);
      }
    }
    async function run(action, reason) {
      busy.value = action;
      try {
        const res = isUser.value ? await contentApi.batchUsers({ action, ids: props.ids, days: muteDays.value, reason }) : await contentApi.batchContent(props.kind, action, props.ids, reason);
        const done = res.done || 0;
        const failed = res.failed || [];
        if (failed.length === 0) {
          toast(`已处理 ${done} 条`);
        } else {
          toast(`成功 ${done} 条，失败 ${failed.length} 条（${failed[0].id}：${failed[0].reason}）`);
        }
        modal.value = null;
        emit("clear");
        emit("done");
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    function submit() {
      if (!modal.value) return;
      run(modal.value.action, note.value.trim() || null);
    }
    return (_ctx, _cache) => {
      return count.value ? (openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("span", _hoisted_2, [
          _cache[5] || (_cache[5] = createTextVNode("已选 ", -1)),
          createBaseVNode("b", null, toDisplayString(count.value), 1),
          createTextVNode(" " + toDisplayString(isUser.value ? "个用户" : "条内容"), 1)
        ]),
        isUser.value ? withDirectives((openBlock(), createElementBlock("select", {
          key: 0,
          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => muteDays.value = $event),
          class: "batch-sel",
          title: "禁言天数"
        }, [..._cache[6] || (_cache[6] = [
          createBaseVNode("option", { value: 1 }, "1 天", -1),
          createBaseVNode("option", { value: 3 }, "3 天", -1),
          createBaseVNode("option", { value: 7 }, "7 天", -1)
        ])], 512)), [
          [
            vModelSelect,
            muteDays.value,
            void 0,
            { number: true }
          ]
        ]) : createCommentVNode("", true),
        (openBlock(true), createElementBlock(Fragment, null, renderList(BUTTONS.value, (b) => {
          return openBlock(), createElementBlock("button", {
            key: b.action,
            class: normalizeClass(["btn sm", b.cls]),
            disabled: !!busy.value,
            onClick: ($event) => open(b)
          }, toDisplayString(b.label), 11, _hoisted_3);
        }), 128)),
        createBaseVNode("button", {
          class: "btn sm",
          disabled: !!busy.value,
          onClick: _cache[1] || (_cache[1] = ($event) => emit("clear"))
        }, "取消选择", 8, _hoisted_4),
        busy.value ? (openBlock(), createElementBlock("span", _hoisted_5, "处理中…")) : createCommentVNode("", true),
        modal.value ? (openBlock(), createElementBlock("div", {
          key: 2,
          class: "mask",
          onClick: _cache[4] || (_cache[4] = withModifiers(($event) => modal.value = null, ["self"]))
        }, [
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("h3", null, toDisplayString(modal.value.title) + " · 共 " + toDisplayString(count.value) + " " + toDisplayString(isUser.value ? "个用户" : "条内容"), 1),
            createBaseVNode("div", _hoisted_7, [
              createBaseVNode("label", _hoisted_8, " 理由" + toDisplayString(modal.value.action === "hide" || modal.value.action === "ban" ? "（会写进处理记录并通知作者）" : "（可空）"), 1),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => note.value = $event),
                class: "batch-ta",
                rows: "3",
                maxlength: "200",
                placeholder: "例如：批量刷屏广告"
              }, null, 512), [
                [vModelText, note.value]
              ]),
              _cache[7] || (_cache[7] = createBaseVNode("div", {
                class: "muted",
                style: { "font-size": "11.5px", "margin-top": "6px" }
              }, " 逐条处理；个别失败（已屏蔽、已被删）不会影响其它条目。 ", -1))
            ]),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("button", {
                class: "btn",
                onClick: _cache[3] || (_cache[3] = ($event) => modal.value = null)
              }, "取消"),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: !!busy.value,
                onClick: submit
              }, "确定" + toDisplayString(modal.value.title.replace("批量", "")), 9, _hoisted_10)
            ])
          ])
        ])) : createCommentVNode("", true)
      ])) : createCommentVNode("", true);
    };
  }
};
const BatchActions = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-bebadbd9"]]);
export {
  BatchActions as B
};
