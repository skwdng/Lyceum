import { defineStore } from 'pinia';
import { debateApi, getToken } from '../api.js';
import { useAuthStore } from './auth.js';
import { useWalletStore } from './wallet.js';
import { toast } from '../utils/toast.js';

/** 第 N 步 → 发言席位（与后端赛制一致） */
export const SEAT_OF = { 1: 'A1', 2: 'B1', 3: 'A2', 4: 'B2', 5: 'A3', 6: 'B3', 7: 'A2', 8: 'B2', 9: 'A3', 10: 'B3', 11: 'B4', 12: 'A4' };
/** 第 N 步 → 环节名 */
export const SEG_OF = { 1: '立论', 2: '立论', 3: '驳立论', 4: '驳立论', 5: '质询', 6: '质询', 7: '自由辩', 8: '自由辩', 9: '自由辩', 10: '自由辩', 11: '总结', 12: '总结' };
/** 八个席位 */
export const SEATS = [
  { k: 'A1', side: 'A', role: '一辩' }, { k: 'A2', side: 'A', role: '二辩' },
  { k: 'A3', side: 'A', role: '三辩' }, { k: 'A4', side: 'A', role: '四辩' },
  { k: 'B1', side: 'B', role: '一辩' }, { k: 'B2', side: 'B', role: '二辩' },
  { k: 'B3', side: 'B', role: '三辩' }, { k: 'B4', side: 'B', role: '四辩' }
];

const LS = {
  seats: 'sy_seats', mode: 'sy_mode', pace: 'sy_pace', diff: 'sy_diff'
};

function readSeats() {
  try {
    const raw = localStorage.getItem(LS.seats);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : ['A1'];
  } catch (e) {
    return ['A1'];
  }
}

function keyOf(t) {
  // 打字机的"身份"：同一轮、同一席位、同样长度 → 视为同一条（避免重渲染后重头打）
  return t.step + '|' + t.seat + '|' + (((t.content || '').trim()) || '（这一轮没有说出内容）').length;
}

/**
 * 对局（单人 / 多人共用）。
 *
 * 从旧 match.js + solo.js 移植。几个关键点：
 * · **轮询 400ms + SSE 双通道**：SSE 只用来"有新东西了"叫醒前端，数据仍以 HTTP 为准；
 * · **打字机不能因为重渲染而重头打**：进度存在 `shown[key]`，重渲染后从那里接着打；
 * · **串行打字**：只推进最靠前的一条，保证"上一个人说完，下一个才开口"；
 * · **我发言之前的 AI 内容一律直接显示全文**，否则会看起来像"他抢在我前面说"；
 * · 计时：只有轮到我且不是不限时才递减；最后 30 秒标红；打字时自动续时（有上限）。
 */
