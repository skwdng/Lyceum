import { _ as _export_sfc, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, t as toDisplayString, f as withDirectives, G as vModelText, H as withKeys, F as Fragment, r as renderList, e as createCommentVNode, h as withModifiers, i as ref, m as toast, q as adminApi, R as errText, p as computed, a as openBlock, n as normalizeClass } from "./index-Di4UZs8N.js";
const _hoisted_1 = {
  class: "panel",
  "data-panel": "tags"
};
const _hoisted_2 = {
  class: "muted",
  style: { "font-size": "12.5px" }
};
const _hoisted_3 = { class: "tg-bar" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = {
  key: 0,
  class: "adm-error"
};
const _hoisted_6 = { class: "msg" };
const _hoisted_7 = {
  key: 1,
  class: "muted",
  style: { "padding": "18px 0" }
};
const _hoisted_8 = {
  key: 2,
  class: "tbl-x"
};
const _hoisted_9 = ["data-tag-id"];
const _hoisted_10 = { class: "tg-name" };
const _hoisted_11 = { class: "muted" };
const _hoisted_12 = { class: "muted" };
const _hoisted_13 = { class: "tg-ops" };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = ["disabled", "onClick"];
const _hoisted_16 = { key: 0 };
const _hoisted_17 = {
  key: 3,
  class: "pager"
};
const _hoisted_18 = ["disabled"];
const _hoisted_19 = ["disabled"];
const _hoisted_20 = {
  class: "modal",
  style: { "width": "470px" },
  "data-panel": "tag-rename"
};
const _hoisted_21 = { class: "body" };
const _hoisted_22 = {
  key: 0,
  class: "tg-merge",
  "data-panel": "tag-merge-hint"
};
const _hoisted_23 = { class: "foot" };
const _hoisted_24 = ["disabled"];
const _sfc_main = {
  __name: "TagsView",
  setup(__props) {
    const items = ref([]);
    const total = ref(0);
    const page = ref(1);
    const size = ref(20);
    const q = ref("");
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const newName = ref("");
    const renameRow = ref(null);
    const renameTo = ref("");
    const mergeHint = ref(null);
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await adminApi.tags(q.value.trim(), page.value, size.value);
        items.value = r && r.items || [];
        total.value = r && r.total || 0;
      } catch (e) {
        error.value = errText(e);
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    let searchTimer = null;
    function onSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        page.value = 1;
        load();
      }, 280);
    }
    function goPage(p) {
      page.value = p;
      load();
    }
    async function create() {
      const name = newName.value.trim();
      if (!name) return toast("先写标签名");
      busy.value = "create";
      try {
        const r = await adminApi.createTag(name);
        newName.value = "";
        if (r && r.created === false) toast("这个标签已经存在，没有重复创建");
        else toast("已预置标签「" + (r && r.tag && r.tag.name || name) + "」");
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    function openRename(row) {
      renameRow.value = row;
      renameTo.value = row.name;
      mergeHint.value = null;
    }
    function closeRename() {
      renameRow.value = null;
      renameTo.value = "";
      mergeHint.value = null;
    }
    function dupTarget(name) {
      const key = String(name || "").trim().toLowerCase();
      return items.value.find((t) => String(t.name).toLowerCase() === key && t.id !== (renameRow.value || {}).id);
    }
    async function doRename() {
      const row = renameRow.value;
      if (!row) return;
      const name = renameTo.value.trim();
      if (!name) return toast("新名字不能为空");
      if (name === row.name) return closeRename();
      const dup = dupTarget(name);
      if (dup && !mergeHint.value) {
        mergeHint.value = { target: dup.name, targetId: dup.id, useCount: row.useCount };
        return;
      }
      busy.value = "rename-" + row.id;
      try {
        const r = await adminApi.renameTag(row.id, name);
        if (r && r.merged) {
          toast("已并入「" + r.mergedInto.name + "」，迁移 " + r.moved + " 篇帖子");
        } else {
          toast("已改名为「" + (r && r.tag && r.tag.name || name) + "」");
        }
        closeRename();
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    async function remove(row) {
      const n = row.useCount || 0;
      const msg = n > 0 ? `将解除 ${n} 篇帖子的「${row.name}」标签，且不可恢复。

继续删除这个标签？` : `「${row.name}」还没有被任何帖子使用。删除后不可恢复，继续？`;
      if (!window.confirm(msg)) return;
      busy.value = "del-" + row.id;
      try {
        const r = await adminApi.deleteTag(row.id);
        toast("已删除标签，解除 " + (r && r.affected || 0) + " 篇帖子的关联");
        if (items.value.length === 1 && page.value > 1) page.value -= 1;
        await load();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("h2", null, [
          _cache[5] || (_cache[5] = createTextVNode(" 标签管理 ", -1)),
          _cache[6] || (_cache[6] = createBaseVNode("span", { class: "spacer" }, null, -1)),
          createBaseVNode("span", _hoisted_2, "共 " + toDisplayString(total.value) + " 个标签", 1)
        ]),
        createBaseVNode("div", _hoisted_3, [
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => q.value = $event),
            class: "tg-input",
            placeholder: "搜标签名…",
            onInput: onSearch
          }, null, 544), [
            [vModelText, q.value]
          ]),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => newName.value = $event),
            class: "tg-input",
            maxlength: "12",
            placeholder: "新标签名（1-12 字），回车预置",
            onKeyup: withKeys(create, ["enter"])
          }, null, 544), [
            [vModelText, newName.value]
          ]),
          createBaseVNode("button", {
            class: "btn primary sm",
            disabled: busy.value === "create",
            onClick: create
          }, toDisplayString(busy.value === "create" ? "创建中…" : "＋ 预置标签"), 9, _hoisted_4)
        ]),
        error.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
          _cache[7] || (_cache[7] = createBaseVNode("b", null, "加载失败", -1)),
          createBaseVNode("span", _hoisted_6, toDisplayString(error.value), 1),
          createBaseVNode("button", {
            class: "btn sm",
            onClick: load
          }, "重试")
        ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_7, "加载中…")) : (openBlock(), createElementBlock("div", _hoisted_8, [
          createBaseVNode("table", null, [
            _cache[9] || (_cache[9] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "60px" } }, "ID"),
                createBaseVNode("th", null, "名称"),
                createBaseVNode("th", { style: { "width": "100px" } }, "使用次数"),
                createBaseVNode("th", { style: { "width": "150px" } }, "创建者"),
                createBaseVNode("th", { style: { "width": "160px" } }, "创建时间"),
                createBaseVNode("th", { style: { "width": "170px" } }, "操作")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (t) => {
                return openBlock(), createElementBlock("tr", {
                  key: t.id,
                  "data-tag-id": t.id
                }, [
                  createBaseVNode("td", null, toDisplayString(t.id), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("b", _hoisted_10, toDisplayString(t.name), 1)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass({ "tg-zero": !t.useCount })
                    }, toDisplayString(t.useCount), 3)
                  ]),
                  createBaseVNode("td", _hoisted_11, toDisplayString(t.createdBy || "—"), 1),
                  createBaseVNode("td", _hoisted_12, toDisplayString(t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"), 1),
                  createBaseVNode("td", _hoisted_13, [
                    createBaseVNode("button", {
                      class: "btn sm",
                      onClick: ($event) => openRename(t)
                    }, "改名", 8, _hoisted_14),
                    createBaseVNode("button", {
                      class: "btn sm danger",
                      disabled: busy.value === "del-" + t.id,
                      onClick: ($event) => remove(t)
                    }, "删除", 8, _hoisted_15)
                  ])
                ], 8, _hoisted_9);
              }), 128)),
              !items.value.length ? (openBlock(), createElementBlock("tr", _hoisted_16, [..._cache[8] || (_cache[8] = [
                createBaseVNode("td", {
                  colspan: "6",
                  class: "muted",
                  style: { "text-align": "center", "padding": "26px 0" }
                }, " 还没有标签。发帖时用户可以自己建，也可以在上面预置官方标签。 ", -1)
              ])])) : createCommentVNode("", true)
            ])
          ])
        ])),
        pages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_17, [
          createBaseVNode("button", {
            class: "btn sm",
            disabled: page.value <= 1,
            onClick: _cache[2] || (_cache[2] = ($event) => goPage(page.value - 1))
          }, "上一页", 8, _hoisted_18),
          createBaseVNode("span", null, "第 " + toDisplayString(page.value) + " / " + toDisplayString(pages.value) + " 页", 1),
          createBaseVNode("button", {
            class: "btn sm",
            disabled: page.value >= pages.value,
            onClick: _cache[3] || (_cache[3] = ($event) => goPage(page.value + 1))
          }, "下一页", 8, _hoisted_19)
        ])) : createCommentVNode("", true),
        _cache[12] || (_cache[12] = createBaseVNode("p", {
          class: "muted",
          style: { "font-size": "12px", "margin-top": "12px" }
        }, " 删标签 = 解除帖子上的这个标签（帖子保留其它标签），不可恢复；改名撞上已有标签会自动合并。 所有操作都会写进「处理记录」。 ", -1)),
        renameRow.value ? (openBlock(), createElementBlock("div", {
          key: 4,
          class: "mask",
          onClick: withModifiers(closeRename, ["self"])
        }, [
          createBaseVNode("div", _hoisted_20, [
            createBaseVNode("h3", null, "改名 · " + toDisplayString(renameRow.value.name), 1),
            createBaseVNode("div", _hoisted_21, [
              _cache[11] || (_cache[11] = createBaseVNode("label", { class: "tg-lb" }, "新名称", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => renameTo.value = $event),
                class: "tg-input",
                style: { "width": "100%" },
                maxlength: "12",
                onKeyup: withKeys(doRename, ["enter"])
              }, null, 544), [
                [vModelText, renameTo.value]
              ]),
              mergeHint.value ? (openBlock(), createElementBlock("div", _hoisted_22, [
                createBaseVNode("b", null, "「" + toDisplayString(mergeHint.value.target) + "」已存在", 1),
                createBaseVNode("p", null, [
                  createTextVNode(" 是否把「" + toDisplayString(renameRow.value.name) + "」并入它？", 1),
                  _cache[10] || (_cache[10] = createBaseVNode("br", null, null, -1)),
                  createTextVNode(" 并入后：源标签消失，" + toDisplayString(mergeHint.value.useCount || 0) + " 篇帖子改挂到「" + toDisplayString(mergeHint.value.target) + "」， 两边的使用次数相加，且不可恢复。 ", 1)
                ])
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("button", {
                class: "btn",
                onClick: closeRename
              }, "取消"),
              createBaseVNode("button", {
                class: "btn primary",
                disabled: busy.value === "rename-" + renameRow.value.id,
                onClick: doRename
              }, toDisplayString(mergeHint.value ? "确认合并" : "保存改名"), 9, _hoisted_24)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const TagsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-833c80ef"]]);
export {
  TagsView as default
};
