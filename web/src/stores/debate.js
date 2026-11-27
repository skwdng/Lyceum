import { defineStore } from 'pinia';
import { debateApi, getToken } from '../api.js';
import { useAuthStore } from './auth.js';
import { useWalletStore } from './wallet.js';
import { toast } from '../utils/toast.js';

/** 第 N 步 → 发言席位（与后端赛制一致） */
/** 旧版 12 步兜底表：**只在服务端 plan 缺失时**用于显示，真实赛制以 plan 为准。 */
export const SEAT_OF = { 1: 'A1', 2: 'B1', 3: 'A2', 4: 'B2', 5: 'A3', 6: 'B3', 7: 'A2', 8: 'B2', 9: 'A3', 10: 'B3', 11: 'B4', 12: 'A4' };
/** 第 N 步 → 环节名 */
/** 旧版 12 步兜底表（同上，仅兜底）。 */
export const SEG_OF = { 1: '立论', 2: '立论', 3: '驳立论', 4: '驳立论', 5: '质询', 6: '质询', 7: '自由辩', 8: '自由辩', 9: '自由辩', 10: '自由辩', 11: '总结', 12: '总结' };
/** 八个席位 */
export const SEATS = [
  { k: 'A1', side: 'A', role: '一辩' }, { k: 'A2', side: 'A', role: '二辩' },
  { k: 'A3', side: 'A', role: '三辩' }, { k: 'A4', side: 'A', role: '四辩' },
  { k: 'B1', side: 'B', role: '一辩' }, { k: 'B2', side: 'B', role: '二辩' },
  { k: 'B3', side: 'B', role: '三辩' }, { k: 'B4', side: 'B', role: '四辩' }
];

const LS = {
  seats: 'sy_seats', mode: 'sy_mode', pace: 'sy_pace', diff: 'sy_diff', tier: 'sy_tier',
  match: 'sy_match'
};

function readSeats() {
  // 用户口径：**不预选任何席位**，必须先选才能开局（默认给 A1/B2 会让人莫名其妙站在某个位置上打）。
  // 续打时这里会被服务端返回的 my_seats 覆盖，所以不影响恢复对局。
  return [];
}

/** 席位固定顺序：排序不依赖到达顺序（旧版同款） */
const SEAT_ORDER = { A1: 1, A2: 2, A3: 3, A4: 4, B1: 5, B2: 6, B3: 7, B4: 8 };

/* ==================== 播放进度持久化（FE-3） ====================
 *
 * `typed` 只存「哪些轮次已经打完」的 key 列表：
 * · 刷新 / 切页回来不再整场重播（用户反馈：F5 之后全场从头打一遍）；
 * · 一场一个 key（`sy_typed_<matchId>`），换场自然隔离；
 * · 上限 300 条：12–19 步的场次远到不了，纯粹防止脏数据把 localStorage 撑爆；
 * · `shown` 不持久化 —— 没打完的那条重头打是可接受的，而「打到一半的进度」存下来
 *   反而会因为服务端文本微调而出现「字缩回去」。
 */
const TYPED_LS_PREFIX = 'sy_typed_';
const TYPED_LS_MAX = 300;

function readTyped(matchId) {
  if (!matchId) return {};
  try {
    const raw = localStorage.getItem(TYPED_LS_PREFIX + matchId);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr)) return {};
    const out = {};
    arr.slice(-TYPED_LS_MAX).forEach((k) => { if (k) out[k] = true; });
    return out;
  } catch (e) {
    return {};                                  // 隐私模式 / 脏 JSON：当没有进度
  }
}

function writeTyped(matchId, typed) {
  if (!matchId) return;
  try {
    const keys = Object.keys(typed || {}).slice(-TYPED_LS_MAX);
    if (keys.length) localStorage.setItem(TYPED_LS_PREFIX + matchId, JSON.stringify(keys));
    else localStorage.removeItem(TYPED_LS_PREFIX + matchId);
  } catch (e) {
    /* 忽略：存不下就退化成「刷新重播」，不影响对局 */
  }
}

/**
 * 离线草稿：先引用用户原话，再按环节给一个攻击角度。
 * 纯规则、不联网；质量不高，但保证"像对手在说话"而不是复读。
 */
