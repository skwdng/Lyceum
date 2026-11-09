import { defineStore } from 'pinia';
import { authApi, ApiError, getToken, setToken } from '../api.js';
import { useUnreadStore } from './unread.js';

/**
 * 登录态。
 *
 * 两条硬规则（都是上一轮真实 bug 换来的）：
 * 1. **token 存在 localStorage['sy_jwt']**，与旧前端共用同一个 key —— 两套页面互跳不掉登录。
 * 2. **换账号必须 reset**：会话/消息/未读缓存都属于上一个账号，不清就会串
 *    （典型症状：点开某个会话标题却是自己、红点消不掉、发消息失败）。
 *    所以 `logout()` 里统一清理所有 store，后续批次新增 store 也要往这里挂。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    /** 上次登录后要回到的页面（等价旧版 S.lastVisitedView） */
    nextPath: null
  }),

  getters: {
    hasToken: () => !!getToken(),
    isLogged: (s) => !!s.user,
    displayName: (s) => (s.user && (s.user.name || s.user.account)) || '未登录'
  },

  actions: {
    /** 启动时用已有 token 恢复身份；失败（401/过期）就当作未登录。 */
    async restore() {
      if (!getToken()) {
        this.user = null;
        return null;
      }
      try {
        this.user = await authApi.me();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === 'UNAUTHORIZED')) {
          this.user = null;
          setToken('');
        }
      }
      return this.user;
    },

    async login(account, password) {
      const res = await authApi.login(account, password);
      this.resetAll();
      if (res && res.token) setToken(res.token);
      this.user = (res && res.user) || null;
      return this.user;
    },

    async register(account, password) {
      const res = await authApi.register(account, password);
      this.resetAll();
      if (res && res.token) setToken(res.token);
      this.user = (res && res.user) || null;
      return this.user;
    },

    async logout() {
      try {
        await authApi.logout();          // 服务端把 jti 拉黑；失败也照样本地退出
      } catch (e) {
        /* 忽略 */
      }
      setToken('');
      this.user = null;
      this.resetAll();
    },

    async rename(name) {
      this.user = await authApi.rename(name);
      return this.user;
    },

    /**
     * 改密码：成功后服务端会把旧令牌判为 TOKEN_STALE，
     * 所以本地立刻清空回登录页——不做"静默换 token"，否则用户会以为旧密码还能用。
     */
    async changePassword(oldPassword, newPassword) {
      await authApi.changePassword(oldPassword, newPassword);
      setToken('');
      this.user = null;
      this.resetAll();
    },

    /** 清空所有与"当前账号"绑定的状态（后续批次在这里追加新的 store）。 */
    resetAll() {
      useUnreadStore().reset();
    }
  }
});
