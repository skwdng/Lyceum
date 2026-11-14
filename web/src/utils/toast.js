import { reactive } from 'vue';

/**
 * 轻量 toast：等价旧版 `core.js` 的 `toast(msg)`（顶部居中、2.2 秒消失）。
 * 不引 UI 库，10 行够用。
 */
const state = reactive({ items: [] });

let seq = 0;

export const toastState = state;

export function toast(msg, ms = 2200) {
  const id = ++seq;
  state.items.push({ id, msg: String(msg == null ? '' : msg) });
  setTimeout(() => {
    const i = state.items.findIndex((x) => x.id === id);
    if (i >= 0) state.items.splice(i, 1);
  }, ms);
}
