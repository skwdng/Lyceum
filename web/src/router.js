import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import LoginView from './views/LoginView.vue';
import MeView from './views/MeView.vue';
import LegacyRedirect from './views/LegacyRedirect.vue';
import NotifyView from './views/NotifyView.vue';
import FriendsView from './views/FriendsView.vue';
import HotView from './views/HotView.vue';
import RecordsView from './views/RecordsView.vue';
import DiagView from './views/DiagView.vue';
import WalletView from './views/WalletView.vue';
import ChatView from './views/ChatView.vue';

/**
 * 路由表。
 *
 * ⚠️ **必须是 hash 模式**：后端是 Spring，没有 SPA fallback，
 * 用 history 模式一刷新就 404（`/siyige/v2/records` 找不到）。
 *
 * 迁移期的两条规则：
 * 1. 已迁移页面 → 挂真组件；
 * 2. 未迁移页面 → 挂 `<LegacyRedirect>`，它把浏览器送到旧前端对应视图（`/siyige/?v=xxx`）。
 *    —— 这样侧栏永远点得通，用户不会撞到空白页，我们也能一批一批搬。
 *
 * `meta.legacy` 的值必须是旧前端 boot() 认得的键（solo/room/hotb/diag/records/community/video/chat/friends/notify/me）。
 */
const routes = [
  // 默认落点必须是**已迁移**的页面。
  // 早先这里 redirect 到 /community，而社区要批 3 才迁，结果是从旧页点「试用新版」进来后
  // 立刻被 LegacyRedirect 送回旧页 —— 用户看到的是"点了没反应"。
  // 现在统一进 /me：未登录时 MeView 自己会再跳 /login，最多一跳。
  { path: '/', redirect: '/me' },

  // ---- 批 0：已经迁移 ----
  { path: '/login', name: 'login', component: LoginView },
  { path: '/me', name: 'me', component: MeView },

  // ---- 批 1：已迁移（通知/好友/热辩榜/记录/诊断/钱包）----
  { path: '/notify', name: 'notify', component: NotifyView, meta: { requiresAuth: true } },
  { path: '/friends', name: 'friends', component: FriendsView, meta: { requiresAuth: true } },
  { path: '/hot', name: 'hot', component: HotView },
  { path: '/records', name: 'records', component: RecordsView, meta: { requiresAuth: true } },
  { path: '/diag', name: 'diag', component: DiagView, meta: { requiresAuth: true } },
  { path: '/wallet', name: 'wallet', component: WalletView, meta: { requiresAuth: true } },

  // ---- 批 2 ----
  { path: '/solo', name: 'solo', component: LegacyRedirect, meta: { requiresAuth: true, legacy: 'solo' } },
  { path: '/room', name: 'room', component: LegacyRedirect, meta: { requiresAuth: true, legacy: 'room' } },
  { path: '/chat', name: 'chat', component: ChatView, meta: { requiresAuth: true } },
  { path: '/match', name: 'match', component: LegacyRedirect, meta: { requiresAuth: true, legacy: 'solo' } },
  { path: '/review', name: 'review', component: LegacyRedirect, meta: { requiresAuth: true, legacy: 'records' } },

  // ---- 批 3 ----
  { path: '/community', name: 'community', component: LegacyRedirect, meta: { legacy: 'community' } },
  { path: '/video', name: 'video', component: LegacyRedirect, meta: { legacy: 'video' } },

  // 兜底：未知路径回 /me（同样不能回落到旧页，否则等于把人赶走）
  { path: '/:pathMatch(.*)*', redirect: '/me' }
];

const router = createRouter({
  // hash 模式不传 base：路由只用 # 后面的部分，与资源前缀（vite 的 base）解耦。
  // 传 import.meta.env.BASE_URL 的话，base 改成相对路径 './' 后这里会拿到 './'，容易出怪 URL。
  history: createWebHashHistory(),
  routes
});

/**
 * 登录守卫：等价于旧版的 `LOGIN_ONLY_VIEWS` + `needLogin()`。
 *
 * 未登录时给的是**登录引导卡**（由 AppShell 渲染），不是硬跳登录页——
 * 旧版行为就是这样：点「辩论记录」先看到「登录后可见」，再点按钮去登录。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // 首次进入时 token 还在、user 还没恢复：先恢复一次，否则刷新后会误判成未登录
  if (!auth.user && auth.hasToken) await auth.restore();
  return true;
});

export default router;
