/**
 * 请求封装：和 Web 端 api.js 对齐（同一套 REST、同一个 Bearer 令牌）。
 *
 * 与 Web 的差别只有两处：
 * 1. 没有 fetch，用 wx.request，回调包成 Promise；
 * 2. 401 统一清令牌并跳登录页（Web 端是路由守卫做）。
 */
const app = getApp();

function url(path) {
  const base = (app && app.globalData.baseUrl) || '';
  return base.replace(/\/+$/, '') + path;
}

function request(method, path, data, opts) {
  const options = opts || {};
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    const token = (app && app.globalData.token) || '';
    if (token) header.Authorization = 'Bearer ' + token;

    wx.request({
      url: url(path),
      method,
      data,
      header,
      timeout: 30000,
      success(res) {
        const { statusCode, data: body } = res;
        if (statusCode >= 200 && statusCode < 300) return resolve(body);

        if (statusCode === 401 && !options.noRedirect) {
          app.clearSession();
          wx.reLaunch({ url: '/pages/login/login' });
        }
        const msg = (body && (body.message || body.code)) || ('HTTP ' + statusCode);
        reject(new Error(msg));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'));
      }
    });
  });
}

module.exports = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b, o) => request('POST', p, b, o),
  patch: (p, b, o) => request('PATCH', p, b, o),

  // ---- 业务接口（只用小程序端会碰到的这些）----
  login: (account, password) => request('POST', '/api/auth/login', { account, password }),
  register: (account, password) => request('POST', '/api/auth/register', { account, password }),
  me: () => request('GET', '/api/auth/me'),
  wallet: () => request('GET', '/api/wallet'),
  tiers: () => request('GET', '/api/ai-tiers'),
  topics: () => request('GET', '/api/topics'),
  createMatch: (body) => request('POST', '/api/matches', body),
  match: (id) => request('GET', '/api/matches/' + id),
  submitTurn: (id, content) => request('POST', '/api/matches/' + id + '/turns', { content, inputType: 'kb' }),
  skip: (id) => request('POST', '/api/matches/' + id + '/skip'),
  review: (id) => request('GET', '/api/matches/' + id + '/review'),
  records: () => request('GET', '/api/records')
};
