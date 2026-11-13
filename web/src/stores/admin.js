import { defineStore } from 'pinia';
import { adminApi, getAdminToken, setAdminToken } from '../api.js';
import { ADMIN_MENU } from '../adminMenu.js';
import { toast } from '../utils/toast.js';
// 错误文案必须与旧版逐字一致，所以复用同一个 errText（纯函数，不会形成循环依赖）
import { errText } from '../views/admin/helpers.js';

/**
 * 管理台的状态中枢（P0 骨架新增）。
 *
 * 管理台与主站是**两个 app**：独立令牌 `localStorage['sy_admin_jwt']`、独立前缀 `/api/admin`、
 * 独立的登录态。所以这里**不 import auth store**，主站登录/退出与它互不影响。
 *
 * 三条规则（都是这一批的验收点）：
 * 1. `stats` 只在这里取一次（布局挂载时），子页只读 —— 避免每开一个子页都多打一次 `/stats`；
 * 2. 401 只有一个出口 `onUnauthorized()`：清令牌 + 清缓存 + toast，导航由 AdminLayout 收尾；
 * 3. 侧栏折叠状态进 localStorage，刷新后保持。
 */

const COLLAPSED_KEY = 'sy_admin_collapsed';

/** 折叠状态：首次进入默认展开（208px），只有显式折叠过才记住。 */
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch (e) {
    return false;      // 隐私模式下 localStorage 不可用：当作展开，布局仍可用
  }
}

function writeCollapsed(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
  } catch (e) {
    /* 忽略 */
  }
}

/**
 * 从管理员令牌里读 `acc`（账号名），仅用于顶栏展示。
 *
 * 为什么不问后端：`POST /api/admin/auth/login` 只回 `{token}` ——
 * 后端注释写得很清楚「管理员视图里的 id / account 不对外暴露，后台不需要」，
 * 不能为了显示个名字去改接口契约。
 *
 * 这里**不验签**（浏览器也没有密钥）：只解 payload 取展示用字段。
 * 令牌被伪造也拿不到任何数据 —— 真正的鉴权在 `AdminAuthFilter`。
 */
function accountFromToken() {
  const t = getAdminToken();
  if (!t) return '';
  try {
    const part = t.split('.')[1];
    if (!part) return '';
    let s = String(part).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && obj.acc ? String(obj.acc) : '';
  } catch (e) {
    return '';       // 令牌格式不认识：顶栏显示「管理员」，不影响任何功能
  }
}

export const useAdminStore = defineStore('admin', {
  state: () => ({
    /** `/api/admin/stats` 的原始返回；null = 还没拉过 */
    stats: null,
    /** 当前管理员账号（登录时记下 / 刷新时从令牌里解出来） */
    account: accountFromToken(),
    /** 宽屏侧栏是否收起（窄屏用抽屉，不看这个） */
    collapsed: readCollapsed(),
    /**
     * `GET /api/admin/me` 的返回：`{ id, account, role, perms[], mustChangePwd }`。
     *
     * <p>**角色与权限点只在服务端判定，前端只做"显不显示"**：
     * 菜单过滤、按钮显隐都读这里；后端每请求仍会用 `@Require` 再校验一次，
     * 所以就算有人改了前端也没用。
     *
     * <p>为什么不从令牌里解角色：角色存在数据库、**每请求现查**，
     * 改角色要立即生效；写进令牌就得等令牌过期（2 小时）。
     */
    me: null
  }),

  getters: {
    /** 待处理举报数：侧栏「举报处理」的徽标 + 概览页第一张卡 */
    pendingCount: (s) => (s.stats && s.stats.pendingReports) || 0,
    /** 当前角色（SUPER / OPS / MOD / VIEWER），未加载时为空串 */
    role: (s) => (s.me && s.me.role) || '',
    /** 权限点数组（可能为空） */
    perms: (s) => (s.me && s.me.perms) || [],
    /** 首登 / 重置密码后必须先改密 */
    mustChangePwd: (s) => !!(s.me && s.me.mustChangePwd)
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
        // 与旧版一致：只 toast，不把失败当退出（401 由 api.js 广播，另有出口）
        toast(errText(e));
      }
    },

    /**
     * 拉当前身份（角色 + 权限点 + 是否待改密）。
     *
     * <p>登录后、刷新后各调一次；**失败不抛**（没权限时后端 403，页面自己会显示无权限卡片，
     * 不该因此把人踢出去）。首登未改密时 `/me` 是放行的（后端白名单里有它）。
     */
    async loadMe() {
      try {
        this.me = await adminApi.me();
        if (this.me && this.me.account) this.account = this.me.account;
        return this.me;
      } catch (e) {
        // 401 由 api.js 广播统一处理；其余情况保持 me=null（页面按"无权限"渲染）
        this.me = null;
        return null;
      }
    },

    /** 有没有某个权限点（不传 = 没有） */
    has(perm) {
      return !!perm && this.perms.indexOf(perm) >= 0;
    },

    /** 任意一个命中即 true（`@Require` 的 OR 语义与后端一致） */
    hasAny(list) {
      if (!list || !list.length) return true;
      return list.some((p) => this.has(p));
    },

    /**
     * 登录后的落点：第一个有权限的菜单项。
     *
     * <p>为什么不能一律跳 `/admin/dashboard`：概览要 `analytics:read`，
     * 而 MOD 没有这个权限 —— 一登录就撞「无权限」卡片，看着像坏了。
     */
    firstAllowedPath() {
      for (const g of ADMIN_MENU) {
        for (const it of g.items) {
          if (!it.perm || this.has(it.perm)) return it.to;
        }
      }
      return '/admin/settings';
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
      // 先拿身份：菜单/按钮/强制改密都靠它
      await this.loadMe();
      // 概览统计要 analytics:read（MOD 没有），没权限就别白打一次 403
      if (this.has('analytics:read')) await this.loadStats();
      return r;
    },

    /** 退出 / 改密成功：清令牌 + 清本台缓存（下次登录不会看到上一个人的数字）。 */
    logout() {
      setAdminToken('');
      this.stats = null;
      this.account = '';
      this.me = null;
    },

    /**
     * 全台唯一的 401 出口（`api.js` 广播 `sy:admin-unauthorized` 后由布局调用）。
     *
     * 旧版是「清令牌 → 原地变回登录框」；拆页后没有"原地"这个概念了，
     * 所以这里只清状态，跳 `/admin/login` 由 AdminLayout 的监听器做
     * （store 里拿 router 会形成 store → router → views → store 的循环 import）。
     */
    onUnauthorized() {
      setAdminToken('');
      this.stats = null;
      this.account = '';
      this.me = null;
      toast('登录已失效，请重新登录');
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
