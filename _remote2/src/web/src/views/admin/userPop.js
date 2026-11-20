/**
 * 用户违规浮窗的**全局单例状态**。
 *
 * 为什么不让每个页面各自 `const pop = ref(null)` + 自己渲染一份 `UserProfilePop`：
 * 管理台里"用户名"出现在七八个地方（帖子列表、评论树、评论列表、用户列表、视频列表、
 * 处理记录的对象列、举报队列、详情抽屉里的作者…），每处复制一遍状态意味着
 * 每加一个地方就可能漏一处 —— 而漏的那处恰恰是用户点了没反应的坑。
 *
 * 现在：`AdminLayout` 里只渲染**一个**浮窗实例，任何地方点用户名都调 `userPop.open(id, event)`。
 *
 * `onChanged` 是给当前页面用的：浮窗里禁言/封禁完，列表状态要跟着变。
 * 页面在 onMounted 订阅、onUnmounted 退订（`open()` 返回退订函数，用起来就一行）。
 */
import { reactive } from 'vue';

const state = reactive({
  open: false,
  userId: '',
  x: 0,
  y: 0
});

const listeners = new Set();

export const userPop = {
  state,

  /** 在点击处打开浮窗；`ev` 可空（键盘触发时按视口中间算）。 */
  open(userId, ev) {
    if (!userId) return;
    state.userId = String(userId);
    state.x = ev && typeof ev.clientX === 'number' && ev.clientX ? ev.clientX : Math.round(window.innerWidth / 2);
    state.y = ev && typeof ev.clientY === 'number' && ev.clientY ? ev.clientY : 120;
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
        // 订阅方自己的刷新失败不该连累浮窗
        console.warn('userPop onChanged 回调失败', e);
      }
    });
  },

  /** 订阅"浮窗里改过东西"；返回退订函数。 */
  onChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
