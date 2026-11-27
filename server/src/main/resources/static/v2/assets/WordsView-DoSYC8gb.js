import { _ as _export_sfc, o as onMounted, c as createElementBlock, b as createBaseVNode, d as createTextVNode, F as Fragment, r as renderList, e as createCommentVNode, t as toDisplayString, f as withDirectives, G as vModelText, i as ref, p as computed, W as wordApi, m as toast, O as errText, a as openBlock, n as normalizeClass } from "./index-DfSyeNmZ.js";
import { a as downloadPath } from "./exportFile-BT-ZA7wB.js";
const _hoisted_1 = {
  class: "panel",
  "data-panel": "words"
};
const _hoisted_2 = { class: "body" };
const _hoisted_3 = { class: "wd-tabs" };
const _hoisted_4 = ["data-scope", "onClick"];
const _hoisted_5 = {
  key: 0,
  class: "wd-alert",
  "data-words-alert": ""
};
const _hoisted_6 = {
  class: "wd-meta",
  "data-words-summary": ""
};
const _hoisted_7 = {
  key: 0,
  class: "muted"
};
const _hoisted_8 = { class: "muted" };
const _hoisted_9 = { class: "muted" };
const _hoisted_10 = ["disabled"];
const _hoisted_11 = { class: "wd-hint" };
const _hoisted_12 = { class: "wd-import" };
const _hoisted_13 = { class: "wd-import-foot" };
const _hoisted_14 = ["disabled"];
const _hoisted_15 = { class: "wd-bar" };
const _hoisted_16 = {
  key: 1,
  class: "adm-error"
};
const _hoisted_17 = { class: "msg" };
const _hoisted_18 = {
  key: 2,
  class: "muted",
  style: { "padding": "16px 0" }
};
const _hoisted_19 = {
  key: 3,
  class: "muted",
  style: { "padding": "16px 0" }
};
const _hoisted_20 = {
  key: 4,
  class: "tbl-x"
};
const _hoisted_21 = ["data-word-id", "data-word"];
const _hoisted_22 = { class: "wd-word" };
const _hoisted_23 = { class: "muted" };
const _hoisted_24 = { class: "muted" };
const _hoisted_25 = { class: "wd-ops" };
const _hoisted_26 = ["disabled", "onClick"];
const _hoisted_27 = ["disabled", "onClick"];
const _hoisted_28 = {
  key: 5,
  class: "pager"
};
const _hoisted_29 = { class: "muted" };
const _hoisted_30 = ["disabled"];
const _hoisted_31 = ["disabled"];
const _sfc_main = {
  __name: "WordsView",
  setup(__props) {
    const SCOPES = [
      { scope: "COMMUNITY", label: "社区（打码）", effect: "打码", hint: "帖子/评论里的词会被替换成 ＊；标签里出现会被直接拒绝" },
      { scope: "VIDEO_REJECT", label: "视频-硬违规（驳回）", effect: "驳回", hint: "视频标题/描述命中就直接驳回" },
      { scope: "VIDEO_REVIEW", label: "视频-转人工（审查）", effect: "审查", hint: "命中后转人工复核，不自动杀" }
    ];
    const active = ref("COMMUNITY");
    const items = ref([]);
    const total = ref(0);
    const page = ref(1);
    const size = ref(50);
    const q = ref("");
    const loading = ref(true);
    const error = ref("");
    const busy = ref("");
    const draft = ref("");
    const importing = ref(false);
    const summary = ref({ scopes: [], communityEmpty: false });
    const pages = computed(() => Math.max(1, Math.ceil(total.value / size.value)));
    const current = computed(() => SCOPES.find((s) => s.scope === active.value) || SCOPES[0]);
    const scopeStat = computed(() => (summary.value.scopes || []).find((s) => s.scope === active.value) || {});
    function fmt(ms) {
      if (!ms) return "—";
      const d = new Date(Number(ms));
      const p2 = (n) => String(n).padStart(2, "0");
      return d.getMonth() + 1 + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    }
    async function loadSummary() {
      try {
        summary.value = await wordApi.summary();
      } catch (e) {
        summary.value = summary.value || { scopes: [], communityEmpty: false };
      }
    }
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await wordApi.list({ scope: active.value, q: q.value.trim(), page: page.value, size: size.value });
        items.value = r && r.items || [];
        total.value = r && r.total || 0;
      } catch (e) {
        error.value = errText(e);
      } finally {
        loading.value = false;
      }
    }
    async function reloadAll() {
      await loadSummary();
      await load();
    }
    onMounted(reloadAll);
    function switchScope(s) {
      if (active.value === s) return;
      active.value = s;
      page.value = 1;
      load();
    }
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
    async function doImport() {
      const text = draft.value.trim();
      if (!text) return toast("先粘贴要添加的词");
      importing.value = true;
      try {
        const r = await wordApi.importText(active.value, text);
        const added = r && r.added || 0;
        const skipped = r && r.skipped || 0;
        const invalid = r && r.invalid || [];
        const bits = ["新增 " + added + " 条"];
        if (skipped) bits.push("跳过重复 " + skipped + " 条");
        if (invalid.length) bits.push("不合法 " + invalid.length + " 条");
        toast(bits.join("，") + "（已立即生效）");
        if (invalid.length) {
          toast(invalid.slice(0, 3).map((x) => "「" + (x.word || "空") + "」" + x.reason).join("；"));
        }
        if (added || skipped) draft.value = "";
        await reloadAll();
      } catch (e) {
        toast(errText(e));
      } finally {
        importing.value = false;
      }
    }
    async function toggle(row) {
      busy.value = "tg-" + row.id;
      try {
        if (row.enabled) await wordApi.disable(row.id);
        else await wordApi.enable(row.id);
        toast("已" + (row.enabled ? "停用" : "启用") + "「" + row.word + "」，立即生效");
        await reloadAll();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    async function remove(row) {
      if (!window.confirm("删除「" + row.word + "」？删除后这个词不再参与匹配，且不可恢复。")) return;
      busy.value = "del-" + row.id;
      try {
        await wordApi.remove(row.id);
        toast("已删除「" + row.word + "」");
        await reloadAll();
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    async function doExport() {
      busy.value = "export";
      try {
        const name = await downloadPath(wordApi.exportPath(active.value), "words-" + active.value.toLowerCase() + ".txt");
        toast("已导出 " + name);
      } catch (e) {
        toast(errText(e));
      } finally {
        busy.value = "";
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[12] || (_cache[12] = createBaseVNode("h2", null, [
          createTextVNode(" 屏蔽词管理 "),
          createBaseVNode("span", { class: "spacer" }),
          createBaseVNode("span", {
            class: "muted",
            style: { "font-size": "12.5px" }
          }, "仅内容审核及以上")
        ], -1)),
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            (openBlock(), createElementBlock(Fragment, null, renderList(SCOPES, (s) => {
              return createBaseVNode("button", {
                key: s.scope,
                class: normalizeClass(["wd-tab", { on: active.value === s.scope }]),
                "data-scope": s.scope,
                onClick: ($event) => switchScope(s.scope)
              }, toDisplayString(s.label), 11, _hoisted_4);
            }), 64))
          ]),
          summary.value.communityEmpty ? (openBlock(), createElementBlock("div", _hoisted_5, [..._cache[4] || (_cache[4] = [
            createBaseVNode("b", null, "⚠ 社区词表为空", -1),
            createBaseVNode("span", null, " 库里一条社区词都没有了：当前按内置词表（community-sensitive-words.txt）兜底打码， 后台改词暂不生效。请立刻在「社区（打码）」里补词。 ", -1)
          ])])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("span", null, [
              _cache[5] || (_cache[5] = createTextVNode(" 词数 ", -1)),
              createBaseVNode("b", null, toDisplayString(scopeStat.value.enabled || 0), 1),
              scopeStat.value.disabled ? (openBlock(), createElementBlock("span", _hoisted_7, "（停用 " + toDisplayString(scopeStat.value.disabled) + "）", 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("span", _hoisted_8, [
              createTextVNode(" 最近变更 " + toDisplayString(scopeStat.value.lastChangedBy || "—") + " " + toDisplayString(fmt(scopeStat.value.lastChangedAt)) + " ", 1),
              createBaseVNode("span", _hoisted_9, "· 打码来源 " + toDisplayString(summary.value.maskedBy || "—"), 1)
            ]),
            _cache[6] || (_cache[6] = createBaseVNode("span", { class: "spacer" }, null, -1)),
            createBaseVNode("button", {
              class: "btn sm",
              "data-words-export": "",
              disabled: busy.value === "export",
              onClick: doExport
            }, "导出 txt", 8, _hoisted_10)
          ]),
          createBaseVNode("p", _hoisted_11, toDisplayString(current.value.hint), 1),
          createBaseVNode("div", _hoisted_12, [
            _cache[9] || (_cache[9] = createBaseVNode("label", { class: "wd-label" }, "＋ 批量添加（一行一个，也支持逗号 / 顿号分隔，最多 500 条）", -1)),
            withDirectives(createBaseVNode("textarea", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => draft.value = $event),
              class: "wd-ta",
              rows: "4",
              "data-words-input": "",
              placeholder: "赌博\n色情，代考、洗稿"
            }, null, 512), [
              [vModelText, draft.value]
            ]),
            createBaseVNode("div", _hoisted_13, [
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "muted" }, "重复的词会自动跳过；写完立即生效（重建内存词表，不用重启）", -1)),
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "spacer" }, null, -1)),
              createBaseVNode("button", {
                class: "btn primary sm",
                "data-words-import": "",
                disabled: importing.value,
                onClick: doImport
              }, toDisplayString(importing.value ? "导入中…" : "导入"), 9, _hoisted_14)
            ])
          ]),
          createBaseVNode("div", _hoisted_15, [
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => q.value = $event),
              class: "wd-input",
              "data-words-search": "",
              placeholder: "按词搜索",
              onInput: onSearch
            }, null, 544), [
              [vModelText, q.value]
            ])
          ]),
          error.value ? (openBlock(), createElementBlock("div", _hoisted_16, [
            _cache[10] || (_cache[10] = createBaseVNode("b", null, "加载失败", -1)),
            createBaseVNode("span", _hoisted_17, toDisplayString(error.value), 1),
            createBaseVNode("button", {
              class: "btn sm",
              onClick: reloadAll
            }, "重试")
          ])) : loading.value ? (openBlock(), createElementBlock("div", _hoisted_18, "加载中…")) : !items.value.length ? (openBlock(), createElementBlock("div", _hoisted_19, " 这一份词表还没有词。把要遮/要拒的词粘到上面点「导入」即可。 ")) : (openBlock(), createElementBlock("div", _hoisted_20, [
            createBaseVNode("table", null, [
              _cache[11] || (_cache[11] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", { style: { "width": "34%" } }, "词"),
                  createBaseVNode("th", { style: { "width": "90px" } }, "状态"),
                  createBaseVNode("th", { style: { "width": "130px" } }, "创建者"),
                  createBaseVNode("th", { style: { "width": "120px" } }, "时间"),
                  createBaseVNode("th", { style: { "width": "150px" } }, "操作")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (row) => {
                  return openBlock(), createElementBlock("tr", {
                    key: row.id,
                    "data-word-id": row.id,
                    "data-word": row.word
                  }, [
                    createBaseVNode("td", null, [
                      createBaseVNode("b", _hoisted_22, toDisplayString(row.word), 1)
                    ]),
                    createBaseVNode("td", null, [
                      createBaseVNode("span", {
                        class: normalizeClass(["tag", { ok: row.enabled }])
                      }, toDisplayString(row.enabled ? "启用" : "停用"), 3)
                    ]),
                    createBaseVNode("td", _hoisted_23, toDisplayString(row.createdBy || "—"), 1),
                    createBaseVNode("td", _hoisted_24, toDisplayString(fmt(row.createdAt)), 1),
                    createBaseVNode("td", _hoisted_25, [
                      createBaseVNode("button", {
                        class: "btn sm",
                        "data-word-toggle": "",
                        disabled: busy.value === "tg-" + row.id,
                        onClick: ($event) => toggle(row)
                      }, toDisplayString(row.enabled ? "停用" : "启用"), 9, _hoisted_26),
                      createBaseVNode("button", {
                        class: "btn sm danger",
                        "data-word-del": "",
                        disabled: busy.value === "del-" + row.id,
                        onClick: ($event) => remove(row)
                      }, " 删除 ", 8, _hoisted_27)
                    ])
                  ], 8, _hoisted_21);
                }), 128))
              ])
            ])
          ])),
          pages.value > 1 ? (openBlock(), createElementBlock("div", _hoisted_28, [
            createBaseVNode("span", _hoisted_29, toDisplayString(page.value) + " / " + toDisplayString(pages.value) + " 页（共 " + toDisplayString(total.value) + " 条）", 1),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: page.value <= 1,
              onClick: _cache[2] || (_cache[2] = ($event) => goPage(page.value - 1))
            }, "上一页", 8, _hoisted_30),
            createBaseVNode("button", {
              class: "btn sm",
              disabled: page.value >= pages.value,
              onClick: _cache[3] || (_cache[3] = ($event) => goPage(page.value + 1))
            }, "下一页", 8, _hoisted_31)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const WordsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-079ef0b8"]]);
export {
  WordsView as default
};
