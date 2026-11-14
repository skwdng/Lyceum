import { u as useAdminStore, c as createElementBlock, b as createBaseVNode, f as withDirectives, G as vModelText, H as withKeys, t as toDisplayString, i as ref, m as toast, k as errText, C as useRouter, a as openBlock } from "./index-DuRdJNBH.js";
const _hoisted_1 = { class: "login-wrap" };
const _hoisted_2 = { class: "login-box" };
const _hoisted_3 = ["disabled"];
const _sfc_main = {
  __name: "AdminLogin",
  setup(__props) {
    const router = useRouter();
    const admin = useAdminStore();
    const account = ref("");
    const password = ref("");
    const busy = ref(false);
    async function login() {
      if (busy.value) return;
      if (!account.value.trim() || !password.value) return toast("填账号和密码");
      busy.value = true;
      try {
        await admin.login(account.value.trim(), password.value);
        password.value = "";
        toast("登录成功");
        router.replace(admin.firstAllowedPath());
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = false;
      }
    }
    function goSite() {
      router.push({ name: "community" });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[2] || (_cache[2] = createBaseVNode("h1", null, "思弈阁 · 管理后台", -1)),
          _cache[3] || (_cache[3] = createBaseVNode("p", { class: "muted" }, "用管理员账号登录。这是独立入口，与普通用户的登录态互不影响。", -1)),
          _cache[4] || (_cache[4] = createBaseVNode("label", null, "账号", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => account.value = $event),
            placeholder: "admin",
            onKeydown: withKeys(login, ["enter"])
          }, null, 544), [
            [vModelText, account.value]
          ]),
          _cache[5] || (_cache[5] = createBaseVNode("label", null, "密码", -1)),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => password.value = $event),
            type: "password",
            placeholder: "••••••••",
            onKeydown: withKeys(login, ["enter"])
          }, null, 544), [
            [vModelText, password.value]
          ]),
          createBaseVNode("button", {
            class: "btn primary",
            style: { "width": "100%" },
            disabled: busy.value,
            onClick: login
          }, toDisplayString(busy.value ? "登录中…" : "登录"), 9, _hoisted_3),
          createBaseVNode("div", { style: { "text-align": "center", "margin-top": "12px" } }, [
            createBaseVNode("a", {
              class: "muted",
              style: { "cursor": "pointer", "font-size": "12.5px" },
              onClick: goSite
            }, "← 回到网站")
          ])
        ])
      ]);
    };
  }
};
export {
  _sfc_main as default
};
