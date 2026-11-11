/**
 * 模块浏览上报（管理台报表 P1 的前端一半）。
 *
 * 链路：`router.afterEach` -> 本文件把「路径」映射成「模块」-> `POST /api/track/pv`。
 *
 * 三条约定（设计文档 §2.1 / §2.2）：
 * 1. **统计单位是模块，不是页面路径**：11 个模块固定，映射表就是下面这份；
 *    不在表里的路由（/login、/me、/notify）**不上报** —— 它们属于"功能"不是"模块"，
 *    统计进去会让排行失真。以后要加只加一行，表结构不用动。
 * 2. **同一模块连续切换不重复上报**：在 `/community` 列表和 `/community/12` 之间来回点，
 *    只算一次（lastModule 去抖）；切到别的模块再回来会重新计。
 * 3. **上报绝不打扰用户**：失败静默（连日志都不打），统计可丢，页面不能因此报错。
 *
 * 为什么不由后端按接口统计：SPA 跳一次页面会打一串接口（/me、列表、未读数…），
 * 按接口算会把 1 次访问算成 5～8 次。
 */
import { http } from '../api.js';

/** 路由前缀 -> 模块。顺序即匹配优先级（越具体越靠前）。 */
export const MODULE_OF = [
  [/^\/community/, 'community'],
  [/^\/post\//, 'community'],
  [/^\/chat\//, 'chat'],
  [/^\/match\//, 'match'],
  [/^\/room\//, 'match'],
  [/^\/solo/, 'solo'],
  [/^\/video/, 'video'],
  [/^\/hot/, 'hot'],
  [/^\/diag/, 'diag'],
  [/^\/records/, 'records'],
  [/^\/wallet/, 'wallet'],
  [/^\/friends/, 'friends'],
  [/^\/admin/, 'admin']
];

/** 路径 -> 模块名；不在统计范围内返回 null。 */
export function moduleOf(path) {
  if (!path) return null;
  for (const [re, m] of MODULE_OF) if (re.test(path)) return m;
  return null;
}

/** 上一次报过的模块：同模块连续切换去抖用（页面生命周期内有效，刷新后归零） */
let lastModule = null;

/**
 * 上报一次页面浏览。签名与 router.afterEach 的第一参数兼容（传 route.path）。
 *
 * 匿名可上报（后端不要求登录）；带登录态时后端会顺带把 userId 记进 UV。
 * 注意 `http.post` 会自动带 `Authorization`，所以这里不用额外处理令牌。
 */
export function trackView(path) {
  try {
    const module = moduleOf(path);
    if (!module || module === lastModule) return;
    lastModule = module;
    http.post('/api/track/pv', { module }).catch(() => {
      /* 静默：统计失败不影响任何用户可见行为 */
    });
  } catch (e) {
    /* 连路由映射出错也不许冒泡 */
  }
}

/** 仅供单测/调试：重置去抖状态。 */
export function resetTrackState() {
  lastModule = null;
}
