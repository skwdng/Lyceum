const api = require('../../utils/api');

Page({
  data: {
    topics: [],
    loading: true,
    tier: 'PRO',
    tiers: [],
    walletText: '—',
    busy: false
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
      const [topics, tiers, wallet] = await Promise.all([
        api.topics(),
        api.tiers().catch(() => ({})),
        api.wallet().catch(() => null)
      ]);
      // 只显示可用档位（基础版没装本地模型时后端会标 available=false，隐藏掉）
      const tierList = ['basic', 'pro', 'byok']
        .map((k) => tiers[k])
        .filter((x) => x && x.available !== false);

      this.setData({
        topics: Array.isArray(topics) ? topics : (topics.list || []),
        tiers: tierList,
        walletText: wallet ? (wallet.balanceCents / 100).toFixed(2) : '—',
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  pickTier(e) {
    this.setData({ tier: e.currentTarget.dataset.k });
  },

  /** 开一场：座位默认 B2（第二辩位，AI 先手，体验最像"接对方话"） */
  async start(e) {
    if (this.data.busy) return;
    const topicId = e.currentTarget.dataset.id;
    this.setData({ busy: true });
    try {
      const r = await api.createMatch({
        topicId,
        seats: ['B2'],
        mode: 'SPRINT',      // 小程序端默认快速 8 步，手机打字慢
        tier: this.data.tier
      });
      wx.navigateTo({ url: '/pages/match/match?matchId=' + r.matchId });
    } catch (err) {
      wx.showToast({ title: err.message || '开局失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  }
});
