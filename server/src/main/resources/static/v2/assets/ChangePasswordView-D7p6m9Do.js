import { _ as _export_sfc, u as useAdminStore, c as createElementBlock, b as createBaseVNode, d as createTextVNode, e as createCommentVNode, f as withDirectives, G as vModelText, H as withKeys, t as toDisplayString, s as unref, p as computed, i as ref, m as toast, q as adminApi, k as errText, C as useRouter, D as useRoute, a as openBlock } from "./index-Y_koWb_U.js";
const _hoisted_1 = {
  class: "panel cpwd",
  "data-panel": "admin-change-pwd"
};
const _hoisted_2 = {
  key: 0,
  class: "tag orange"
};
const _hoisted_3 = {
  key: 0,
  class: "cpwd-hint"
};
const _hoisted_4 = { class: "cpwd-form" };
const _hoisted_5 = { class: "cpwd-ops" };
const _hoisted_6 = ["disabled"];
const _hoisted_7 = ["disabled"];
const _hoisted_8 = ["disabled"];
const _sfc_main = {
  __name: "ChangePasswordView",
  setup(__props) {
    useRoute();
    const router = useRouter();
    const admin = useAdminStore();
    const forced = computed(() => admin.mustChangePwd);
    const oldPassword = ref("");
    const newPassword = ref("");
    const confirmPassword = ref("");
    const busy = ref(false);
    async function submit() {
      if (busy.value) return;
      if (!oldPassword.value) return toast("请输入当前密码");
      if (!newPassword.value) return toast("请输入新密码");
      if (newPassword.value !== confirmPassword.value) return toast("两次输入的新密码不一致");
      if (newPassword.value === oldPassword.value) return toast("新密码不能与当前密码相同");
      busy.value = true;
      try {
        await adminApi.password(oldPassword.value, newPassword.value);
        admin.logout();
        toast("密码已修改，请用新密码重新登录");
        router.replace("/admin/login");
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = false;
      }
    }
    function backToLogin() {
      admin.logout();
      router.replace("/admin/login");
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("h2", null, [
          _cache[4] || (_cache[4] = createTextVNode(" 修改密码 ", -1)),
          forced.value ? (openBlock(), createElementBlock("span", _hoisted_2, "首次登录必须改密")) : createCommentVNode("", true)
        ]),
        forced.value ? (openBlock(), createElementBlock("div", _hoisted_3, [..._cache[5] || (_cache[5] = [
          createTextVNode(" 你现在用的是超管给的一次性密码。为了账号安全，", -1),
          createBaseVNode("b", null, "改完密码才能使用其它功能", -1),
          createTextVNode("。 ", -1)
        ])])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_4, [
          _cache[6] || (_cache[6] = createBaseVNode("label", { class: "cpwd-lb" }, "当前密码", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => oldPassword.value = $event),
            type: "password",
            class: "cpwd-input",
            autocomplete: "current-password",
            placeholder: "一次性密码 / 你现在的密码"
          }, null, 512), [
            [vModelText, oldPassword.value]
          ]),
          _cache[7] || (_cache[7] = createBaseVNode("label", { class: "cpwd-lb" }, "新密码", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => newPassword.value = $event),
            type: "password",
            class: "cpwd-input",
            autocomplete: "new-password",
            placeholder: "至少 8 位，需同时含字母和数字"
          }, null, 512), [
            [vModelText, newPassword.value]
          ]),
          _cache[8] || (_cache[8] = createBaseVNode("label", { class: "cpwd-lb" }, "确认新密码", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => confirmPassword.value = $event),
            type: "password",
            class: "cpwd-input",
            autocomplete: "new-password",
            onKeyup: withKeys(submit, ["enter"])
          }, null, 544), [
            [vModelText, confirmPassword.value]
          ]),
          createBaseVNode("div", _hoisted_5, [
            createBaseVNode("button", {
              class: "btn primary",
              disabled: busy.value,
              onClick: submit
            }, toDisplayString(busy.value ? "提交中…" : "确认修改"), 9, _hoisted_6),
            !forced.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn",
              disabled: busy.value,
              onClick: _cache[3] || (_cache[3] = ($event) => unref(router).back())
            }, "取消", 8, _hoisted_7)) : (openBlock(), createElementBlock("button", {
              key: 1,
              class: "btn",
              disabled: busy.value,
              onClick: backToLogin
            }, "返回登录", 8, _hoisted_8))
          ]),
          _cache[9] || (_cache[9] = createBaseVNode("p", {
            class: "muted",
            style: { "font-size": "12px", "margin-top": "10px" }
          }, " 改完会用新密码重新登录一次：改密会让这个账号的**所有旧令牌立即失效**（这是预期的）。 ", -1))
        ])
      ]);
    };
  }
};
const ChangePasswordView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-4c8cc465"]]);
export {
  ChangePasswordView as default
};
