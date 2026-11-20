/**
 * 对局页（小程序端）。
 *
 * 与 Web 端的关键差别：
 * · 没有 SSE，靠 1.5 秒轮询；只拉增量状态，不做打字机动画（手机上打字机又费电又卡）；
 * · 「催一下」也做幂等：点击后按钮禁用 + 记录已催的步，连点不再发请求；
 * · 一次只有 8 步（SPRINT），打完直接跳复盘摘要。
 */
const api = require('../../utils/api');

const POLL_MS = 1500;

Page({
  data: {
    matchId: '',
    title: '',
    status: '',
    stepText: '',
    turns: [],
    draft: '',
    waiting: false,
    unlimited: false,
    secondsLeft: 0,
    skipBusy: false,
    skipStep: -1,
    banner: '',
    review: null,
    busy: false
  },

  onLoad(q) {
    this.setData({ matchId: q.matchId });
    this.load(true);
    this.timer = setInterval(() => this.load(false), POLL_MS);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  async load(first) {
    const { matchId } = this.data;
    if (!matchId) return;
    try {
      const d = await api.match(matchId);
      const mt = d.match || {};
      const turns = (d.turns || []).map((t) => ({
        step: t.step,
        seat: t.seat,
        seg: t.seg,
        content: t.content,
        mine: String(mt.my_seats || '').split(',').indexOf(t.seat) >= 0,
        degraded: t.status === 'TEMPLATE'
      }));

      this.setData({
        title: mt.topic_title || '',
        status: mt.status,
        stepText: (Number(mt.step) + 1) + ' / ' + (d.totalSteps || '?'),
        turns,
        waiting: !!d.waitingForMe,
        unlimited: !!d.unlimited,
        secondsLeft: d.remainingSec || 0,
        banner: d.waitingForMe ? '轮到你发言' : '等待对方发言…'
      });

      if (mt.status && mt.status !== 'RUNNING' && first !== 'done') {
        if (this.timer) clearInterval(this.timer);
        const rv = await api.review(matchId).catch(() => null);
        if (rv) {
          this.setData({
            review: {
              total: rv.score ? rv.score.total : '-',
              tokens: rv.billTokens || 0,
              dims: rv.score || {}
            }
          });
        }
      }
    } catch (e) {
      // 轮询失败不打断（可能只是网络抖），下一次再试
    }
  },

  onDraft(e) { this.setData({ draft: e.detail.value }); },

  async submit() {
    const text = (this.data.draft || '').trim();
    if (!text || this.data.busy) return;
    this.setData({ busy: true });
    try {
      await api.submitTurn(this.data.matchId, text);
      this.setData({ draft: '' });
      await this.load(false);
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败，内容已保留', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  /** 催一下：幂等（同一轮只发一次请求，按钮立刻禁用） */
  async skip() {
    const step = this.data.stepText;
    if (this.data.skipBusy || this.data.skipStep === step) return;
    this.setData({ skipBusy: true });
    try {
      const r = await api.skip(this.data.matchId);
      if (r && r.ok) {
        this.setData({ skipStep: step });
        wx.showToast({ title: '已催', icon: 'none' });
        await this.load(false);
      } else {
        wx.showToast({ title: (r && r.reason) || '现在不能催', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '催失败', icon: 'none' });
    } finally {
      this.setData({ skipBusy: false });
    }
  },

  backHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
