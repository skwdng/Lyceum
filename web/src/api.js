/**
 * 请求层：与旧版 `js/core.js` 的 `api()` 行为**逐条对齐**（迁移期两套前端连的是同一个后端，
 * 任何细微差异都会表现成「旧页能用、新页报错」）。
 *
 * 三条必须保持一致的约定：
 * 1. 前缀：`API_BASE = pathname 以 /siyige 开头 ? '/siyige' : ''`，**不是**写死 `/siyige/api`。
 *    线上 nginx 把 /siyige/ 反代到后端根路径，本地没有前缀，两种都要能跑。
 * 2. 登录态：同一个 `localStorage['sy_jwt']`。两套页面互跳不掉登录，靠的就是这个 key。
 * 3. 错误：非 2xx 抛出带 `code` 的错误（后端错误体是 `{code,message}`）；
 *    401 时清掉本地 token（旧版也是这么做的），并广播事件让 store 清状态。
 */

export const TOKEN_KEY = 'sy_jwt';

export const API_BASE =
  typeof location !== 'undefined' && location.pathname.indexOf('/siyige') === 0 ? '/siyige' : '';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (e) {
    return '';           // 隐私模式等场景 localStorage 可能不可用
  }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    /* 忽略 */
  }
}

/** 统一错误类型：`code` 来自后端错误体，`status` 是 HTTP 状态码。 */
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.code = code || '';
    this.status = status || 0;
  }
}

/**
 * 发一个请求。
 *
 * @param {string} path 以 / 开头的接口路径（如 `/api/auth/me`），**不要**带 /siyige
 * @param {{method?:string, body?:any, auth?:boolean}} [opts]
 */
export async function request(path, opts = {}) {
  const method = opts.method || 'GET';
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let resp;
  try {
    resp = await fetch(API_BASE + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) {
    throw new ApiError('后端未连接', 'NETWORK', 0);
  }

  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;      // 非 JSON（比如 502 的 HTML 错误页）：保留原文当 message
    }
  }

  if (resp.status === 401) {
    // 令牌过期 / 被登出：清本地，让上层回登录页（不自动重试原请求，与旧版决策 A5 一致）
    setToken('');
    window.dispatchEvent(new CustomEvent('sy:unauthorized'));
  }

  if (!resp.ok) {
    const message = (data && data.message) || (typeof text === 'string' && text) || 'HTTP ' + resp.status;
    throw new ApiError(message, (data && data.code) || 'HTTP_' + resp.status, resp.status);
  }
  return data;
}

export const http = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' })
};

// ==================== 认证（对应旧版 auth.js 的 authApi + 各动作） ====================

export const authApi = {
  login: (account, password) => http.post('/api/auth/login', { account, password }),
  register: (account, password) => http.post('/api/auth/register', { account, password }),
  logout: () => http.post('/api/auth/logout'),
  me: () => http.get('/api/auth/me'),
  rename: (name) => http.patch('/api/auth/me', { name }),
  changePassword: (oldPassword, newPassword) => http.patch('/api/auth/password', { oldPassword, newPassword })
};

// ==================== 基础数据（匿名可访问） ====================

export const baseApi = {
  topics: () => http.get('/api/topics'),
  hot: (n = 12) => http.get('/api/hot?n=' + n),
  /** n>0 只看最近 n 场；0/省略 = 全部（累计滑动平均） */
  diag: (n) => http.get('/api/diag' + (n > 0 ? '?n=' + n : '')),
  records: () => http.get('/api/records')
};

// ==================== 通知（批 1） ====================

// ==================== 好友（批 1） ====================

export const socialApi = {
  friends: () => http.get('/api/social/friends'),
  requests: () => http.get('/api/social/friends/requests'),
  /** 搜人：账号要完全一致，昵称可以是片段（后端规则，前端不猜） */
  search: (q) => http.get('/api/social/users?q=' + encodeURIComponent(q)),
  request: (toId, note) => http.post('/api/social/friends/requests', { toId, note: note || null }),
  accept: (requestId) => http.post('/api/social/friends/requests/' + requestId + '/accept'),
  reject: (requestId) => http.post('/api/social/friends/requests/' + requestId + '/reject'),
  unfriend: (userId) => http.del('/api/social/friends/' + encodeURIComponent(userId))
};

