import { defineStore } from 'pinia';
import { notifyApi } from '../api.js';
import { useAuthStore } from './auth.js';

/** 通知角标轮询间隔：与旧版 `core.js` 的 NOTIFY_POLL_MS 一致（45 秒）。 */
export const NOTIFY_POLL_MS = 45000;

/**
 * 未读角标（通知）。
 *
 * 迁移期的关键约束（坑 #5）：**同一份数据只能有一个轮询**。
 * 两套前端是两个独立文档（旧页 /siyige/、新页 /siyige/v2/），各跑各的计时器互不影响；
 * 但**在同一个 Vue 应用里**，只允许这个 store 计时，页面组件不许自己 setInterval，
 * 否则退出页面后计时器还在，角标数字会打架。
 *
 * 消息角标（chat unread）是另一份数据，由批 2 的 chat store 负责，同样遵守这条。
 */
export const useUnreadStore = defineStore('unread', {
  state: () => ({
    notifyCount: 0,
    notifyTimer: null
  }),

  actions: {
    /** 拉一次未读数。失败静默（角标是锦上添花，不能打断任何操作）。 */
    async refresh() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.notifyCount = 0;
        return 0;
      }
      try {
        const r = await notifyApi.unreadCount();
        this.notifyCount = Number(r && r.unread) || 0;
      } catch (e) {
        /* 保留旧值 */
      }
      return this.notifyCount;
    },

    /** 登录后启动轮询（幂等：重复调用不会产生第二个计时器）。 */
    start() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.stop();
        return;
      }
      if (this.notifyTimer) return;
      this.refresh();
      this.notifyTimer = setInterval(() => this.refresh(), NOTIFY_POLL_MS);
    },

    stop() {
      if (this.notifyTimer) {
        clearInterval(this.notifyTimer);
        this.notifyTimer = null;
      }
    },

    /** 换账号 / 退出时清空（由 auth store 的 resetAll 调用）。 */
    reset() {
      this.stop();
      this.notifyCount = 0;
    }
  }
});
