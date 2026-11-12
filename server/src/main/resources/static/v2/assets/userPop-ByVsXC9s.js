import { M as reactive } from "./index-DDPgDnZA.js";
const state = reactive({
  open: false,
  userId: "",
  x: 0,
  y: 0
});
const listeners = /* @__PURE__ */ new Set();
const userPop = {
  state,
  /** 在点击处打开浮窗；`ev` 可空（键盘触发时按视口中间算）。 */
  open(userId, ev) {
    if (!userId) return;
    state.userId = String(userId);
    state.x = ev && typeof ev.clientX === "number" && ev.clientX ? ev.clientX : Math.round(window.innerWidth / 2);
    state.y = ev && typeof ev.clientY === "number" && ev.clientY ? ev.clientY : 120;
    state.open = true;
  },
  close() {
    state.open = false;
  },
  /** 浮窗里做了什么（禁言/封禁/解封）→ 通知当前页面刷新。 */
  fireChanged() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn("userPop onChanged 回调失败", e);
      }
    });
  },
  /** 订阅"浮窗里改过东西"；返回退订函数。 */
  onChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
export {
  userPop as u
};