// ==================== 社区（批 3） ====================

export const communityApi = {
  /** 列表：type/title/topicId/range/sort/page/size，空值不拼 */
  posts: (q) => {
    const p = q || {};
    const qs = Object.keys(p)
      .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '')
      .map((k) => k + '=' + encodeURIComponent(p[k]))
      .join('&');
    return http.get('/api/community/posts' + (qs ? '?' + qs : ''));
  },
  post: (id) => http.get('/api/community/posts/' + id),
  /** 进详情先计数（旧版 B3 的顺序：先 view 再拉详情，否则每次都少算一次） */
  markView: (id) => http.post('/api/community/posts/' + id + '/view', {}),
  likePost: (id, on) => (on ? http.post('/api/community/posts/' + id + '/like', {}) : http.del('/api/community/posts/' + id + '/like')),
  createPost: (payload) => http.post('/api/community/posts', payload),
  updatePost: (id, payload) => http.patch('/api/community/posts/' + id, payload),
  deletePost: (id) => http.del('/api/community/posts/' + id),

  comments: (postId, q) => {
    const p = q || {};
    const qs = Object.keys(p)
      .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '')
      .map((k) => k + '=' + encodeURIComponent(p[k]))
      .join('&');
    return http.get('/api/community/posts/' + postId + '/comments' + (qs ? '?' + qs : ''));
  },
  addComment: (postId, payload) => http.post('/api/community/posts/' + postId + '/comments', payload),
  replies: (commentId, page = 1, size = 50) =>
    http.get('/api/community/comments/' + commentId + '/replies?page=' + page + '&size=' + size),
  likeComment: (id, on) =>
    on ? http.post('/api/community/comments/' + id + '/like', {}) : http.del('/api/community/comments/' + id + '/like'),
  deleteComment: (id) => http.del('/api/community/comments/' + id),

  report: (payload) => http.post('/api/community/reports', payload),
  myReports: (page = 1, size = 10) => http.get('/api/community/my-reports?page=' + page + '&size=' + size),
  myBan: () => http.get('/api/community/me/ban'),
  /** @ 提及候选（要登录） */
  users: (q) => http.get('/api/community/users?q=' + encodeURIComponent(q))
};
// ==================== 辩论 / 对局（批 2） ====================

export const debateApi = {
  topics: () => http.get('/api/topics'),
  /** 自定义辩题先过可辩性审核：返回 {result: PASS|REJECT|FIX, reason, suggestions, cached} */
  auditTopic: (title) => http.post('/api/topics/audit', { title }),
  evidence: (topicId) => http.get('/api/topics/' + topicId + '/evidence'),
  /** 作战卡（模型生成要几秒，首次点开才拉） */
  brief: (topicId, side) => http.get('/api/topics/' + topicId + '/brief?side=' + side),
  /** AI 档位说明：{basic,pro,byok} 各含 key/label/available/model/note */
  aiTiers: () => http.get('/api/ai-tiers'),
  createMatch: (payload) => http.post('/api/matches', payload),
  match: (matchId) => http.get('/api/matches/' + matchId),
  submitTurn: (matchId, content) =>
    http.post('/api/matches/' + matchId + '/turns', { content, inputType: 'kb' }),
  keepalive: (matchId) => http.post('/api/matches/' + matchId + '/keepalive'),
  buzz: (matchId) => http.post('/api/matches/' + matchId + '/buzz'),
  skip: (matchId) => http.post('/api/matches/' + matchId + '/skip'),
  review: (matchId) => http.get('/api/matches/' + matchId + '/review'),
  panel: (matchId) => http.post('/api/matches/' + matchId + '/panel'),
  /** SSE 地址：EventSource 不能设请求头，令牌只能走 ?token=（后端只对 /events 开口子） */
  eventsUrl: (matchId, token) =>
    API_BASE + '/api/matches/' + matchId + '/events?token=' + encodeURIComponent(token || '')
};
// ==================== 多人房间（批 2） ====================

