import { defineStore } from 'pinia';
import { adminApi, getAdminToken, API_BASE } from '../api.js';

/**
 * 管理台告警 store（A3）。
 *
 * <p>红点数字是**唯一真源里的唯一真源**：只认后端 `count(*) where status='OPEN'`，
 * 前端不做乐观加减（少一次"点了没变/变了又跳回去"的解释成本）。所以这三个动作都是
 * 「调完接口 → 重新拉未读数」，而不是本地 +/-1。
 *
 * <p>三路并用（设计 §6.1）：
 * <ol>
 *   <li>进管理台先拉一次 <code>/unread</code></li>
 *   <li>SSE 在线：收到 `alert` 事件立刻拉一次（秒级）</li>
 *   <li>60 秒轮询兜底（SSE 被代理掐掉、断网重连的空窗期都不漏）</li>
 * </ol>
 *
 * <p>SSE 的令牌只能放 `?token=`（EventSource 不能设请求头）—— 后端只对
 * `/api/admin/alerts/stream` 开这个例外，别的路径仍然只认 Authorization。
 */
export const useAlertStore = defineStore('alert', {
  state: () => ({
    unread: 0,
    items: [],
    total: 0,
    openTotal: 0,
    /** 当前列表视角：OPEN | ALL */
    status: 'OPEN',
    /** 已静音的规则 [{ruleKey,label,until,mutedBy}] */
    mutes: [],
    loading: false,
    error: '',
    /** 本次会话是否已弹过"有未处理告警"的提示（只弹一次） */
    toasted: false,
    es: null,
    pollTimer: null,
    pollMs: 60_000
  }),

  getters: {
    /** 顶栏红点文案：>99 显示 99+（与侧栏徽标同一套口径） */
    badge: (s) => (s.unread > 99 ? '99+' : String(s.unread || '')),
    mutedRules: (s) => new Set((s.mutes || []).map((m) => m.ruleKey))
  },

  actions: {
    async refreshUnread() {
      try {
        const r = await adminApi.alertUnread();
        this.unread = (r && r.unread) || 0;
        return this.unread;
      } catch (e) {
        // 未读数拉不到就维持原值：红点不该因为一次网络抖动变成 0（会让人以为处理完了）
        return this.unread;
      }
    },

    async refreshList(status = this.status) {
      this.status = status === 'ALL' ? 'ALL' : 'OPEN';
      this.loading = true;
      this.error = '';
      try {
        const r = await adminApi.alerts(this.status, 1, 100);
        this.items = (r && r.items) || [];
        this.total = (r && r.total) || 0;
        this.openTotal = (r && r.openTotal) || 0;
        this.unread = (r && r.unread) || 0;
        this.mutes = (r && r.mutes) || [];
      } catch (e) {
        this.error = (e && e.message) || '加载失败';
        this.items = [];
        this.total = 0;
      } finally {
        this.loading = false;
      }
    },

    async ack(id, note) {
      const r = await adminApi.alertAck(id, note);
      this.unread = (r && r.unread != null) ? r.unread : this.unread;
      await this.refreshList(this.status);
      return r;
    },

    async reopen(id) {
      const r = await adminApi.alertReopen(id);
      this.unread = (r && r.unread != null) ? r.unread : this.unread;
      await this.refreshList(this.status);
      return r;
    },

    async mute(ruleKey, untilMs) {
      await adminApi.alertMute(ruleKey, untilMs);
      await this.refreshList(this.status);
    },

    async unmute(ruleKey) {
      await adminApi.alertUnmute(ruleKey);
      await this.refreshList(this.status);
    },

    async scan() {
      const r = await adminApi.alertScan();
      this.unread = (r && r.unread != null) ? r.unread : this.unread;
      await this.refreshList(this.status);
      return r;
    },

    /** 建 SSE 连接；连不上就静默失败，交给 60 秒轮询兜底 */
    connectSse() {
      if (this.es || typeof EventSource === 'undefined') return;
      const token = getAdminToken();
      if (!token) return;
      try {
        const es = new EventSource(API_BASE + '/api/admin/alerts/stream?token=' + encodeURIComponent(token));
        es.addEventListener('alert', (ev) => {
          try {
            const d = JSON.parse(ev.data || '{}');
            if (d && typeof d.unread === 'number') this.unread = d.unread;
          } catch (e) {
            this.refreshUnread();
          }
        });
        es.onerror = () => {
          // 断了就关掉：浏览器会自动重连，但重连期间交给轮询，避免"两条腿都断"
          try { es.close(); } catch (e) { /* 忽略 */ }
          this.es = null;
          setTimeout(() => this.connectSse(), 5000);
        };
        this.es = es;
      } catch (e) {
        this.es = null;
      }
    },

    disconnectSse() {
      if (this.es) {
        try { this.es.close(); } catch (e) { /* 忽略 */ }
        this.es = null;
      }
    },

    /** 60 秒轮询（兜底）；重复调用不会叠加定时器 */
    startPolling() {
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => {
        if (getAdminToken()) this.refreshUnread();
      }, this.pollMs);
    },

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },

    /** 进管理台时调用：拉一次 + 连 SSE + 起轮询 */
    async start() {
      await this.refreshUnread();
      this.connectSse();
      this.startPolling();
    },

    /** 退出登录 / 401 时调用：断连接、停轮询、清数字（别让下一个人看见上一个人的红点） */
    stopAll() {
      this.disconnectSse();
      this.stopPolling();
      this.unread = 0;
      this.items = [];
      this.total = 0;
      this.openTotal = 0;
      this.mutes = [];
      this.toasted = false;
    }
  }
});
