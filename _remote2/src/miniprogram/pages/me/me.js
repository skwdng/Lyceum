const api = require('../../utils/api');

Page({
  data: {
    user: null,
    walletText: '—',
    records: [],
    loading: false
  },

  onShow() {
    this.load();
  },

  async load() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ loading: true });
    try {
      const [me, wallet, records] = await Promise.all([
        api.me().catch(() => null),
        api.wallet().catch(() => null),
        api.records().catch(() => [])
      ]);
      this.setData({
        user: me,
        walletText: wallet ? (wallet.balanceCents / 100).toFixed(2) : '—',
        records: (Array.isArray(records) ? records : []).slice(0, 8),
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      success: (r) => {
        if (!r.confirm) return;
        getApp().clearSession();
        wx.reLaunch({ url: '/pages/login/login' });
      }
    });
  },

  goSolo() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
