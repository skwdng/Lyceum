import { u as useAdminStore, M as onUnmounted, o as onMounted, q as adminApi, m as toast, k as errText, c as createElementBlock, b as createBaseVNode, d as createTextVNode, f as withDirectives, G as vModelText, H as withKeys, e as createCommentVNode, x as createVNode, F as Fragment, r as renderList, t as toDisplayString, i as ref, p as computed, a as openBlock, Q as vModelCheckbox, n as normalizeClass, s as unref, P as fmtTime, v as vModelSelect } from "./index-7_1-pJLb.js";
import { u as userPop } from "./userPop-cC5S6DbW.js";
import { B as BatchActions } from "./BatchActions-B2kG8bmx.js";
const _hoisted_1 = { "data-panel": "users" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = { style: { "padding": "0 18px" } };
const _hoisted_4 = {
  key: 0,
  style: { "height": "8px" }
};
const _hoisted_5 = {
  key: 0,
  class: "muted",
  style: { "padding": "20px" }
};
const _hoisted_6 = {
  key: 1,
  class: "muted",
  style: { "padding": "28px", "text-align": "center" }
};
const _hoisted_7 = { key: 2 };
const _hoisted_8 = { style: { "width": "36px" } };
const _hoisted_9 = ["checked"];
const _hoisted_10 = ["value"];
const _hoisted_11 = ["onClick"];
const _hoisted_12 = {
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_13 = {
  key: 0,
  class: "tag orange"
};
const _hoisted_14 = {
  key: 1,
  class: "tag"
};
const _hoisted_15 = {
  key: 0,
  class: "tag red"
};
const _hoisted_16 = {
  key: 1,
  class: "muted"
};
const _hoisted_17 = { style: { "text-align": "right", "white-space": "nowrap" } };
const _hoisted_18 = ["onUpdate:modelValue"];
const _hoisted_19 = ["onClick"];
const _hoisted_20 = ["onClick"];
const _hoisted_21 = ["onClick"];
const _hoisted_22 = ["onClick"];
const _hoisted_23 = {
  key: 1,
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_24 = {
  key: 3,
  class: "pager"
};
const _hoisted_25 = { class: "muted" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = ["disabled"];
const _sfc_main = {
  __name: "UsersView",
  setup(__props) {
    const admin = useAdminStore();
    function openPop(userId, ev) {
      userPop.open(userId, ev);
    }
    const users = ref(null);
    const usersQ = ref("");
    const banDaysByUser = ref({});
    const canBan = computed(() => admin.has("user:ban"));
    const selected = ref([]);
    const allChecked = computed(() => !!users.value && (users.value.items || []).length > 0 && selected.value.length === users.value.items.length);
    function toggleAll(e) {
      selected.value = e.target.checked ? (users.value.items || []).map((u) => u.id) : [];
    }
    const offPop = userPop.onChanged(() => loadUsers(users.value ? users.value.page : 1));
    onUnmounted(offPop);
    onMounted(() => loadUsers(1));
    async function loadUsers(page = 1) {
      selected.value = [];
      try {
        users.value = await adminApi.users(usersQ.value, page, 20);
      } catch (e) {
        toast(errText(e));
      }
    }
    async function banUser(u) {
      const days = Number(banDaysByUser.value[u.id] || 7);
      try {
        await adminApi.ban(u.id, days, "管理员操作");
        toast("已禁言 " + days + " 天");
        await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
      } catch (e) {
        toast(errText(e));
      }
    }
    async function unbanUser(u) {
      try {
        await adminApi.unban(u.id);
        toast("已解除禁言");
        await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
      } catch (e) {
        toast(errText(e));
      }
    }
    async function setStatus(u, status) {
      if (status === 0 && !window.confirm("确定要全站封禁这个用户吗？封了之后他立刻无法登录、也无法使用社区。")) return;
      try {
        await adminApi.setStatus(u.id, status);
        toast(status === 0 ? "已全站封禁" : "已解封");
        await Promise.all([admin.loadStats(), loadUsers(users.value ? users.value.page : 1)]);
      } catch (e) {
        toast(errText(e));
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("h2", null, [
            _cache[9] || (_cache[9] = createTextVNode(" 用户管理 ", -1)),
            _cache[10] || (_cache[10] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => usersQ.value = $event),
              placeholder: "搜账号或昵称",
              style: { "width": "200px" },
              onKeydown: _cache[1] || (_cache[1] = withKeys(($event) => loadUsers(1), ["enter"]))
            }, null, 544), [
              [vModelText, usersQ.value]
            ]),
            createBaseVNode("button", {
              class: "btn sm primary",
              onClick: _cache[2] || (_cache[2] = ($event) => loadUsers(1))
            }, "搜索")
          ]),
          createBaseVNode("div", _hoisted_3, [
            selected.value.length ? (openBlock(), createElementBlock("div", _hoisted_4)) : createCommentVNode("", true),
            createVNode(BatchActions, {
              kind: "user",
              ids: selected.value,
              onClear: _cache[3] || (_cache[3] = ($event) => selected.value = []),
              onDone: _cache[4] || (_cache[4] = ($event) => loadUsers(users.value ? users.value.page : 1))
            }, null, 8, ["ids"])
          ]),
          !users.value ? (openBlock(), createElementBlock("div", _hoisted_5, "加载中…")) : !(users.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_6, " 没有匹配的用户 ")) : (openBlock(), createElementBlock("table", _hoisted_7, [
            createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", _hoisted_8, [
                  createBaseVNode("input", {
                    class: "row-check",
                    type: "checkbox",
                    checked: allChecked.value,
                    title: "全选本页",
                    onChange: _cache[5] || (_cache[5] = ($event) => toggleAll($event))
                  }, null, 40, _hoisted_9)
                ]),
                _cache[11] || (_cache[11] = createBaseVNode("th", null, "用户", -1)),
                _cache[12] || (_cache[12] = createBaseVNode("th", { style: { "width": "110px" } }, "全站", -1)),
                _cache[13] || (_cache[13] = createBaseVNode("th", { style: { "width": "190px" } }, "社区禁言", -1)),
                _cache[14] || (_cache[14] = createBaseVNode("th", { style: { "width": "90px" } }, "待处理举报", -1)),
                _cache[15] || (_cache[15] = createBaseVNode("th", null, null, -1))
              ])
            ]),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(users.value.items, (u) => {
                return openBlock(), createElementBlock("tr", {
                  key: u.id
                }, [
                  createBaseVNode("td", null, [
                    withDirectives(createBaseVNode("input", {
                      class: "row-check",
                      type: "checkbox",
                      value: u.id,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => selected.value = $event)
                    }, null, 8, _hoisted_10), [
                      [vModelCheckbox, selected.value]
                    ])
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("div", {
                      class: "u-link",
                      style: { "font-weight": "600" },
                      onClick: ($event) => openPop(u.id, $event)
                    }, toDisplayString(u.name || u.account), 9, _hoisted_11),
                    createBaseVNode("div", _hoisted_12, toDisplayString(u.account), 1)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", u.disabled ? "red" : "ok"])
                    }, toDisplayString(u.disabled ? "全站封禁" : "正常"), 3)
                  ]),
                  createBaseVNode("td", null, [
                    u.banned ? (openBlock(), createElementBlock("span", _hoisted_13, "禁言至 " + toDisplayString(unref(fmtTime)(u.banUntil)), 1)) : (openBlock(), createElementBlock("span", _hoisted_14, "未禁言"))
                  ]),
                  createBaseVNode("td", null, [
                    u.pendingReports > 0 ? (openBlock(), createElementBlock("span", _hoisted_15, toDisplayString(u.pendingReports), 1)) : (openBlock(), createElementBlock("span", _hoisted_16, "0"))
                  ]),
                  createBaseVNode("td", _hoisted_17, [
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": ($event) => banDaysByUser.value[u.id] = $event,
                      style: { "width": "82px", "display": "inline-block" }
                    }, [..._cache[16] || (_cache[16] = [
                      createBaseVNode("option", { value: 1 }, "1 天", -1),
                      createBaseVNode("option", { value: 3 }, "3 天", -1),
                      createBaseVNode("option", { value: 7 }, "7 天", -1)
                    ])], 8, _hoisted_18), [
                      [vModelSelect, banDaysByUser.value[u.id]]
                    ]),
                    canBan.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createBaseVNode("button", {
                        class: "btn sm warn",
                        onClick: ($event) => banUser(u)
                      }, "禁言", 8, _hoisted_19),
                      createBaseVNode("button", {
                        class: "btn sm",
                        onClick: ($event) => unbanUser(u)
                      }, "解禁", 8, _hoisted_20),
                      u.disabled ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        class: "btn sm",
                        onClick: ($event) => setStatus(u, 1)
                      }, "解封", 8, _hoisted_21)) : (openBlock(), createElementBlock("button", {
                        key: 1,
                        class: "btn sm danger",
                        onClick: ($event) => setStatus(u, 0)
                      }, "全站封禁", 8, _hoisted_22))
                    ], 64)) : (openBlock(), createElementBlock("span", _hoisted_23, "只读"))
                  ])
                ]);
              }), 128))
            ])
          ])),
          users.value && users.value.total > users.value.size ? (openBlock(), createElementBlock("div", _hoisted_24, [
            createBaseVNode("span", _hoisted_25, "共 " + toDisplayString(users.value.total) + " 条 · 第 " + toDisplayString(users.value.page) + " 页", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: users.value.page <= 1,
              onClick: _cache[7] || (_cache[7] = ($event) => loadUsers(users.value.page - 1))
            }, "上一页", 8, _hoisted_26),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: users.value.page >= Math.ceil(users.value.total / users.value.size),
              onClick: _cache[8] || (_cache[8] = ($event) => loadUsers(users.value.page + 1))
            }, " 下一页 ", 8, _hoisted_27)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
export {
  _sfc_main as default
};
