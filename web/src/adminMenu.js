/**
 * 管理台侧栏菜单（**数据驱动**，模板里不写死任何一条）。
 *
 * 加一个后台页面 = 新建 `.vue` + `router.js` 加一行 + 这里加一行，布局不用动。
 *
 * 字段：
 * · `to`    目标路由（绝对路径，和 router.js 的嵌套子路由一一对应）
 * · `label` 侧栏文案（也是顶栏标题的兜底）
 * · `icon`  折叠态（56px）只剩它 —— 所以图标必须能独立表意
 * · `badge` 角标取 stores/admin.js 里的哪个字段；不写就没有角标
 *
 * 「报表分析」本期**不建页面**：P0 只做骨架，报表页要等 P3 的
 * `/api/admin/analytics/**` 与 P4 的图表组件，所以整条先注释掉。
 */
export const ADMIN_MENU = [
  {
    group: '总览',
    items: [
      { to: '/admin/dashboard', label: '概览', icon: '◧' },
      { to: '/admin/analytics', label: '报表分析', icon: '◔' }
    ]
  },
  {
    group: '运营',
    items: [
      { to: '/admin/reports', label: '举报处理', icon: '⚑', badge: 'pendingReports' },
      { to: '/admin/content/posts', label: '帖子管理', icon: '▤' },
      { to: '/admin/content/comments', label: '评论管理', icon: '☷' },
      { to: '/admin/video-audit', label: '视频复核', icon: '▷' },
      { to: '/admin/users', label: '用户管理', icon: '☰' },
      { to: '/admin/audit', label: '处理记录', icon: '⟲' }
    ]
  },
  {
    group: '系统',
    items: [
      { to: '/admin/settings', label: '设置', icon: '⚙' }
    ]
  }
];