export const roomApi = {
  list: () => http.get('/api/rooms'),
  /** 建房：topicId 为空则后端随机抽题，房主坐 A1 */
  create: (topicId) => http.post('/api/rooms', { topicId: topicId || null }),
  detail: (code) => http.get('/api/rooms/' + encodeURIComponent(code)),
  join: (code) => http.post('/api/rooms/' + encodeURIComponent(code) + '/join', {}),
  leave: (code) => http.post('/api/rooms/' + encodeURIComponent(code) + '/leave', {}),
  ready: (code, ready) => http.post('/api/rooms/' + encodeURIComponent(code) + '/ready', { ready }),
  start: (code) => http.post('/api/rooms/' + encodeURIComponent(code) + '/start', {}),
  /** 邀请走私聊消息（type=INVITE）：对方在聊天窗看到卡片，点一下就能进 */
  invite: (toId, roomCode, topicTitle) =>
    http.post('/api/social/messages', { toId, type: 'INVITE', roomCode, topicTitle })
};
// ==================== 私聊（批 2） ====================

export const chatApi = {
  conversations: () => http.get('/api/social/conversations'),
  /** 只刷角标：一次请求，不拉列表 */
  unreadCount: () => http.get('/api/social/unread-count'),
  /** 历史消息：不给 beforeId 就是最近一页（后端固定 20 条） */
  messages: (convId, beforeId) =>
    http.get('/api/social/messages?convId=' + convId + (beforeId ? '&beforeId=' + beforeId : '')),
  /** 轮询补拉：只要 afterId 之后的新消息 */
  messagesAfter: (convId, afterId) =>
    http.get('/api/social/messages?convId=' + convId + '&afterId=' + (afterId || 0)),
  /** HTTP 兜底发送（WS 不可用时走这条） */
  send: (toId, body) => http.post('/api/social/messages', { toId, body }),
  markRead: (convId, lastMsgId) =>
    http.post('/api/social/conversations/' + convId + '/read', lastMsgId ? { lastMsgId } : {})
};
// ==================== 钱包 / 支付 / 自带 API（批 1） ====================

export const walletApi = {
  info: () => http.get('/api/wallet'),
  history: (limit = 10) => http.get('/api/wallet/history?limit=' + limit),
  /** 下单（此时不入账），返回 {orderId, amountCents, sign} */
  createOrder: (amountCents) => http.post('/api/pay/orders', { amountCents }),
  /** 支付回调：带签名，服务端验签 + 幂等入账 */
  payCallback: (orderId, amountCents, sign, tradeNo) =>
    http.post('/api/pay/callback', { orderId, amountCents, sign, tradeNo }),
  llmProfile: () => http.get('/api/llm/profile'),
  saveLlmProfile: (body) => http.post('/api/llm/profile', body),
  testLlm: () => http.post('/api/llm/test')
};
export const notifyApi = {
  /** 注意：这个接口有副作用——拉一页会把该页标已读，调用后必须刷新角标 */
  list: (page = 1, size = 20) => http.get('/api/community/notifications?page=' + page + '&size=' + size),
  unreadCount: () => http.get('/api/community/notifications/unread-count')
};

// ==================== 视频（批 3） ====================

export const videoApi = {
  /** 信息流：size 默认 6；cursor 分页；segment 按环节筛 */
  feed: (cursor, segment) =>
    http.get('/api/video/feed?size=6' + (cursor ? '&cursor=' + cursor : '') +
      (segment ? '&segment=' + encodeURIComponent(segment) : '')),
  detail: (id) => http.get('/api/video/videos/' + id),
  like: (id, cancel) => http.post('/api/video/videos/' + id + '/like', { cancel: !!cancel }),
  comment: (id, content) => http.post('/api/video/videos/' + id + '/comments', { content }),
  publish: (payload) => http.post('/api/video/videos', payload),
  /** 审核台是否开放由后端决定 */
  rules: () => http.get('/api/video/audit/rules'),
  queue: (status, size = 50) => http.get('/api/video/audit/queue?status=' + status + '&size=' + size),
  logs: (id) => http.get('/api/video/audit/' + id + '/logs'),
  decide: (id, decision, reason) => http.post('/api/video/audit/' + id + '/decide', { decision, reason }),
  restore: (id) => http.post('/api/video/audit/' + id + '/restore', {})
};

