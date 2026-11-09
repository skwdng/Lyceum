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
  diag: () => http.get('/api/diag'),
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
