import { _ as _export_sfc, u as useAdminStore, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, s as unref, e as createCommentVNode, F as Fragment, r as renderList, f as withDirectives, G as vModelText, i as ref, m as toast, q as adminApi, L as ApiError, k as errText, C as useRouter, a as openBlock } from "./index-CCT1IxrH.js";
const _hoisted_1 = { "data-panel": "settings" };
const _hoisted_2 = {
  class: "panel",
  style: { "margin-bottom": "18px" }
};
const _hoisted_3 = { class: "body" };
const _hoisted_4 = { style: { "font-size": "13px" } };
const _hoisted_5 = {
  key: 0,
  class: "tag blue",
  style: { "margin-left": "8px" }
};
const _hoisted_6 = {
  key: 0,
  style: { "margin-top": "12px" }
};
const _hoisted_7 = {
  class: "muted",
  style: { "font-size": "12px", "margin-bottom": "6px" }
};
const _hoisted_8 = { class: "pwd-perms" };
const _hoisted_9 = { class: "panel form-narrow" };
const _hoisted_10 = { class: "body" };
const _sfc_main = {
  __name: "SettingsView",
  setup(__props) {
    const router = useRouter();
    const admin = useAdminStore();
    const pwdOld = ref("");
    const pwdNew = ref("");
    const pwdNew2 = ref("");
    async function changePassword() {
      if (!pwdOld.value) return toast("请输入当前密码");
      if (pwdNew.value.length < 8 || pwdNew.value.length > 64) return toast("新密码需 8–64 位");
      if (!/[0-9]/.test(pwdNew.value) || !/[A-Za-z]/.test(pwdNew.value)) return toast("新密码必须同时包含数字和字母");
      if (pwdNew.value !== pwdNew2.value) return toast("两次输入的新密码不一致");
      if (pwdNew.value === pwdOld.value) return toast("新密码不能与旧密码相同");
      try {
        await adminApi.password(pwdOld.value, pwdNew.value);
        admin.logout();
        toast("密码已更新，请重新登录");
        router.replace("/admin/login");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          admin.logout();
          toast("登录已失效，请重新登录");
          router.replace("/admin/login");
        } else {
          toast(errText(e));
        }
      }
    }
    function logout() {
      admin.logout();
      router.replace("/admin/login");
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[3] || (_cache[3] = createTextVNode(" 当前管理员 ", -1)),
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "btn sm",
              onClick: logout
            }, "退出登录")
          ]),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[5] || (_cache[5] = createTextVNode(" 账号：", -1)),
              createBaseVNode("b", null, toDisplayString(unref(admin).account || "管理员"), 1),
              unref(admin).role ? (openBlock(), createElementBlock("span", _hoisted_5, toDisplayString(unref(admin).role), 1)) : createCommentVNode("", true)
            ]),
            _cache[6] || (_cache[6] = createBaseVNode("div", {
              class: "muted",
              style: { "font-size": "12.5px", "margin-top": "6px" }
            }, " 独立入口：这里的登录态与普通用户互不影响（各自一个令牌）。 ", -1)),
            unref(admin).role ? (openBlock(), createElementBlock("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, " 当前角色拥有的权限点（" + toDisplayString(unref(admin).perms.length) + " 个，改角色后下一次请求即生效）： ", 1),
              createBaseVNode("div", _hoisted_8, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(admin).perms, (p) => {
                  return openBlock(), createElementBlock("span", {
                    key: p,
                    class: "tag"
                  }, toDisplayString(p), 1);
                }), 128))
              ])
            ])) : createCommentVNode("", true)
          ])
        ]),
        createBaseVNode("div", _hoisted_9, [
          _cache[11] || (_cache[11] = createBaseVNode("h2", null, "修改密码", -1)),
          createBaseVNode("div", _hoisted_10, [
            _cache[7] || (_cache[7] = createBaseVNode("p", {
              class: "muted",
              style: { "font-size": "12.5px", "margin": "0" }
            }, " 8–64 位，必须同时包含数字和字母。改完后所有设备上的登录都会失效，需要重新登录。 ", -1)),
            _cache[8] || (_cache[8] = createBaseVNode("label", null, "当前密码", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => pwdOld.value = $event),
              type: "password",
              maxlength: "64"
            }, null, 512), [
              [vModelText, pwdOld.value]
            ]),
            _cache[9] || (_cache[9] = createBaseVNode("label", null, "新密码", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => pwdNew.value = $event),
              type: "password",
              maxlength: "64"
            }, null, 512), [
              [vModelText, pwdNew.value]
            ]),
            _cache[10] || (_cache[10] = createBaseVNode("label", null, "确认新密码", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => pwdNew2.value = $event),
              type: "password",
              maxlength: "64"
            }, null, 512), [
              [vModelText, pwdNew2.value]
            ])
          ]),
          createBaseVNode("div", { class: "foot" }, [
            createBaseVNode("button", {
              class: "btn primary",
              onClick: changePassword
            }, "确认修改")
          ])
        ])
      ]);
    };
  }
};
const SettingsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-17ff1f39"]]);
export {
  SettingsView as default
};
