/**
 * 思弈阁小程序端入口。
 *
 * 和 Web 端共用同一套后端接口（/api/**），差别只在：
 * · 令牌放 storage（等同 localStorage），每个请求手动带 Authorization；
 * · 没有 EventSource，对局靠 1.5 秒轮询（Web 端是 SSE + 400ms 轮询）；
 * · 域名要在小程序后台配 request 合法域名，开发时勾「不校验合法域名」。
 */
App({
  globalData: {
    // 部署地址：换成你自己的域名（必须 https，且在小程序后台配好）
    baseUrl: 'https://your-domain.com/siyige',
    token: '',
    user: null
  },

  onLaunch() {
    try {
      this.globalData.token = wx.getStorageSync('sy_jwt') || '';
      this.globalData.user = wx.getStorageSync('sy_user') || null;
    } catch (e) { /* 忽略 */ }
  },

  setSession(token, user) {
    this.globalData.token = token || '';
    this.globalData.user = user || null;
    try {
      wx.setStorageSync('sy_jwt', this.globalData.token);
      wx.setStorageSync('sy_user', this.globalData.user);
    } catch (e) { /* 忽略 */ }
  },

  clearSession() {
    this.setSession('', null);
  }
});
