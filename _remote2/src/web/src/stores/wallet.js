import { defineStore } from 'pinia';
import { walletApi } from '../api.js';
import { useAuthStore } from './auth.js';

/**
 * 钱包（余额 + 计价参数）。
 *
 * 为什么放进 store 而不是页面内：侧栏的余额胶囊、钱包页、批 2 复盘页的「本场费用」
 * 用的是同一份 `/api/wallet` 结果，三处各拉一次会不一致（尤其刚充完值）。
 */
export const useWalletStore = defineStore('wallet', {
  state: () => ({
    info: null,
    loading: false
  }),

  getters: {
    /** 余额（分）；未加载时给 null，界面上显示「—」而不是假装的 0 */
    balanceCents: (s) => (s.info ? Number(s.info.balanceCents) || 0 : null)
  },

  actions: {
    async refresh() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.info = null;
        return null;
      }
      this.loading = true;
      try {
        this.info = await walletApi.info();
        return this.info;
      } catch (e) {
        this.info = null;      // 拉不到就显示「—」，不要留着上个账号的余额
        return null;
      } finally {
        this.loading = false;
      }
    },

    /** 换账号 / 退出时清空（由 auth.resetAll 调用） */
    reset() {
      this.info = null;
      this.loading = false;
    }
  }
});
