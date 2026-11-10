import { ref, reactive } from 'vue';
import { communityApi } from '../api.js';

/**
 * @ 提及候选（移植旧 community.js 的 CM_MENTION 那一段）。
 *
 * 交互与旧版一致：打 `@` + 至少 1 个字符 → 弹候选（昵称前缀匹配，≤10 条）；
 * ↑↓ 选择、Enter 选中、Esc 关闭、点选用 mousedown（避免 textarea 先失焦）。
 * 提交时只带「正文里还留着 @昵称」的 id（去重、最多 10 个）。
 *
 * 身份只认 userId：前端不按昵称猜人，最终以服务端校验为准。
 */
export function useMention() {
  const state = reactive({ open: false, items: [], active: 0, query: '', start: 0, left: 0, top: 0 });
  const picked = ref([]);
  let timer = null;
  let el = null;

  function close() {
    state.open = false;
    state.items = [];
  }

  async function fetchCandidates(q) {
    try {
      const r = await communityApi.users(q);
      if (state.query !== q) return;         // 竞态：期间又打了字
      state.items = (r && r.items) || [];
      state.active = 0;
      state.open = state.items.length > 0;
      if (state.open && el) {
        const rect = el.getBoundingClientRect();
        state.left = Math.round(rect.left + 12);
        state.top = Math.round(rect.bottom + 6);
      }
    } catch (e) {
      close();
    }
  }

  /** 绑定到 textarea 的 input 事件 */
  function onInput(e) {
    const target = e.target;
    el = target;
    const v = String(target.value || '');
    const caret = target.selectionStart == null ? v.length : target.selectionStart;
    const upTo = v.slice(0, caret);
    const m = upTo.match(/@([^\s@]{0,20})$/);
    if (!m) return close();
    state.start = caret - m[0].length;
    state.query = m[1];
    if (!m[1]) return close();               // 只打了一个 @：先不查
    clearTimeout(timer);
    timer = setTimeout(() => fetchCandidates(m[1]), 150);
  }

  /** 绑定到 textarea 的 keydown 事件；返回 true 表示已被提及弹层消费掉 */
  function onKey(e) {
    if (!state.open || !state.items.length) return false;
    const n = state.items.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.active = (state.active + 1) % n;
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.active = (state.active - 1 + n) % n;
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(state.active);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return true;
    }
    return false;
  }

  /** 选中第 i 个候选：替换掉正在输入的 `@query`，插入 `@昵称 ` 并记住 id */
  function pick(i) {
    const it = state.items[i];
    if (!it || !el) return;
    const v = String(el.value || '');
    const caret = el.selectionStart == null ? v.length : el.selectionStart;
    const before = v.slice(0, state.start);
    const after = v.slice(caret);
    const insert = '@' + it.name + ' ';
    el.value = before + insert + after;
    const pos = (before + insert).length;
    try {
      el.setSelectionRange(pos, pos);
    } catch (e) {
      /* 忽略 */
    }
    el.focus();
    // 通知外部（v-model 绑不上手工赋值的 value，得手动同步）
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (!picked.value.some((x) => x.id === it.id)) picked.value.push({ id: it.id, name: it.name });
    close();
  }

  /** 提交时算出 mentions：只带正文里还留着 @昵称 的，去重、最多 10 个 */
  function ids(text) {
    const body = String(text || '');
    const out = [];
    picked.value.forEach((x) => {
      if (out.length < 10 && body.indexOf('@' + x.name) >= 0 && out.indexOf(x.id) < 0) out.push(x.id);
    });
    return out;
  }

  function reset() {
    picked.value = [];
    close();
  }

  return { state, picked, onInput, onKey, pick, ids, reset, close };
}
