import { o as onMounted, c as createElementBlock, d as createBaseVNode, x as createTextVNode, p as withDirectives, v as vModelText, q as withKeys, F as Fragment, e as renderList, t as toDisplayString, f as createCommentVNode, b as createBlock, r as ref, H as adminApi, s as toast, k as openBlock, n as normalizeClass, u as unref, G as vModelSelect } from "./index-DPLYiPqf.js";
import { u as useAdminStore } from "./admin-soGKd_4u.js";
import { e as errText, f as fmtTime } from "./helpers-GwMOC4IQ.js";
import { U as UserProfilePop } from "./UserProfilePop-CE_fxCHT.js";
const _hoisted_1 = { "data-panel": "users" };
const _hoisted_2 = { class: "panel" };
const _hoisted_3 = {
  key: 0,
  class: "muted",
  style: { "padding": "20px" }
};
const _hoisted_4 = {
  key: 1,
  class: "muted",
  style: { "padding": "28px", "text-align": "center" }
};
const _hoisted_5 = { key: 2 };
const _hoisted_6 = ["onClick"];
const _hoisted_7 = {
  class: "muted",
  style: { "font-size": "12px" }
};
const _hoisted_8 = {
  key: 0,
  class: "tag orange"
};
const _hoisted_9 = {
  key: 1,
  class: "tag"
};
const _hoisted_10 = {
  key: 0,
  class: "tag red"
};
const _hoisted_11 = {
  key: 1,
  class: "muted"
};
const _hoisted_12 = { style: { "text-align": "right", "white-space": "nowrap" } };
const _hoisted_13 = ["onUpdate:modelValue"];
const _hoisted_14 = ["onClick"];
const _hoisted_15 = ["onClick"];
const _hoisted_16 = ["onClick"];
const _hoisted_17 = ["onClick"];
const _hoisted_18 = {
  key: 3,
  class: "pager"
};
const _hoisted_19 = { class: "muted" };
const _hoisted_20 = ["disabled"];
const _hoisted_21 = ["disabled"];
const _sfc_main = {
  __name: "UsersView",
  setup(__props) {
    const admin = useAdminStore();
    const pop = ref(null);
    function openPop(userId, ev) {
      if (!userId) return;
      pop.value = { id: userId, x: ev.clientX, y: ev.clientY };
    }
    const users = ref(null);
    const usersQ = ref("");
    const banDaysByUser = ref({});
    onMounted(() => loadUsers(1));
    async function loadUsers(page = 1) {
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
            _cache[7] || (_cache[7] = createTextVNode(" 用户管理 ", -1)),
            _cache[8] || (_cache[8] = createBaseVNode("span", { class: "spacer" }, null, -1)),
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
          !users.value ? (openBlock(), createElementBlock("div", _hoisted_3, "加载中…")) : !(users.value.items || []).length ? (openBlock(), createElementBlock("div", _hoisted_4, " 没有匹配的用户 ")) : (openBlock(), createElementBlock("table", _hoisted_5, [
            _cache[10] || (_cache[10] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", null, "用户"),
                createBaseVNode("th", { style: { "width": "110px" } }, "全站"),
                createBaseVNode("th", { style: { "width": "190px" } }, "社区禁言"),
                createBaseVNode("th", { style: { "width": "90px" } }, "待处理举报"),
                createBaseVNode("th")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(users.value.items, (u) => {
                return openBlock(), createElementBlock("tr", {
                  key: u.id
                }, [
                  createBaseVNode("td", null, [
                    createBaseVNode("div", {
                      class: "u-link",
                      style: { "font-weight": "600" },
                      onClick: ($event) => openPop(u.id, $event)
                    }, toDisplayString(u.name || u.account), 9, _hoisted_6),
                    createBaseVNode("div", _hoisted_7, toDisplayString(u.account), 1)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", u.disabled ? "red" : "ok"])
                    }, toDisplayString(u.disabled ? "全站封禁" : "正常"), 3)
                  ]),
                  createBaseVNode("td", null, [
                    u.banned ? (openBlock(), createElementBlock("span", _hoisted_8, "禁言至 " + toDisplayString(unref(fmtTime)(u.banUntil)), 1)) : (openBlock(), createElementBlock("span", _hoisted_9, "未禁言"))
                  ]),
                  createBaseVNode("td", null, [
                    u.pendingReports > 0 ? (openBlock(), createElementBlock("span", _hoisted_10, toDisplayString(u.pendingReports), 1)) : (openBlock(), createElementBlock("span", _hoisted_11, "0"))
                  ]),
                  createBaseVNode("td", _hoisted_12, [
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": ($event) => banDaysByUser.value[u.id] = $event,
                      style: { "width": "82px", "display": "inline-block" }
                    }, [..._cache[9] || (_cache[9] = [
                      createBaseVNode("option", { value: 1 }, "1 天", -1),
                      createBaseVNode("option", { value: 3 }, "3 天", -1),
                      createBaseVNode("option", { value: 7 }, "7 天", -1)
                    ])], 8, _hoisted_13), [
                      [vModelSelect, banDaysByUser.value[u.id]]
                    ]),
                    createBaseVNode("button", {
                      class: "btn sm warn",
                      onClick: ($event) => banUser(u)
                    }, "禁言", 8, _hoisted_14),
                    createBaseVNode("button", {
                      class: "btn sm",
                      onClick: ($event) => unbanUser(u)
                    }, "解禁", 8, _hoisted_15),
                    u.disabled ? (openBlock(), createElementBlock("button", {
                      key: 0,
                      class: "btn sm",
                      onClick: ($event) => setStatus(u, 1)
                    }, "解封", 8, _hoisted_16)) : (openBlock(), createElementBlock("button", {
                      key: 1,
                      class: "btn sm danger",
                      onClick: ($event) => setStatus(u, 0)
                    }, "全站封禁", 8, _hoisted_17))
                  ])
                ]);
              }), 128))
            ])
          ])),
          users.value && users.value.total > users.value.size ? (openBlock(), createElementBlock("div", _hoisted_18, [
            createBaseVNode("span", _hoisted_19, "共 " + toDisplayString(users.value.total) + " 条 · 第 " + toDisplayString(users.value.page) + " 页", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: users.value.page <= 1,
              onClick: _cache[3] || (_cache[3] = ($event) => loadUsers(users.value.page - 1))
            }, "上一页", 8, _hoisted_20),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: users.value.page >= Math.ceil(users.value.total / users.value.size),
              onClick: _cache[4] || (_cache[4] = ($event) => loadUsers(users.value.page + 1))
            }, " 下一页 ", 8, _hoisted_21)
          ])) : createCommentVNode("", true)
        ]),
        pop.value ? (openBlock(), createBlock(UserProfilePop, {
          key: 0,
          "user-id": pop.value.id,
          x: pop.value.x,
          y: pop.value.y,
          onClose: _cache[5] || (_cache[5] = ($event) => pop.value = null),
          onChanged: _cache[6] || (_cache[6] = ($event) => loadUsers(users.value ? users.value.page : 1))
        }, null, 8, ["user-id", "x", "y"])) : createCommentVNode("", true)
      ]);
    };
  }
};
export {
  _sfc_main as default
};