// ==================== 管理后台（批 3，独立令牌） ====================

export const ADMIN_TOKEN_KEY = 'sy_admin_jwt';

export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setAdminToken(t) {
  try {
    if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (e) {
    /* 忽略 */
  }
}

/**
 * 管理后台请求：**与主站不同的令牌键**（sy_admin_jwt）与不同的前缀（/api/admin）。
 *
 * 旧 admin.js 里有个 keepLogin：400 是表单校验失败，不该把人踢下线。
 * 这里保留同样语义 —— 只有 401 才清令牌。
 */
export async function adminRequest(path, opts = {}) {
  const method = opts.method || 'GET';
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAdminToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let resp;
  try {
    resp = await fetch(API_BASE + '/api/admin' + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) {
    throw new ApiError('后端未连接', 'NETWORK', 0);
  }
  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }
  if (resp.status === 401 && !opts.keepLogin) {
    setAdminToken('');
    window.dispatchEvent(new CustomEvent('sy:admin-unauthorized'));
  }
  if (!resp.ok) {
    const message = (data && data.message) || (typeof text === 'string' && text) || 'HTTP ' + resp.status;
    throw new ApiError(message, (data && data.code) || 'HTTP_' + resp.status, resp.status);
  }
  return data;
}

export const adminApi = {
  login: (account, password) => adminRequest('/auth/login', { method: 'POST', body: { account, password } }),
  password: (oldPassword, newPassword) =>
    adminRequest('/auth/password', { method: 'PATCH', body: { oldPassword, newPassword }, keepLogin: true }),
  stats: () => adminRequest('/stats'),
  reports: (status, page, size = 20) =>
    adminRequest('/reports?status=' + (status || 'PENDING') + '&page=' + (page || 1) + '&size=' + size),
  report: (reportId) => adminRequest('/reports/' + reportId),
  resolve: (reportId, body) => adminRequest('/reports/' + reportId + '/resolve', { method: 'POST', body }),
  audit: (page, size = 20) => adminRequest('/audit?' + toQuery({ page: page || 1, size })),
  /** 处理记录带筛选（q/admin/action/verdict/targetType/source/from/to 全部可空） */
  auditFiltered: (p) => adminRequest('/audit?' + toQuery({ ...p, page: p.page || 1, size: p.size || 20 })),
  restoreAudit: (id) => adminRequest('/audit/' + encodeURIComponent(id) + '/restore', { method: 'POST' }),
  users: (q, page, size = 20) =>
    adminRequest('/users?q=' + encodeURIComponent(q || '') + '&page=' + (page || 1) + '&size=' + size),
  ban: (id, days, reason) =>
    adminRequest('/users/' + encodeURIComponent(id) + '/ban', { method: 'POST', body: { days, reason } }),
  unban: (id) => adminRequest('/users/' + encodeURIComponent(id) + '/unban', { method: 'POST' }),
  setStatus: (id, status) =>
    adminRequest('/users/' + encodeURIComponent(id) + '/status', { method: 'POST', body: { status } })
};

// ==================== 管理台报表（P3 接口 / P4 页面） ====================

/** 把参数对象拼成 query（空值不拼）。与 communityApi 里那套写法保持一致。 */
function toQuery(params) {
  return Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
}

/**
 * 报表接口：全部走 {@link adminRequest}（同 adminApi，带 sy_admin_jwt、401 统一广播）。
 *
 * 出参形状见 docs/管理接口契约.md §10：后端已经补好零、排好序、算好占比，
 * 前端这里不做任何聚合，直接塞给 components/charts/* 的 points。
 */
export const analyticsApi = {
  overview: (from, to) => adminRequest('/analytics/overview?' + toQuery({ from, to })),
  modules: (range) => adminRequest('/analytics/modules?' + toQuery({ range })),
  trend: (metric, range) => adminRequest('/analytics/trend?' + toQuery({ metric, range })),
  breakdown: (dim, range) => adminRequest('/analytics/breakdown?' + toQuery({ dim, range })),
  active: (range) => adminRequest('/analytics/active?' + toQuery({ range })),
  quality: (range) => adminRequest('/analytics/quality?' + toQuery({ range })),
  /** 导出走二进制下载，用 exportFile.js 里的 downloadExport（要带令牌，不能直接 window.open） */
  exportPath: (params) => '/api/admin/analytics/export?' + toQuery(params)
};

// ==================== 内容管理台（帖子 / 评论 / 处置） ====================

/**
 * 内容管理接口。**管理端能看到 status=2（已屏蔽）的内容**，与用户侧口径不同。
 *
 * `p` 传对象（q / type / status / authorId / from / to / page / size），空值自动不拼。
 */
export const contentApi = {
  posts: (p) => adminRequest('/posts?' + toQuery(p)),
  post: (id) => adminRequest('/posts/' + id),
  postComments: (id, page, size) =>
    adminRequest('/posts/' + id + '/comments?' + toQuery({ page, size })),
  comments: (p) => adminRequest('/comments?' + toQuery(p)),
  /** type = 'post' | 'comment' */
  hide: (type, id, note) => adminRequest('/content/' + type + '/' + id + '/hide', { method: 'POST', body: { note } }),
  unhide: (type, id) => adminRequest('/content/' + type + '/' + id + '/unhide', { method: 'POST' }),
  /** 禁言 1/3/7 天（BanService 内部校验），带 MANUAL 审计 */
  mute: (id, days, reason) => adminRequest('/users/' + encodeURIComponent(id) + '/mute', { method: 'POST', body: { days, reason } }),
  /** 用户违规浮窗：基本信息 + 统计 + 违规历史 */
  profile: (id) => adminRequest('/users/' + encodeURIComponent(id) + '/profile'),
  /** 批量处置用户：action = mute | ban | unban（统一一个理由，逐条写处理记录） */
  batchUsers: ({ action, ids, days, reason }) =>
    adminRequest('/users/batch', { method: 'POST', body: { action, ids, days, reason } }),
  /** 批量处置内容：type = post | comment，action = hide | unhide */
  batchContent: (type, action, ids, note) =>
    adminRequest('/content/batch', { method: 'POST', body: { type, action, ids, note } })
};

// ==================== 视频复核台（管理端） ====================

/**
 * 视频复核走**管理端**接口 `/api/admin/video-audit/**`：
 * 视频模块那 4 个接口挂在 `/api/video/*`、只认用户令牌，而且已收紧为"必须管理员"（从用户侧调 403）。
 * 数据层与视频模块完全一致（同一个 VideoRepo），只是鉴权与操作人不同。
 */
export const videoAuditApi = {
  queue: (p) => adminRequest('/video-audit/queue?' + toQuery({ ...p, page: p.page || 1, size: p.size || 20 })),
  logs: (id) => adminRequest('/video-audit/' + id + '/logs'),
  decide: (id, decision, reason) =>
    adminRequest('/video-audit/' + id + '/decide', { method: 'POST', body: { decision, reason } }),
  restore: (id) => adminRequest('/video-audit/' + id + '/restore', { method: 'POST' }),
  rules: () => adminRequest('/video-audit/rules')
};

// ==================== 辩题审核（管理端） ====================

/**
 * 辩题审核。管理端列表**含被驳回/下架的题**（前台题库会过滤掉 REJECT，
 * 那是 `Store.topics()` 的口径，两边各用各的 SQL）。
 */
export const topicAdminApi = {
  list: (p) => adminRequest('/topics?' + toQuery(p)),
  approve: (id) => adminRequest('/topics/' + encodeURIComponent(id) + '/approve', { method: 'POST' }),
  reject: (id, reason) =>
    adminRequest('/topics/' + encodeURIComponent(id) + '/reject', { method: 'POST', body: { reason } }),
  offline: (id, reason) =>
    adminRequest('/topics/' + encodeURIComponent(id) + '/offline', { method: 'POST', body: { reason } })
};