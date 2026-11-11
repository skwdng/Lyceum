import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { getAdminToken } from './api.js';
import LoginView from './views/LoginView.vue';
import MeView from './views/MeView.vue';
import NotifyView from './views/NotifyView.vue';
import FriendsView from './views/FriendsView.vue';
import HotView from './views/HotView.vue';
import RecordsView from './views/RecordsView.vue';
import DiagView from './views/DiagView.vue';
import WalletView from './views/WalletView.vue';
import ChatView from './views/ChatView.vue';
import SoloView from './views/SoloView.vue';
import MatchView from './views/MatchView.vue';
import ReviewView from './views/ReviewView.vue';
import RoomView from './views/RoomView.vue';
import CommunityView from './views/CommunityView.vue';
import PostDetailView from './views/PostDetailView.vue';
import VideoView from './views/VideoView.vue';

/**
 * 路由表。
 *
 * ⚠️ **必须是 hash 模式**：后端是 Spring，没有 SPA fallback，
 * 用 history 模式一刷新就 404（`/siyige/v2/records` 找不到）。
 *
 * 迁移期的两条规则：
 * 1. 已迁移页面 → 挂真组件；
 * 2. 批 4 之后所有页面都在本应用内，旧前端已删除，没有任何回落路由。
 *    —— 这样侧栏永远点得通，用户不会撞到空白页，我们也能一批一批搬。
 *
 * `meta.legacy` 的值必须是旧前端 boot() 认得的键（solo/room/hotb/diag/records/community/video/chat/friends/notify/me）。
 */
const routes = [
  // 默认落点必须是**已迁移**的页面。
  // 早先这里 redirect 到 /community，而社区要批 3 才迁，结果是从旧页点「试用新版」进来后
  // 用 catch-all 兜住 —— 否则用户会看到"点了没反应"。
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

  // ---- 批 2：单人/对局/复盘已迁移，房间待迁 ----
  { path: '/solo', name: 'solo', component: SoloView, meta: { requiresAuth: true } },
  { path: '/room', name: 'room', component: RoomView, meta: { requiresAuth: true } },
  { path: '/chat', name: 'chat', component: ChatView, meta: { requiresAuth: true } },
  { path: '/match', name: 'match', component: MatchView, meta: { requiresAuth: true } },
  { path: '/review', name: 'review', component: ReviewView, meta: { requiresAuth: true } },

  // ---- 批 3 ----
  { path: '/community', name: 'community', component: CommunityView },
  // 帖子详情走真实路由：通知点「帖子类」通知可以直接深链过来（?around=<评论id> 定位楼层）
  { path: '/community/:postId', name: 'community-post', component: PostDetailView },
  { path: '/video', name: 'video', component: VideoView },
  // 管理后台是独立 app：裸布局（无主站侧栏）、自己的令牌 sy_admin_jwt、自己的前缀 /api/admin。
  // 结构与设计文档 §4.2 一致：父级只做布局（AdminLayout = 侧栏 + 顶栏 + RouterView），
  // 子页全部懒加载 —— 首屏只加载布局，进哪个子页才拉哪个子页的 chunk。
  //
  // meta 会沿匹配链合并：父级的 bare:true 对子路由同样生效（App.vue 靠它跳过 AppShell），
  // 子级各自的 title 给顶栏用，guest:true 表示"登录页，不需要令牌"。
  {
    path: '/admin',
    meta: { bare: true },
    component: () => import('./views/admin/AdminLayout.vue'),
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'login', name: 'admin-login', component: () => import('./views/admin/AdminLogin.vue'), meta: { guest: true } },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('./views/admin/DashboardView.vue'), meta: { title: '概览' } },
      {
        path: 'reports',
        name: 'admin-reports',
        component: () => import('./views/admin/ReportsView.vue'),
        meta: { title: '举报处理', badge: 'pendingReports' }
      },
      { path: 'users', name: 'admin-users', component: () => import('./views/admin/UsersView.vue'), meta: { title: '用户管理' } },
      { path: 'audit', name: 'admin-audit', component: () => import('./views/admin/AuditView.vue'), meta: { title: '处理记录' } },
      { path: 'settings', name: 'admin-settings', component: () => import('./views/admin/SettingsView.vue'), meta: { title: '设置' } }
    ]
  },

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
 *
 * 管理台的门禁也在这里，但用的是**另一套令牌**（`sy_admin_jwt`）：
 * 管理台没有"引导卡"，没令牌就直接赶回登录页 —— 与旧 admin.js 一致。
 */
const ADMIN_LOGIN_PATH = '/admin/login';

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // 首次进入时 token 还在、user 还没恢复：先恢复一次，否则刷新后会误判成未登录
  if (!auth.user && auth.hasToken) await auth.restore();

  // 管理台：与上面的用户登录态完全无关（两个 app、两套令牌）
  if (to.path === '/admin' || to.path.startsWith('/admin/')) {
    const hasAdmin = !!getAdminToken();
    // 无令牌且目标不是登录页 -> 登录页（深链 /admin/reports 刷新后也不会白屏）
    if (!hasAdmin && to.meta.guest !== true) return { path: ADMIN_LOGIN_PATH, replace: true };
    // 已登录还去登录页 -> 概览（避免登录后按浏览器"后退"又回到表单）
    if (hasAdmin && to.meta.guest === true) return { path: '/admin/dashboard', replace: true };
  }

  return true;
});

export default router;