function offlineReply(userText, seg) {
  const quote = String(userText || '').replace(/\s+/g, ' ').trim().slice(0, 26);
  const angles = {
    立论: '你把重点放在「标准」上，但标准的执行主体一直没说清。请问这一条谁来兜底？',
    驳立论: '你反驳的是我的表述，不是我的判断。我方判断是「可行优先于理想」，这一点你还没碰。',
    质询: '先回答我问的：你说的「合理」由谁认定、按什么程序认定？不回答就等于默认没有标准。',
    自由辩: '回到分歧点：如果按你的方案走，谁承担代价、谁负责复核？这两条你一直没说。',
    总结: '收一下：你把「应该」讲成了「必须」，中间缺了一步——条件成立才成立'
  };
  const angle = angles[seg] || '你这句话我接住了，但还没回答我的问题：判准由谁定、怎么核？';
  return '你说「' + quote + '…」——' + angle;
}

function keyOf(t) {
  // 打字机的"身份"：同一轮、同一席位 → 视为同一条（内容长度一变就重头打，是旧版的坑）
  return t.step + '|' + t.seat;
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
    /** AI 档位：BASIC(本地免费) / PRO(平台) / BYOK(自带 Key)，默认 PRO；后端会兜底降级 */
    tier: (typeof localStorage !== 'undefined' && localStorage.getItem(LS.tier)) || 'PRO',
    pendingTopicId: null,
    pendingTitle: null,

    // 对局
    matchId: null,
    plan: [],            // 服务端返回的真实赛制（每步的 seg/seat/duty）
    match: null,
    turns: [],
    /**
     * 断网兜底产生的本地轮次（只在本地时间线里，不写服务端）。
     * 结构同 turns，额外带 degraded: true —— 界面上打「离线草稿」标签，且不计分。
     */
    localTurns: [],
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

    // 「催一下」：防连点（幂等由后端保证，这里只管按钮状态）
    skipBusy: false,
    skipUntil: 0,      // 冷却结束时间戳
    skipStep: -1,      // 已催过的步（同一轮不再显示按钮）

    /**
     * 流式预览：{ seat: { seg, text } }。
     * 模型一边生成，服务端一边推 token，这里攒起来直接渲染；
     * 收到正式 turn 时清掉对应席位（以落库文本为准，避免校验过的文本和原始流不一致）。
     */
    streaming: {},            // 给界面看的：{ seat: { seg, text(已显示的部分) } }
    streamRaw: {},            // 实际收到的完整文本 { seat: text }
    streamShown: {},          // 已经显示了多少字 { seat: n }
    streamDone: {},           // 这个席位是否已经定稿（等显示追平后清掉）
    streamStep: {},           // 这条预览属于第几步（服务端 step 越过就强制清掉）
    streamTimer: null,

    // 打字机
    shown: {},
    /** 已经通过流式显示过的轮次（keyOf）——这些不再走打字机 */
    streamedKeys: {},
    typed: {},
    /**
     * `typed` 属于哪一场（FE-3）。
     * 换场必须换成本场自己的播放进度：否则上一场的 key 会串到新的一场，
     * 表现就是「刚开的新局，头一句 AI 发言不打了、直接全文」。
     */
    typedMatchId: null,
    stickBottom: true,
    /** 用户最后一次手动滚动的时间戳：打字机 600ms 内不自动滚（旧版同款防拽） */
    lastUserScroll: 0,
    /** 离开对局页时的滚动位置：切回来接着看，不跳顶也不跳底 */
    chatScrollTop: 0,

    // 复盘
    review: null,
    panel: null,
    panelBusy: false,

    pollTimer: null,
    es: null,
    typeTimer: null,
    /** 打字机「条间停顿」的截止时间戳：打完一条后停 1.2–2.0s 再放下一条 */
    typeGapUntil: 0,
    clockTimer: null
  }),

  getters: {
    /** 赛制编号（以服务端为准，不再写死 12 步） */
    steps: (s) => (s.plan && s.plan.length ? s.plan.map((x) => x.no) : [1, 2, 3, 4]),
    /** 第 n 步的席位 / 环节（没有 plan 时退回旧常量） */
    seatAt: (s) => (n) => {
      const p = (s.plan || []).find((x) => Number(x.no) === Number(n));
      return p ? p.seat : SEAT_OF[n] || '';
    },
    segAt: (s) => (n) => {
      const p = (s.plan || []).find((x) => Number(x.no) === Number(n));
      return p ? p.seg : SEG_OF[n] || '';
    },
    dutyAt: (s) => (n) => {
      const p = (s.plan || []).find((x) => Number(x.no) === Number(n));
      return p ? (p.duty || '') : '';
    },
    totalSteps: (s) => (s.plan && s.plan.length ? s.plan.length : (s.mode === 'SPRINT' ? 10 : 12)),
    stepNo: (s) => Number((s.match && s.match.step) || 0) + 1,
    /** 本场我要发言几次 */
    myTurnCount: (s) => (s.plan || []).filter((x) => s.mySeats.includes(x.seat)).length,

    /** 条状席位：谁是当前发言人 */
    stripSeats: (s) => {
      const st = (s.plan || []).find((x) => Number(x.no) === Number(s.stepNo));
      const curSeat = st ? st.seat : SEAT_OF[s.stepNo];
      return SEATS.map((x) => ({ ...x, me: s.mySeats.includes(x.k), cur: curSeat === x.k }));
    },

    /**
     * 聊天区要显示的回合（含打字进度）。
     * 规则见文件头：串行打字、我发言之前的 AI 直接全文、还没轮到的不显示。
     */
    /** 服务端轮次 + 本地兜底轮次，按「步 → 席位」稳定排序 */
    allTurns: (s) => {
      const all = (s.turns || []).concat(s.localTurns || []);
      return all.slice().sort(
        (a, b) =>
          (Number(a.step) - Number(b.step)) ||
          ((SEAT_ORDER[a.seat] || 99) - (SEAT_ORDER[b.seat] || 99))
      );
    },

    turnsView: (s) => {
      // 先按 step|seat 去重（保留最后一条）：服务端万一出现重复行，
      // v-for 的 :key 撞车会让 Vue 复用 DOM，气泡里就会把同一段话叠很多遍
      const seen = new Set();
      const dedup = [];
      for (const t of (s.turns || []).concat(s.localTurns || []).slice().reverse()) {
        const k = t.step + '|' + t.seat;
        if (seen.has(k)) continue;
        seen.add(k);
        dedup.push(t);
      }
      const sorted = dedup.reverse().sort(
        (a, b) =>
          (Number(a.step) - Number(b.step)) ||
          ((SEAT_ORDER[a.seat] || 99) - (SEAT_ORDER[b.seat] || 99))
      );
      let lastMine = -1;
      sorted.forEach((t, i) => {
        if (s.mySeats.includes(t.seat)) lastMine = i;
      });
      // FE-4：只有「本场还没有任何播放进度」时，才把我发言之前的历史 AI 发言直接放全文。
      // 一旦有了 typed 记录（刷新回来 / 打到一半），就老老实实按两条条播，不再「唰一下全出来」。
      const noProgress = Object.keys(s.typed || {}).length === 0;
      const forceFull = new Set();
      if (noProgress) {
        sorted.forEach((t, i) => {
          if (i < lastMine && !s.mySeats.includes(t.seat)) forceFull.add(keyOf(t));
        });
      }
      // 预览还在吐字的席位：它对应的正式发言先别显示，避免同一句话出现两次
      const streaming = Object.keys(s.streaming || {}).length > 0;
      const hiddenByPreview = new Set(
        Object.keys(s.streaming || {})
          .filter((seat) => s.streamDone && s.streamDone[seat])
          .map((seat) => {
            const last = sorted.filter((x) => x.seat === seat).pop();
            return last ? keyOf(last) : '';
          })
          .filter(Boolean)
      );
      // 屏幕上限：**最多一个 pending**。
      // 只把「下一条待打的」露出来（占位/正在打），它之后的待打条目先不渲染；
      // 已经打完的、我说的、超时的、降级的照常全显示（这些不该被藏）。
      // 用户反馈：之前的做法一次性冒出 3–4 个「…」，看着像坏了。
      const rows = sorted.map((t) => {
        const me = s.mySeats.includes(t.seat);
        const timeout = t.status === 'TIMEOUT';
        const text = (t.content || '').trim() || '（这一轮没有说出内容）';
        const key = keyOf(t);
        const streamed = !!s.streamedKeys[key];
        const typing = !me && !timeout && !streamed && !s.typed[key] && !forceFull.has(key);
        return {
          key,
          step: t.step,          // 漏洞卡要按 step 找"那句话打完没有"，必须带上
          seat: t.seat,
          seg: t.seg,
          timeout,
          /** 这一条是模板降级（服务端 TEMPLATE）或本地离线草稿 —— 界面要标出来 */
          degraded: !!t.degraded || t.status === 'TEMPLATE',
          /** 流式渲染已停用（统一走打字机），字段保留给模板判断 */
          stream: false,
          me,
          side: String(t.seat).startsWith('A') ? 'a' : 'b',
          text,
          typing,
          /** 已经开始吐字了没有：false = 排队占位（界面显示「…」+ 灰底） */
          started: typing ? Math.min(s.shown[key] || 0, text.length) > 0 : true,
          shown: typing ? Math.min(s.shown[key] || 0, text.length) : text.length
        };
      });
      let firstPending = -1;
      rows.forEach((r, i) => { if (r.typing && firstPending < 0) firstPending = i; });
      const list = streaming
        ? rows.filter((r) => !hiddenByPreview.has(r.key))
        : rows.filter((r, i) => !(r.typing && firstPending >= 0 && i > firstPending));
      return list;
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
    setTier(t) {
      this.tier = t;
      try {
        localStorage.setItem(LS.tier, t);
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
        tier: this.tier || 'PRO',
        ...(extra || {})
      };
      if (!payload.topicId && this.pendingTitle) payload.title = this.pendingTitle;
      try {
        const r = await debateApi.createMatch(payload);
        this.rememberMatch(r.matchId);
        this.pendingTitle = null;
        return r.matchId;
      } catch (e) {
        toast('开局失败：' + ((e && e.message) || ''));
        return null;
      }
    },

    /** 进入对局页时调用：拉一次 + 起轮询 + 连 SSE */
    /** 记住当前对局 id（刷新后能接回来） */
    rememberMatch(id) {
      this.matchId = id ? String(id) : null;
      try {
        if (id) localStorage.setItem('sy_match', String(id));
        else localStorage.removeItem('sy_match');
      } catch (e) { /* 隐私模式等，忽略 */ }
    },

    async start(matchId) {
      this.rememberMatch(matchId);   // 对局 id 是字符串（m9324a4c326），不能当数字；同时落盘，刷新能接回来
      this.turns = [];
      this.match = null;
      this.typed = {};
      this.shown = {};
      this.streamedKeys = {};
      this.streamedSeats = {};
      this.streamRaw = {};
      this.streamShown = {};
      this.streamDone = {};
      this.streamStep = {};
      if (this.streamTimer) { clearInterval(this.streamTimer); this.streamTimer = null; }
      this.flawOffer = null;
      this.review = null;
      this.panel = null;
      await this.load(true);
      this.startPoll();
      this.startClock();
    },

    /** 流式预览转正：正式发言落库后，把该席位的预览清掉 */
    /**
     * 流式渲染节流：模型吐字很快（1.5 秒 200 多块），直接贴上去会"唰一下全出来"。
     * 这里按固定速度消费缓冲，视觉上才是正常的逐字输出。
     *
     * 速度：每 60ms 2 个字 ≈ 33 字/秒，接近正常阅读速度；
     * 落后太多（比如整段已经收完）时加速，最多 10 字/次，别让人干等。
     */
    startStreamTicker() {
      if (this.streamTimer) return;
      // 速度：每 50ms 2 字 ≈ 40 字/秒（300 字约 7.5 秒，接近发言语速）；
      // 落后过多（整段已收完）才加速追帧，最多 6 字/次。
      this.streamTimer = setInterval(() => {
        const seats = Object.keys(this.streamRaw || {});
        let active = false;
        const nextText = { ...this.streaming };
        const nextShown = { ...this.streamShown };

        for (const seat of seats) {
          const raw = this.streamRaw[seat] || '';
          const shown = this.streamShown[seat] || 0;
          if (shown >= raw.length) {
            // 显示追平了：定稿的直接清掉预览（由 turns 渲染），未定稿的留着等更多字
            if (this.streamDone[seat]) {
              delete nextText[seat];
              delete this.streamRaw[seat];
              delete nextShown[seat];
              delete this.streamDone[seat];
            }
            continue;
          }
          const remain = raw.length - shown;
          // 稳定 2 字/50ms ≈ 40 字/秒（380 字约 9.5 秒）。
          // 不做"前快后慢"的追帧——那样看起来还是一口气吐完。
          const hidden = (typeof document !== 'undefined') && document.hidden;
          const done = !!this.streamDone[seat];
          // 已定稿 / 页面在后台：快速收尾，避免"上一句还在打字"或回前台看到半句话
          const step = hidden ? remain
            : done ? Math.max(6, Math.ceil(remain / 3))
            : remain > 200 ? 3 : 2;
          nextShown[seat] = Math.min(raw.length, shown + step);
          nextText[seat] = {
            seg: (this.streaming[seat] || {}).seg || '',
            text: raw.slice(0, nextShown[seat])
          };
          active = true;
        }

        this.streaming = nextText;
        this.streamShown = nextShown;
        if (!active && !Object.keys(this.streamRaw || {}).length) {
          clearInterval(this.streamTimer);
          this.streamTimer = null;
        }
      }, 50);
    },

    clearStreamingSeat(seat) {
      if (!seat || !this.streaming[seat]) return;
      const next = { ...this.streaming };
      delete next[seat];
      this.streaming = next;
      if (this.streamStep) delete this.streamStep[seat];
    },

    async load(first) {
      if (!this.matchId) return;
      // 并发保护：SSE 每个事件都会触发一次拉取，慢的响应后到会用旧数据覆盖新数据
      // （表现为列表突然变空、或者流式气泡停在上一轮不消失）
      const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
      try {
        const d = await debateApi.match(this.matchId);
        if (seq !== this.loadSeq) return;      // 已经有更新的请求，这次的结果作废
      // 席位以服务端为准：刷新/从链接进入时本地可能是旧值，不同步会把 AI 席位显示成「你」
      if (d && d.match && d.match.my_seats) {
        const seats = String(d.match.my_seats).split(',').map((x) => x.trim()).filter(Boolean);
        if (seats.length) this.mySeats = seats;
      }
        const prevCount = this.turns.length;
        const prevWaiting = this.waiting;
        const prevPhase = this.phase;
        this.match = d.match;
        if (Array.isArray(d.steps) && d.steps.length) this.plan = d.steps;
        this.turns = d.turns || [];

        // FE-3：typed 只属于一场。换场时把播放进度换成本场自己的（localStorage），
        // 否则上一场的 key 会串过来（新局第一句不打字），或者 F5 之后整场从头打一遍。
        if (this.typedMatchId !== this.matchId) {
          this.typedMatchId = this.matchId;
          this.typed = readTyped(this.matchId);
          this.shown = {};
        }

        // 流式收尾：这个席位是"边生成边显示"过来的，落库后
        //   · 立刻清掉「生成中…」预览
        //   · 用落库那条 turn 的 keyOf 标成已显示，跳过打字机
        //     （不标的话，用户会看到字缩回去、从头再打一遍——实测 6 → 100）
        {
          const seats = new Set([
            ...Object.keys(this.streaming || {}),
            ...Object.keys(this.streamedSeats || {})
          ]);
          for (const seat of seats) {
            const hit = (d.turns || []).filter((x) => x.seat === seat).pop();
            if (!hit) continue;
            this.streamedKeys = { ...this.streamedKeys, [keyOf(hit)]: true };
            // 同步标 typed：打字机截断用的是 typed，不标的话下一句会被截掉（实测少一条）
            this.markTyped(keyOf(hit));
            // 定稿：不再接收新字，但让显示把缓冲吐完再换成正式气泡，避免"跳变"
            this.streamDone = { ...(this.streamDone || {}), [seat]: true };
            /* 流式预览已停用：交给打字机 */
            if (this.streamedSeats) delete this.streamedSeats[seat];
          }
        }

        // 兜底：预览所属的那一步已经过去了，说明它早就定稿（只是没在 turns 里匹配到），
        // 不能让它一直挂在界面上——这正是"生成的位置不对"的表现。
        {
          const serverStep = Number((d.match || {}).step ?? -1);
          for (const seat of Object.keys(this.streaming || {})) {
            const at = this.streamStep[seat];
            if (at == null || serverStep < 0) continue;
            if (serverStep <= at) continue;
            const hit = (d.turns || []).filter((x) => x.seat === seat).pop();
            if (hit) {
              this.streamedKeys = { ...this.streamedKeys, [keyOf(hit)]: true };
              this.markTyped(keyOf(hit));
            }
            // 不直接删：标成"定稿"，匀速显示把剩下的字吐完，ticker 再换成正式发言。
            // 直接删会让剩下的字一次性补齐 —— 就是用户说的"啪一下全出来"。
            this.streamDone = { ...this.streamDone, [seat]: true };
            if (!this.streamRaw[seat]) {          // 一点都没收到才直接清
              this.clearStreamingSeat(seat);
              delete this.streamStep[seat];
            }
            /* 流式预览已停用：交给打字机 */
          }
        }

        // 兜底：只要列表里有未打完的条目，就确保打字机在跑
        // （原来只在页面 mount 时启动一次，任何时序问题都会让文字"啪一下全出来"）
        if ((this.turnsView || []).some((x) => x.typing)) this.startTyping();

        this.remaining = d.remainingSec || 0;
        this.extendUsed = d.extendUsed || 0;
        this.phase = d.phase || 'STEP';
        this.unlimited = !!d.unlimited;
        // FE-6：后端把 JSON null 序列化成字符串 "null" 时，kind 会变成 "null"，
        // 于是 `kind !== 'solo'` → 单人局的「催一下」永不出现、不限时也失效。
        // 这里只认白名单，脏值一律按「有 unlimited 就当单人局，否则按房间」兜底。
        const kindRaw = String(d.kind || '');
        this.kind = ['solo', 'room'].includes(kindRaw) ? kindRaw : (this.unlimited ? 'solo' : 'room');
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
              this.flawOffer = { step: d.step, seat: d.seat || '', options: d.options || [] };
              toast('对方这轮发言埋了一处漏洞，指出来');
              return;
            }
            // 正式发言到了：这里**只记下"这个席位是流式显示过的"**，
            // 真正的清理放在 load() 里做——那里能拿到真实的 step/seat 拼出 keyOf，
            // 才不会因为 key 拼错而漏标（漏标的后果是落库后被打字机重打一遍）。
            // 流式增量：只更新预览，**不触发 load**（一块一条要拉几十次接口）
            if (d.type === 'token') {
              // 前端不再渲染流式增量：统一走打字机（服务端仍然流式生成，只是界面按自己的节奏播）
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
    /**
     * 标记「这一轮已经打完了」并落盘（FE-3）。
     * 所有写 typed 的地方都必须走这里，否则刷新后这条会重播。
     */
    markTyped(key) {
      if (!key || this.typed[key]) return;
      this.typed = { ...this.typed, [key]: true };
      if (this.typedMatchId && this.typedMatchId === this.matchId) writeTyped(this.matchId, this.typed);
    },

    startTyping() {
      if (this.typeTimer) return;
      if (!(this.turnsView || []).some((x) => x.typing)) return;   // 没有待打的就别空转
      const pauses = {};
      // 条与条之间要有「呼吸」：上一条打完后停 1.2–2.0s 再开下一条；全场首条停 400ms。
      // 只影响前端播放节奏，不改服务端接话间隔（4–7s），两者不冲突。
      const gapMs = () => 1200 + Math.round(Math.random() * 800);
      if (!this.typeGapUntil || this.typeGapUntil < Date.now()) {
        this.typeGapUntil = Date.now() + (Object.keys(this.typed || {}).length ? gapMs() : 400);
      }
      this.typeTimer = setInterval(() => {
        // 串行：只推进最靠前的那条未打完的（列表里可能同时有多条待打，
        // 但这里永远只推进第一条，所以同一时刻只有一条在增长）
        const next = this.turnsView.find((x) => x.typing);
        if (!next) return;
        const now = Date.now();
        if (now < (this.typeGapUntil || 0)) return;        // 条间停顿
        if (now < (pauses[next.key] || 0)) return;
        const idx = next.shown + 1;
        this.shown[next.key] = idx;
        // 只在三个条件同时满足时自动滚：① 处于贴底 ② 用户 600ms 内没手动滚过 ③ 每 3 个字滚一次
        // （旧版踩过：每字都滚会把正在往上翻历史的用户拽回底部）
        if (this.stickBottom && Date.now() - (this.lastUserScroll || 0) > 600 && idx % 3 === 0) {
          if (this.scrollToBottom) this.scrollToBottom();
        }
        if (idx >= next.text.length) {
          this.markTyped(next.key);
          this.typeGapUntil = Date.now() + gapMs();        // 打完这一条 → 停一下再下一条
          return;
        }
        const ch = next.text.charAt(idx - 1);
        // 出字速度：整条 ≈4.2s 打完（再慢一档），句末 ≤420ms、逗号 ≤160ms
        const per = Math.min(140, Math.max(15, Math.round(4200 / Math.max(1, next.text.length))));
        let d = per;
        if (ch === '。' || ch === '！' || ch === '？') d = Math.min(420, per * 4);
        else if (ch === '，' || ch === '；' || ch === '：') d = Math.min(160, per * 1.5);
        else if (ch === '「' || ch === '」') d = Math.round(per * 1.25);
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
    async submitTurn(text, inputType) {
      const body = String(text || '').trim();
      if (!body) {
        toast('说点什么再发');
        return false;
      }
      try {
        const r = await debateApi.submitTurn(this.matchId, body, inputType || 'kb');
        // B4：后端对「同一轮重复提交」返回 {ok:true, duplicate:true}——这不是失败，
        // 不能走离线兜底重试（那会在本地再插一条重复发言）。
        if (r && r.duplicate) {
          toast('这一轮已经发过');
          await this.load(false);
          return true;                       // 已经发出去了：输入框该清空
        }
        await this.load(false);
        return true;
      } catch (e) {
        // 网络不通 / 服务端异常：不丢字，也不打断训练 —— 本地接一条"我 + 对手草稿"
        toast('提交失败，已按离线模式继续（不计分）');
        this.continueOffline(body);
        return false;
      }
    },

    /**
     * 离线兜底：把用户这句落进本地时间线，再补一条模板回应。
     *
     * <p>约束（和旧版一致）：
     * · 只进本地，不写服务端，**不计入正式评分**；
     * · 回应必须先引用用户刚说的话，再按环节挑攻击角度 —— 否则看起来像复读机；
     * · 带 degraded: true，界面打「离线草稿」标签。
     */
    continueOffline(text) {
      const body = String(text || '').trim();
      if (!body) return;
      const seat = (this.mySeats && this.mySeats[0]) || 'A1';
      const seg = this.segAt(Number((this.match && this.match.step) || 0) + 1) || '自由辩';
      const stepBase = Number((this.match && this.match.step) || 0) + 1;
      const oppSeat = String(seat).startsWith('A') ? 'B1' : 'A1';

      this.localTurns.push({
        step: stepBase,
        seat,
        seg,
        content: body,
        status: 'OK',
        input_type: 'kb',
        local: true
      });

      this.localTurns.push({
        step: stepBase + 0.5,          // 半步：排在对方下一轮之前，视觉上紧跟其后
        seat: oppSeat,
        seg,
        content: offlineReply(body, seg),
        status: 'TEMPLATE',
        degraded: true,
        local: true
      });

      // 本地把回合往前推一格，避免界面卡在"轮到你"
      if (this.match) this.match.step = stepBase;
      this.waiting = false;
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

    /**
     * 催一下：让 AI 立刻接话。
     *
     * 连点保护做三层：
     * · 前端 in-flight：请求没回来之前按钮不可再点；
     * · 前端冷却 3 秒 + 同一步只催一次（记住 skipStep）；
     * · 后端幂等（同一轮只生效一次 + 3 秒冷却），前端被绕过也拦得住。
     */
    async skipAi() {
      if (!this.matchId || this.skipBusy) return;
      if (Date.now() < this.skipUntil) return;
      const step = Number((this.match && this.match.step) || 0);
      if (this.skipStep === step) return;

      this.skipBusy = true;
      try {
        const r = await debateApi.skip(this.matchId);
        if (r && r.ok) {
          this.skipStep = step;
          this.skipUntil = Date.now() + 3000;
          toast('已催，对方开始回应');
          await this.load(false);
        } else {
          toast((r && r.reason) || '现在不能催');
          // 后端说"已经催过"也算生效，别再让用户连点
          if (String((r && r.reason) || '').includes('已经催过')) {
            this.skipStep = step;
            this.skipUntil = Date.now() + 3000;
          }
        }
      } catch (e) {
        toast('催失败：' + ((e && e.message) || ''));
      } finally {
        this.skipBusy = false;
      }
    },

    /** 有没有正在逐字输出的条目 */
    hasTyping() {
      return (this.turnsView || []).some((t) => t.typing);
    },

    /**
     * 「催一下」按钮是否显示。
     *
     * 语义（用户定义）：
     *   · 等 AI 开口时 → 立刻让它开始说
     *   · AI 正在说 → 立刻把整段说完
     * 所以两种阶段都要给按钮，只有"轮到我说"的时候不给。
     */
    canSkip() {
      // 只有单人模式、且这一轮是 AI 在说时才给（多人房间/抢拍阶段没有这个概念）
      if (this.kind !== 'solo') return false;
      if (this.waiting) return false;            // 轮到我说，没什么可催
      if (this.skipBusy) return false;
      // 只要有字还在打字机里，按钮就必须在：这时它的含义是「显示全文」，
      // 不能被「本步已催过 / 上一步催过」挡住（历史 bug：点一次之后就再也点不到）。
      if (this.hasTyping()) return true;
      const step = Number((this.match && this.match.step) || 0);
      // 催过一次只在**冷却期内**藏按钮（服务端受理了但 AI 还在生成时，别让按钮消失）
      if (this.skipStep === step && Date.now() < this.skipUntil) return false;
      return true;
    },

    /**
     * 催一下：
     * · 正在打字 → 就地补全（不打扰服务端，零延迟）
     * · 还没开口 → 请服务端立刻推进
     *
     * FE-5：**先真正发请求，再改按钮状态**。
     * 原来这里在调用 skipAi() 之前就把 skipStep 设成本步，而 skipAi() 开头正好有
     * `if (this.skipStep === step) return;` —— 于是「AI 还没开口」这条路径什么都没发出去，
     * 界面却 toast 成功、按钮消失，用户看到的就是「点了催一下，3–6 秒毫无变化」。
     */
    async nudge() {
      if (this.skipBusy) return;
      const step = Number((this.match && this.match.step) || 0);
      if (this.hasTyping()) {
        // 把还没打的字一次性补齐：标 typed + shown 拉满，打字机自然停下。
        // 注意：**不要**把 skipStep 记成本步——否则「显示全文」之后按钮就消失，
        // 用户再也点不到下一次（历史 bug：催一下/显示全文共用一个按钮，点一次就没了）。
        const typing = (this.turnsView || []).filter((t) => t.typing);
        const shown = { ...this.shown };
        typing.forEach((t) => { shown[t.key] = t.text.length; });
        this.shown = shown;
        typing.forEach((t) => this.markTyped(t.key));
        toast('已显示完整发言');
        return;
      }
      const beforeTurns = (this.turns || []).length;
      await this.skipAi();
      // 服务端受理 ≠ 马上有新发言（AI 可能还在生成）。1.8s 内既没有新 turn、也还是没轮到我，
      // 就明确告诉用户「在组织语言」，而不是让界面看起来像点了没反应。
      setTimeout(() => {
        const stepNow = Number((this.match && this.match.step) || 0);
        if ((this.turns || []).length === beforeTurns && stepNow === step && !this.waiting) {
          toast('对方正在组织语言，稍等');
        }
      }, 1800);
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
      this.rememberMatch(null);
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
      // FE-3：换账号/离开对局时，播放进度归属清空；下一场 load() 会重新按 matchId 读取
      this.typedMatchId = null;
      this.review = null;
      this.panel = null;
      this.tier = 'PRO';   // 换账号/离开对局：档位回默认，避免把上一个账号的选择带过去
      this.lastUserScroll = 0;
      this.chatScrollTop = 0;
      this.err = '';
    }
  }
});
