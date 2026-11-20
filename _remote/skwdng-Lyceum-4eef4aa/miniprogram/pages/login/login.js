const api = require('../../utils/api');

Page({
  data: {
    mode: 'login',      // login | register
    account: '',
    password: '',
    busy: false
  },

  onLoad() {
    const app = getApp();
    if (app.globalData.token) {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onAccount(e) { this.setData({ account: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },

  async submit() {
    const { account, password, mode, busy } = this.data;
    if (busy) return;
    if (!account.trim() || !password) {
      wx.showToast({ title: '账号和密码都要填', icon: 'none' });
      return;
    }
    this.setData({ busy: true });
    try {
      const res = mode === 'register'
        ? await api.register(account.trim(), password)
        : await api.login(account.trim(), password);
      getApp().setSession(res.token, res.user || null);
      wx.reLaunch({ url: '/pages/index/index' });
    } catch (e) {
      wx.showToast({ title: e.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  }
});
