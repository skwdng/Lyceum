/**
 * 侧栏导航（与旧版 `core.js` 的 NAV 完全对应，顺序/分组/文案都不改）。
 *
 * `k` 同时是路由名：已经迁移的页面在 router.js 里挂真组件，
 * 没迁移的挂 `<LegacyRedirect>`（跳到旧前端对应视图）——这样迁移期侧栏 15 项永远点得通。
 */
export const NAV = [
  { g: '训练' },
  { k: 'solo', n: '单人辩论' },
  { k: 'room', n: '多人辩论' },
  { k: 'hot', n: '热辩榜' },
  { g: '我的' },
  { k: 'diag', n: '能力诊断' },
  { k: 'records', n: '辩论记录' },
  { g: '社区' },
  { k: 'community', n: '讨论社区' },
  { g: '视频' },
  { k: 'video', n: '视频' },
  { g: '消息' },
  { k: 'chat', n: '消息' },
  { k: 'friends', n: '好友' },
  { k: 'notify', n: '通知' }
];

/** 旧前端的 `?v=` 只认这些键（见旧 core.js 的 boot()），用于 LegacyRedirect 兜底。 */
export const LEGACY_VIEWS = ['solo', 'room', 'hotb', 'diag', 'records', 'community', 'video', 'chat', 'friends', 'notify', 'me'];