export const useDebateStore = defineStore('debate', {
  state: () => ({
    // 单人配置（持久化，刷新后还在）
    mySeats: readSeats(),
    mode: (typeof localStorage !== 'undefined' && localStorage.getItem(LS.mode)) || 'FULL',
    pace: (typeof localStorage !== 'undefined' && localStorage.getItem(LS.pace)) || 'normal',
    difficulty: (typeof localStorage !== 'undefined' && localStorage.getItem(LS.diff)) || 'pro',
    pendingTopicId: null,
    pendingTitle: null,

    // 对局
    matchId: null,
    match: null,
    turns: [],
    remaining: 0,
    extendUsed: 0,
    lastKeep: 0,
    phase: 'STEP',
    kind: 'solo',
    unlimited: false,
    waiting: false,
    cards: [],
    cardsTopic: null,
    brief: null,
    showBrief: false,
    flawOffer: null,
    err: '',

    // 打字机
    shown: {},
    typed: {},
    stickBottom: true,

    // 复盘
    review: null,
    panel: null,
    panelBusy: false,

    pollTimer: null,
    es: null,
    typeTimer: null,
    clockTimer: null
  }),

  getters: {
    steps: (s) => (s.mode === 'SPRINT' ? [1, 2, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    stepNo: (s) => Number((s.match && s.match.step) || 0) + 1,
    /** 本场我要发言几次 */
    myTurnCount: (s) => s.steps.filter((n) => s.mySeats.includes(SEAT_OF[n])).length,

    /** 条状席位：谁是当前发言人 */
    stripSeats: (s) => {
      const curSeat = SEAT_OF[s.stepNo];
      return SEATS.map((x) => ({ ...x, me: s.mySeats.includes(x.k), cur: curSeat === x.k }));
    },

    /**
     * 聊天区要显示的回合（含打字进度）。
     * 规则见文件头：串行打字、我发言之前的 AI 直接全文、还没轮到的不显示。
     */
    turnsView: (s) => {
      let lastMine = -1;
      s.turns.forEach((t, i) => {
        if (s.mySeats.includes(t.seat)) lastMine = i;
      });
      const forceFull = new Set();
      s.turns.forEach((t, i) => {
        if (i < lastMine && !s.mySeats.includes(t.seat)) forceFull.add(keyOf(t));
      });
      let firstUntyped = -1;
      s.turns.forEach((t, i) => {
        if (s.mySeats.includes(t.seat) || t.status === 'TIMEOUT') return;
        if (i < lastMine) return;
        if (!s.typed[keyOf(t)] && firstUntyped < 0) firstUntyped = i;
      });
      const list = s.turns.filter(
        (t, idx) => s.mySeats.includes(t.seat) || t.status === 'TIMEOUT' || firstUntyped === -1 || idx <= firstUntyped
      );
      return list.map((t) => {
        const me = s.mySeats.includes(t.seat);
        const timeout = t.status === 'TIMEOUT';
        const text = (t.content || '').trim() || '（这一轮没有说出内容）';
        const key = keyOf(t);
        const typing = !me && !timeout && !s.typed[key] && !forceFull.has(key);
        const shown = typing ? s.shown[key] || 0 : text.length;
        return {
          key,
          seat: t.seat,
          seg: t.seg,
          timeout,
          me,
          side: String(t.seat).startsWith('A') ? 'a' : 'b',
          text,
          typing,
          shown
        };
      });
    }
  },

  actions: {
    // ==================== 单人配置 ====================
    setSeats(list) {
      this.mySeats = list.slice();
      try {
        localStorage.setItem(LS.seats, JSON.stringify(this.mySeats));
      } catch (e) {
        /* 忽略 */
      }
    },
    toggleSeat(k) {
      const i = this.mySeats.indexOf(k);
      if (i >= 0) {
        if (this.mySeats.length === 1) {
          toast('至少保留一个席位');
          return;
        }
        this.mySeats = this.mySeats.filter((x) => x !== k);
      } else {
        this.mySeats = this.mySeats.concat(k);
      }
      this.setSeats(this.mySeats);
    },
    setDifficulty(d) {
      this.difficulty = d;
      try {
        localStorage.setItem(LS.diff, d);
      } catch (e) {
        /* 忽略 */
      }
    },
    setPace(p) {
      this.pace = p;
      try {
        localStorage.setItem(LS.pace, p);
      } catch (e) {
        /* 忽略 */
      }
    },
    setMode(m) {
      this.mode = m;
      try {
        localStorage.setItem(LS.mode, m);
      } catch (e) {
        /* 忽略 */
      }
    },

    // ==================== 开局 ====================
    async createMatch(extra) {
      const auth = useAuthStore();
      if (!auth.user) {
        toast('登录后才能开始辩论');
        return null;
      }
      const payload = {
        seats: this.mySeats,
        mode: this.mode,
        pace: this.pace,
        difficulty: this.difficulty,
        ...(extra || {})
      };
      if (!payload.topicId && this.pendingTitle) payload.title = this.pendingTitle;
      try {
        const r = await debateApi.createMatch(payload);
        this.matchId = r.matchId;
        this.pendingTitle = null;
        return r.matchId;
      } catch (e) {
        toast('开局失败：' + ((e && e.message) || ''));
        return null;
      }
    },

    /** 进入对局页时调用：拉一次 + 起轮询 + 连 SSE */
    async start(matchId) {
      this.matchId = String(matchId);   // 对局 id 是字符串（m9324a4c326），不能当数字
      this.turns = [];
      this.match = null;
      this.typed = {};
      this.shown = {};
      this.flawOffer = null;
      this.review = null;
      this.panel = null;
      await this.load(true);
      this.startPoll();
      this.startClock();
    },

    async load(first) {
      if (!this.matchId) return;
      try {
        const d = await debateApi.match(this.matchId);
        const prevCount = this.turns.length;
        const prevWaiting = this.waiting;
        const prevPhase = this.phase;
        this.match = d.match;
        this.turns = d.turns || [];
        this.remaining = d.remainingSec || 0;
        this.extendUsed = d.extendUsed || 0;
        this.phase = d.phase || 'STEP';
        this.kind = d.kind || 'solo';
        this.unlimited = !!d.unlimited;
        this.waiting = !!d.waitingForMe;
        this.err = '';

        // 论据卡：换了辩题才拉
        if (d.match && d.match.topic_id && this.cardsTopic !== d.match.topic_id) {
          try {
            const ev = await debateApi.evidence(d.match.topic_id);
            this.cards = ev.cards || [];
            this.cardsTopic = d.match.topic_id;
          } catch (e) {
            this.cards = [];
          }
        }

        // 对局结束：停一切计时器，拉复盘
        if (d.match && d.match.status !== 'RUNNING') {
          this.stopPoll();
          this.stopClock();
          this.flawOffer = null;
          await this.loadReview();
          return;
        }
        if (first || prevCount !== this.turns.length || prevWaiting !== this.waiting || prevPhase !== this.phase) {
          this.stickBottom = true;
        }
      } catch (e) {
        this.err = (e && e.message) || String(e);
      }
    },

    startPoll() {
      this.stopPoll();
      this.pollTimer = setInterval(() => this.load(false), 400);
      this.openStream();
    },
    stopPoll() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.closeStream();
    },

    /**
     * SSE：AI 一说完立刻推过来，不用等下一次轮询。
     * 令牌只能走查询参数（EventSource 不支持请求头），后端只对 /events 接受 ?token=。
     */
    openStream() {
      this.closeStream();
      if (!this.matchId || typeof EventSource === 'undefined') return;
      const auth = useAuthStore();
      if (!auth.user) return;
      const token = getToken();
      if (!token) return;
      try {
        this.es = new EventSource(debateApi.eventsUrl(this.matchId, token));
        this.es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.type === 'flaw') {
              this.flawOffer = { step: d.step, options: d.options || [] };
              toast('对方这轮发言埋了一处漏洞，指出来');
              return;
            }
          } catch (err) {
            /* 非 JSON 帧直接忽略 */
          }
          this.load(false);
        };
        this.es.onerror = () => {
          // 断线由 400ms 轮询兜底；未登录时不要再重连（否则刷 401）
          if (!auth.user) this.closeStream();
        };
      } catch (e) {
        /* 忽略 */
      }
    },
    closeStream() {
      if (this.es) {
        try {
          this.es.close();
        } catch (e) {
          /* 忽略 */
        }
        this.es = null;
      }
    },

    // ==================== 打字机 ====================
    startTyping() {
      if (this.typeTimer) return;
      const pauses = {};
      this.typeTimer = setInterval(() => {
        // 串行：只推进最靠前的那条未打完的
        const next = this.turnsView.find((x) => x.typing);
        if (!next) return;
        const now = Date.now();
        if (now < (pauses[next.key] || 0)) return;
        const idx = next.shown + 1;
        this.shown[next.key] = idx;
        if (this.stickBottom) this.scrollToBottom && this.scrollToBottom();
        if (idx >= next.text.length) {
          this.typed[next.key] = true;
          return;
        }
        const ch = next.text.charAt(idx - 1);
        const per = Math.min(150, Math.max(18, Math.round(6500 / Math.max(1, next.text.length))));
        let d = per;
        if (ch === '。' || ch === '！' || ch === '？') d = Math.min(520, per * 8);
        else if (ch === '，' || ch === '；' || ch === '：') d = Math.min(240, per * 3);
        else if (ch === '「' || ch === '」') d = Math.round(per * 1.5);
        pauses[next.key] = now + d;
      }, 40);
    },
    stopTyping() {
      if (this.typeTimer) {
        clearInterval(this.typeTimer);
        this.typeTimer = null;
      }
    },

    // ==================== 计时 ====================
    startClock() {
      this.stopClock();
      this.clockTimer = setInterval(() => {
        if (!this.waiting) return;
        if (this.remaining > 0) this.remaining -= 1;
      }, 1000);
    },
    stopClock() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
        this.clockTimer = null;
      }
    },

    /** 打字太慢会自动续时（单人模式不限时，不该续） */
    async keepalive() {
      if (!this.matchId || !this.waiting || this.unlimited) return;
      const now = Date.now();
      if (this.remaining > 120) return;
      if (this.extendUsed >= 3) return;
      if (now - this.lastKeep < 15000) return;
      this.lastKeep = now;
      try {
        const r = await debateApi.keepalive(this.matchId);
        if (r && r.extended) {
          this.extendUsed = r.used;
          this.remaining += r.addSec;
          toast('已自动续时 ' + r.addSec + ' 秒（' + r.used + '/' + r.max + '）');
        }
      } catch (e) {
        /* 续时失败不影响发言 */
      }
    },

    // ==================== 动作 ====================
    async submitTurn(text) {
      const body = String(text || '').trim();
      if (!body) {
        toast('说点什么再发');
        return false;
      }
      try {
        await debateApi.submitTurn(this.matchId, body);
        await this.load(false);
        return true;
      } catch (e) {
        toast('提交失败，内容已保留：' + ((e && e.message) || ''));
        await this.load(false);   // 和服务端重新对齐（可能已经推进到下一步）
        return false;
      }
    },

    async buzz() {
      if (!this.matchId) return;
      try {
        const r = await debateApi.buzz(this.matchId);
        if (r && r.ok) {
          // 抢到就立刻拿到话筒：本地先切状态，不等下一轮轮询
          this.phase = 'STEP';
          this.waiting = true;
          this.remaining = r.seconds || 90;
          this.extendUsed = 0;
          toast('抢到了，你有 ' + r.seconds + ' 秒');
          await this.load(false);
        } else {
          toast((r && r.reason) || '没抢到');
        }
      } catch (e) {
        toast('抢拍失败：' + ((e && e.message) || ''));
      }
    },

    async skipAi() {
      if (!this.matchId) return;
      try {
        const r = await debateApi.skip(this.matchId);
        if (r && r.ok) {
          toast('已催，对方开始回应');
          await this.load(false);
        } else {
          toast((r && r.reason) || '现在不能催');
        }
      } catch (e) {
        toast('催失败：' + ((e && e.message) || ''));
      }
    },

    async toggleBrief() {
      this.showBrief = !this.showBrief;
      if (!this.showBrief || this.brief) return;
      const m = this.match;
      if (!m || !m.topic_id) return;
      const side = String(m.my_seats || 'A1').charAt(0);
      toast('正在生成作战卡…');
      try {
        this.brief = await debateApi.brief(m.topic_id, side);
      } catch (e) {
        this.brief = null;
        toast('作战卡生成失败');
      }
    },

    // ==================== 复盘 ====================
    async loadReview() {
      if (!this.matchId) return;
      try {
        this.review = await debateApi.review(this.matchId);
      } catch (e) {
        this.review = null;
      }
      // 余额可能因为本场扣费变了
      useWalletStore().refresh();
    },

    async runPanel() {
      if (!this.matchId || this.panelBusy) return;
      this.panelBusy = true;
      this.panel = null;
      try {
        const d = await debateApi.panel(this.matchId);
        this.panel = d && d.ok ? d.panel : { failed: true, reason: (d && d.reason) || '评审团暂时不可用' };
      } catch (e) {
        this.panel = { failed: true, reason: (e && e.message) || '评审失败' };
      } finally {
        this.panelBusy = false;
      }
    },

    /** 离开对局页 / 换账号：把所有计时器和缓冲清干净 */
    reset() {
      this.stopPoll();
      this.stopTyping();
      this.stopClock();
      this.matchId = null;
      this.match = null;
      this.turns = [];
      this.remaining = 0;
      this.extendUsed = 0;
      this.phase = 'STEP';
      this.waiting = false;
      this.cards = [];
      this.cardsTopic = null;
      this.brief = null;
      this.showBrief = false;
      this.flawOffer = null;
      this.shown = {};
      this.typed = {};
      this.review = null;
      this.panel = null;
      this.err = '';
    }
  }
});
