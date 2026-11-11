import { B as ApiError, C as defineStore, D as setAdminToken, s as toast, A as adminApi, E as getAdminToken } from "./index-KN7ZVkHG.js";
function errText(e) {
  if (e instanceof ApiError) return e.message || e.code;
  return e && e.message || "操作失败";
}
function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function reasonName(k) {
  const m = { SPAM: "垃圾广告", ABUSE: "人身攻击", ILLEGAL: "违法违规", OTHER: "其他" };
  return m[k] || k;
}
function actionName(k) {
  const m = { IGNORE: "忽略", DELETE: "删除内容", BAN: "禁言", DELETE_AND_BAN: "删除并禁言", RESTORE: "撤销处理" };
  return m[k] || k;
}
const COLLAPSED_KEY = "sy_admin_collapsed";
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch (e) {
    return false;
  }
}
function writeCollapsed(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch (e) {
  }
}
function accountFromToken() {
  const t = getAdminToken();
  if (!t) return "";
  try {
    const part = t.split(".")[1];
    if (!part) return "";
    let s = String(part).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && obj.acc ? String(obj.acc) : "";
  } catch (e) {
    return "";
  }
}
const useAdminStore = defineStore("admin", {
  state: () => ({
    /** `/api/admin/stats` 的原始返回；null = 还没拉过 */
    stats: null,
    /** 当前管理员账号（登录时记下 / 刷新时从令牌里解出来） */
    account: accountFromToken(),
    /** 宽屏侧栏是否收起（窄屏用抽屉，不看这个） */
    collapsed: readCollapsed()
  }),
  getters: {
    /** 待处理举报数：侧栏「举报处理」的徽标 + 概览页第一张卡 */
    pendingCount: (s) => s.stats && s.stats.pendingReports || 0
  },
  actions: {
    /**
     * 有没有令牌（真正的有效性由后端判定）。
     *
     * ⚠️ 故意写成**方法**而不是 getter：Pinia 的 getter 是 computed，若它不读 state
     * （这里是直接查 localStorage），值会被永久缓存 —— 登录/退出后不更新，
     * 将来谁拿它做 `v-if` 就会踩「已登录却显示登录框」。方法每次现算，没有这个坑。
     */
    hasToken() {
      return !!getAdminToken();
    },
    /** 拉统计（布局挂载时 / 登录成功后 / 处置完举报后调） */
    async loadStats() {
      try {
        this.stats = await adminApi.stats();
      } catch (e) {
        toast(errText(e));
      }
    },
    /**
     * 登录：换令牌 + 记账号 + 拉一次统计。
     *
     * 表单校验（空账号/空密码、busy 防重）留在 AdminLogin.vue —— 那是页面的事；
     * 这里只负责「拿到令牌之后的状态」。
     */
    async login(accountName, password) {
      const r = await adminApi.login(accountName, password);
      if (r && r.token) setAdminToken(r.token);
      this.account = accountName;
      await this.loadStats();
      return r;
    },
    /** 退出 / 改密成功：清令牌 + 清本台缓存（下次登录不会看到上一个人的数字）。 */
    logout() {
      setAdminToken("");
      this.stats = null;
      this.account = "";
    },
    /**
     * 全台唯一的 401 出口（`api.js` 广播 `sy:admin-unauthorized` 后由布局调用）。
     *
     * 旧版是「清令牌 → 原地变回登录框」；拆页后没有"原地"这个概念了，
     * 所以这里只清状态，跳 `/admin/login` 由 AdminLayout 的监听器做
     * （store 里拿 router 会形成 store → router → views → store 的循环 import）。
     */
    onUnauthorized() {
      setAdminToken("");
      this.stats = null;
      this.account = "";
      toast("登录已失效，请重新登录");
    },
    /** 折叠 / 展开（宽屏），并记住到下次打开 */
    setCollapsed(v) {
      this.collapsed = !!v;
      writeCollapsed(this.collapsed);
    },
    toggleCollapsed() {
      this.setCollapsed(!this.collapsed);
    }
  }
});
export {
  actionName as a,
  errText as e,
  fmtTime as f,
  reasonName as r,
  useAdminStore as u
};
