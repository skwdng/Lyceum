import { P as defineStore, Q as getAdminToken, R as API_BASE, q as adminApi } from "./index-CIsE9tB3.js";
const useAlertStore = defineStore("alert", {
  state: () => ({
    unread: 0,
    items: [],
    total: 0,
    openTotal: 0,
    /** 当前列表视角：OPEN | ALL */
    status: "OPEN",
    /** 已静音的规则 [{ruleKey,label,until,mutedBy}] */
    mutes: [],
    loading: false,
    error: "",
    /** 本次会话是否已弹过"有未处理告警"的提示（只弹一次） */
    toasted: false,
    es: null,
    pollTimer: null,
    /** 断线重连的定时器与退避（别每 5 秒硬撞一次，撞多了会占满浏览器同源连接槽） */
    reconnectTimer: null,
    retryMs: 5e3,
    pollMs: 6e4
  }),
  getters: {
    /** 顶栏红点文案：>99 显示 99+（与侧栏徽标同一套口径） */
    badge: (s) => s.unread > 99 ? "99+" : String(s.unread || ""),
    mutedRules: (s) => new Set((s.mutes || []).map((m) => m.ruleKey))
  },
  actions: {
    async refreshUnread() {
      try {
        const r = await adminApi.alertUnread();
        this.unread = r && r.unread || 0;
        return this.unread;
      } catch (e) {
        return this.unread;
      }
    },
    async refreshList(status = this.status) {
      this.status = status === "ALL" ? "ALL" : "OPEN";
      this.loading = true;
      this.error = "";
      try {
        const r = await adminApi.alerts(this.status, 1, 100);
        this.items = r && r.items || [];
        this.total = r && r.total || 0;
        this.openTotal = r && r.openTotal || 0;
        this.unread = r && r.unread || 0;
        this.mutes = r && r.mutes || [];
      } catch (e) {
        this.error = e && e.message || "加载失败";
        this.items = [];
        this.total = 0;
      } finally {
        this.loading = false;
      }
    },
    async ack(id, note) {
      const r = await adminApi.alertAck(id, note);
      this.unread = r && r.unread != null ? r.unread : this.unread;
      await this.refreshList(this.status);
      return r;
    },
    async reopen(id) {
      const r = await adminApi.alertReopen(id);
      this.unread = r && r.unread != null ? r.unread : this.unread;
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
      this.unread = r && r.unread != null ? r.unread : this.unread;
      await this.refreshList(this.status);
      return r;
    },
    /** 建 SSE 连接；连不上就静默失败，交给 60 秒轮询兜底 */
    connectSse() {
      if (this.es || typeof EventSource === "undefined") return;
      const token = getAdminToken();
      if (!token) return;
      try {
        const es = new EventSource(API_BASE + "/api/admin/alerts/stream?token=" + encodeURIComponent(token));
        es.addEventListener("alert", (ev) => {
          try {
            const d = JSON.parse(ev.data || "{}");
            if (d && typeof d.unread === "number") this.unread = d.unread;
          } catch (e) {
            this.refreshUnread();
          }
        });
        es.onopen = () => {
          this.retryMs = 5e3;
        };
        es.onerror = () => {
          try {
            es.close();
          } catch (e) {
          }
          if (this.es === es) this.es = null;
          this.scheduleReconnect();
        };
        this.es = es;
      } catch (e) {
        this.es = null;
        this.scheduleReconnect();
      }
    },
    /** 指数退避重连：5s → 10s → 20s → 30s 封顶（连不上时不至于一直占连接） */
    scheduleReconnect() {
      if (this.reconnectTimer) return;
      if (!getAdminToken()) return;
      const delay = Math.min(3e4, this.retryMs);
      this.retryMs = Math.min(3e4, this.retryMs * 2);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectSse();
      }, delay);
    },
    disconnectSse() {
      if (this.es) {
        try {
          this.es.close();
        } catch (e) {
        }
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
      if (!this.pagehideBound) {
        this.pagehideBound = true;
        const bye = () => this.disconnectSse();
        window.addEventListener("pagehide", bye);
        window.addEventListener("beforeunload", bye);
      }
    },
    /** 退出登录 / 401 时调用：断连接、停轮询、清数字（别让下一个人看见上一个人的红点） */
    stopAll() {
      this.disconnectSse();
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.retryMs = 5e3;
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
export {
  useAlertStore as u
};
