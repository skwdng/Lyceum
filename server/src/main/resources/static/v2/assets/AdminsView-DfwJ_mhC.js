import { _ as _export_sfc, u as useAdminStore, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, F as Fragment, r as renderList, h as withModifiers, f as withDirectives, G as vModelText, H as withKeys, v as vModelSelect, e as createCommentVNode, i as ref, p as computed, m as toast, q as adminApi, k as errText, a as openBlock, s as unref, P as fmtTime } from "./index-D7NCGdZh.js";
const _hoisted_1 = {
  class: "panel",
  "data-panel": "admins"
};
const _hoisted_2 = {
  class: "muted",
  style: { "font-size": "12.5px" }
};
const _hoisted_3 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_4 = { class: "msg" };
const _hoisted_5 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_6 = {
  key: 2,
  class: "tbl-x"
};
const _hoisted_7 = { class: "muted" };
const _hoisted_8 = {
  key: 0,
  class: "tag blue",
  style: { "margin-left": "6px" }
};
const _hoisted_9 = {
  key: 1,
  class: "tag orange",
  style: { "margin-left": "6px" }
};
const _hoisted_10 = ["value", "disabled", "title", "onChange"];
const _hoisted_11 = ["value"];
const _hoisted_12 = {
  key: 0,
  class: "tag ok"
};
const _hoisted_13 = {
  key: 1,
  class: "tag red"
};
const _hoisted_14 = { class: "muted" };
const _hoisted_15 = { class: "muted" };
const _hoisted_16 = { class: "ad-ops" };
const _hoisted_17 = ["disabled", "title", "onClick"];
const _hoisted_18 = ["disabled", "onClick"];
const _hoisted_19 = {
  class: "modal",
  style: { "width": "460px" },
  "data-panel": "create-admin"
};
const _hoisted_20 = { class: "body" };
const _hoisted_21 = ["value"];
const _hoisted_22 = { class: "ac-tip" };
const _hoisted_23 = { class: "foot" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = ["disabled"];
const _hoisted_26 = {
  class: "modal",
  style: { "width": "480px" },
  "data-panel": "pwd-once"
};
const _hoisted_27 = { class: "body" };
const _hoisted_28 = { class: "ad-pwd" };
const _hoisted_29 = {
  class: "muted",
  style: { "font-size": "12.5px", "margin-top": "10px" }
};
const _sfc_main = {
  __name: "AdminsView",
  setup(__props) {
    const admin = useAdminStore();
    const ROLES = ["SUPER", "OPS", "MOD", "VIEWER"];
    const ROLE_LABEL = { SUPER: "超管", OPS: "运营", MOD: "审核", VIEWER: "只读" };
    const items = ref([]);
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const account = ref("");
    const role = ref("MOD");
    const customPwd = ref("");
    const creating = ref(false);
    const createOpen = ref(false);
    const roleTip = computed(() => ({
      SUPER: "全部权限：管账号、能导出全站数据",
      OPS: "日常处置 + 处理记录撤销 + 报表；不能导出、不能审视频",
      MOD: "内容与视频审核；不能封号、不能撤销处置、不能看报表",
      VIEWER: "只读：所有列表可看，任何写操作都被拒"
    })[role.value] || "");
    function openCreate() {
      account.value = "";
      role.value = "MOD";
      customPwd.value = "";
      createOpen.value = true;
    }
    function closeCreate() {
      if (creating.value) return;
      createOpen.value = false;
    }
    const pwdModal = ref(null);
    const myId = computed(() => admin.me && admin.me.id || 0);
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await adminApi.admins();
        items.value = r && r.items || [];
      } catch (e) {
        error.value = errText(e);
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    async function create() {
      if (creating.value) return;
      const acc = account.value.trim();
      if (!acc) return toast("请填账号");
      if (!role.value) return toast("请选择角色");
      creating.value = true;
      try {
        const r = await adminApi.createAdmin({
          account: acc,
          role: role.value,
          password: customPwd.value.trim() || null
        });
        pwdModal.value = {
          account: r.admin && r.admin.account || acc,
          password: r.password,
          hint: r.hint || "这是唯一一次能看到密码，请立刻线下发给对方",
          kind: "created"
        };
        createOpen.value = false;
        account.value = "";
        customPwd.value = "";
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        creating.value = false;
      }
    }
    async function changeRole(row, next) {
      if (busy.value) return;
      if (row.id === myId.value) return toast("不能修改自己的角色");
      busy.value = "role" + row.id;
      try {
        await adminApi.changeAdminRole(row.id, next);
        toast("角色已改为 " + (ROLE_LABEL[next] || next));
        await load();
      } catch (e) {
        toast(errText(e));
        await load();
      } finally {
        busy.value = "";
      }
    }
    async function toggle(row) {
      if (busy.value) return;
      if (row.id === myId.value) return toast("不能停用自己的账号");
      const next = !row.enabled;
      if (!next && !window.confirm(`停用 ${row.account}？停用后该账号立刻无法登录，但不会被删除。`)) return;
      busy.value = "st" + row.id;
      try {
        await adminApi.setAdminEnabled(row.id, next);
        toast(next ? "已启用" : "已停用");
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    async function resetPwd(row) {
      if (busy.value) return;
      if (!window.confirm(`重置 ${row.account} 的密码？对方会立刻被踢下线，必须用新密码重新登录并改密。`)) return;
      busy.value = "rp" + row.id;
      try {
        const r = await adminApi.resetAdminPwd(row.id);
        pwdModal.value = {
          account: r.admin && r.admin.account || row.account,
          password: r.password,
          hint: r.hint || "这是唯一一次能看到新密码",
          kind: "reset"
        };
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    async function copyPwd() {
      if (!pwdModal.value) return;
      try {
        await navigator.clipboard.writeText(pwdModal.value.password);
        toast("已复制");
      } catch (e) {
        toast("复制失败，请手动选中复制");
      }
    }
    function closePwdModal() {
      pwdModal.value = null;
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("h2", null, [
          _cache[3] || (_cache[3] = createTextVNode(" 管理员管理 ", -1)),
          _cache[4] || (_cache[4] = createBaseVNode("span", { class: "spacer" }, null, -1)),
          createBaseVNode("span", _hoisted_2, "共 " + toDisplayString(items.value.length) + " 个账号", 1),
          createBaseVNode("button", {
            class: "btn primary sm",
            onClick: openCreate
          }, "＋ 新建账号")
        ]),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
          _cache[5] || (_cache[5] = createBaseVNode("b", null, "加载失败", -1)),
          createBaseVNode("span", _hoisted_4, toDisplayString(error.value), 1),
          createBaseVNode("button", {
            class: "btn sm",
            onClick: load
          }, "重试")
        ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_5, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_6, [
          createBaseVNode("table", null, [
            _cache[6] || (_cache[6] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "60px" } }, "ID"),
                createBaseVNode("th", null, "账号"),
                createBaseVNode("th", { style: { "width": "150px" } }, "角色"),
                createBaseVNode("th", { style: { "width": "90px" } }, "状态"),
                createBaseVNode("th", { style: { "width": "140px" } }, "最后登录"),
                createBaseVNode("th", { style: { "width": "130px" } }, "创建人"),
                createBaseVNode("th", { style: { "width": "210px" } }, "操作")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (it) => {
                return openBlock(), createElementBlock("tr", {
                  key: it.id
                }, [
                  createBaseVNode("td", _hoisted_7, toDisplayString(it.id), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("b", null, toDisplayString(it.account), 1),
                    it.id === myId.value ? (openBlock(), createElementBlock("span", _hoisted_8, "我")) : createCommentVNode("", true),
                    it.mustChangePwd ? (openBlock(), createElementBlock("span", _hoisted_9, "待改密")) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("select", {
                      class: "ad-role",
                      value: it.role,
                      disabled: it.id === myId.value || busy.value === "role" + it.id,
                      title: it.id === myId.value ? "不能修改自己的角色（防止把自己锁死）" : "改角色后对方下一次请求就生效",
                      onChange: ($event) => changeRole(it, $event.target.value)
                    }, [
                      (openBlock(), createElementBlock(Fragment, null, renderList(ROLES, (r) => {
                        return createBaseVNode("option", {
                          key: r,
                          value: r
                        }, toDisplayString(r) + " · " + toDisplayString(ROLE_LABEL[r]), 9, _hoisted_11);
                      }), 64))
                    ], 40, _hoisted_10)
                  ]),
                  createBaseVNode("td", null, [
                    it.enabled ? (openBlock(), createElementBlock("span", _hoisted_12, "启用")) : (openBlock(), createElementBlock("span", _hoisted_13, "已停用"))
                  ]),
                  createBaseVNode("td", _hoisted_14, toDisplayString(it.lastLoginAt ? unref(fmtTime)(it.lastLoginAt) : "从未登录"), 1),
                  createBaseVNode("td", _hoisted_15, toDisplayString(it.createdBy || "（种子）"), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", _hoisted_16, [
                      createBaseVNode("button", {
                        class: "btn sm",
                        disabled: it.id === myId.value || busy.value === "st" + it.id,
                        title: it.id === myId.value ? "不能停用自己的账号" : "",
                        onClick: ($event) => toggle(it)
                      }, toDisplayString(it.enabled ? "停用" : "启用"), 9, _hoisted_17),
                      createBaseVNode("button", {
                        class: "btn sm",
                        disabled: busy.value === "rp" + it.id,
                        onClick: ($event) => resetPwd(it)
                      }, "重置密码", 8, _hoisted_18)
                    ])
                  ])
                ]);
              }), 128))
            ])
          ])
        ])),
        _cache[13] || (_cache[13] = createBaseVNode("p", {
          class: "muted",
          style: { "font-size": "12px", "margin-top": "12px" }
        }, [
          createTextVNode(" 账号只能由超管创建，"),
          createBaseVNode("b", null, "不存在自助注册"),
          createTextVNode("；不能硬删除（处理记录要对得上人），只能停用。 系统始终至少保留一个启用的超管。 ")
        ], -1)),
        createOpen.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "mask",
          onClick: withModifiers(closeCreate, ["self"])
        }, [
          createBaseVNode("div", _hoisted_19, [
            _cache[11] || (_cache[11] = createBaseVNode("h3", null, "新建管理员账号", -1)),
            createBaseVNode("div", _hoisted_20, [
              _cache[7] || (_cache[7] = createBaseVNode("label", { class: "ac-lb" }, "账号", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => account.value = $event),
                class: "ac-input",
                maxlength: "64",
                autofocus: "",
                placeholder: "3-64 位，字母或数字开头，可含 _ . -",
                onKeyup: withKeys(create, ["enter"])
              }, null, 544), [
                [vModelText, account.value]
              ]),
              _cache[8] || (_cache[8] = createBaseVNode("label", { class: "ac-lb" }, "角色", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => role.value = $event),
                class: "ac-input"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(ROLES, (r) => {
                  return createBaseVNode("option", {
                    key: r,
                    value: r
                  }, toDisplayString(r) + " · " + toDisplayString(ROLE_LABEL[r]), 9, _hoisted_21);
                }), 64))
              ], 512), [
                [vModelSelect, role.value]
              ]),
              createBaseVNode("div", _hoisted_22, toDisplayString(roleTip.value), 1),
              _cache[9] || (_cache[9] = createBaseVNode("label", { class: "ac-lb" }, "初始密码（可空）", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => customPwd.value = $event),
                type: "text",
                class: "ac-input",
                maxlength: "64",
                placeholder: "留空则自动生成一次性密码（推荐）"
              }, null, 512), [
                [vModelText, customPwd.value]
              ]),
              _cache[10] || (_cache[10] = createBaseVNode("p", {
                class: "muted",
                style: { "font-size": "12px", "margin": "10px 0 0" }
              }, [
                createTextVNode(" 创建成功后"),
                createBaseVNode("b", null, "只显示一次"),
                createTextVNode("密码：请立刻线下发给对方，对方首登必须改密。 ")
              ], -1))
            ]),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("button", {
                class: "btn",
                disabled: creating.value,
                onClick: closeCreate
              }, "取消", 8, _hoisted_24),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: creating.value,
                onClick: create
              }, toDisplayString(creating.value ? "创建中…" : "创建账号"), 9, _hoisted_25)
            ])
          ])
        ])) : createCommentVNode("", true),
        pwdModal.value ? (openBlock(), createElementBlock("div", {
          key: 4,
          class: "mask",
          onClick: withModifiers(closePwdModal, ["self"])
        }, [
          createBaseVNode("div", _hoisted_26, [
            createBaseVNode("h3", null, toDisplayString(pwdModal.value.kind === "created" ? "账号已创建" : "密码已重置") + " · " + toDisplayString(pwdModal.value.account), 1),
            createBaseVNode("div", _hoisted_27, [
              createBaseVNode("div", _hoisted_28, toDisplayString(pwdModal.value.password), 1),
              createBaseVNode("p", _hoisted_29, toDisplayString(pwdModal.value.hint), 1),
              _cache[12] || (_cache[12] = createBaseVNode("p", {
                class: "muted",
                style: { "font-size": "12px" }
              }, " 对方首登会被强制改密；关闭这个弹窗后就再也看不到这串密码了（库里只有哈希）。 ", -1))
            ]),
            createBaseVNode("div", { class: "foot" }, [
              createBaseVNode("button", {
                class: "btn",
                onClick: copyPwd
              }, "复制密码"),
              createBaseVNode("button", {
                class: "btn primary",
                onClick: closePwdModal
              }, "我已记下 / 已发给对方")
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const AdminsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0a268ec7"]]);
export {
  AdminsView as default
};
