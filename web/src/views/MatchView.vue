<script setup>
/**
 * 对局（等价旧 match.js）：12 步推进 / 打字机 / 抢拍 / 催一下 / 材料浮窗 / 论据卡。
 *
 * 与旧版一致的关键行为：
 * · 轮询 400ms 为主、SSE 只用来"叫醒"，数据仍以 HTTP 为准（避免 SSE 丢帧即丢状态）；
 * · 打字机**串行**推进，且进度存在 store 里 —— 重渲染（轮询更新）不会让已打的字弹回；
 * · 用户往上翻时暂停自动跟随，并提供「↓ 回到底部」；
 * · 倒计时只在轮到我时走，最后 30 秒标红；打字太慢会自动续时（上限 3 次）。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebateStore } from '../stores/debate.js';
import { useAuthStore } from '../stores/auth.js';
import { debateApi } from '../api.js';
import { toast } from '../utils/toast.js';

const route = useRoute();
const router = useRouter();
const debate = useDebateStore();
const auth = useAuthStore();

const draft = ref('');
const MAX_DRAFT = 1800;                     // 与后端截断口径一致（content 列 4000，留余量）
const draftLen = computed(() => (draft.value || '').length);

/* ==================== 分段发言（用户口径：发送 ≠ 说完） ====================
 *
 * 用户原话：「发送是发送，点结束才能结束自己的发言，之后 AI 再查看并回答」。
 * · 发送：把当前输入框里的内容追加成一段，**立刻清空输入框与草稿**，可以接着写下一段；
 * · 结束发言：把各段按空行拼起来一次性提交（没有分段时用输入框内容），只有轮到我时才可用；
 * · 合计受 1800 字上限约束，超了截断并提示。
 */
const segments = ref([]);
const segJoinedLen = computed(() => segments.value.join('\n\n').length);
const totalLen = computed(() => {
  const parts = segments.value.slice();
  if ((draft.value || '').trim()) parts.push(draft.value);
  return parts.join('\n\n').length;
});
const canEndSpeech = computed(() => !!debate.waiting && totalLen.value > 0);
/**
 * 「催一下 / 直接显示全文 / 灰文案」三选一 —— 两个动作永远不同时出现：
 * · 有字在打字机里     → expand  「直接显示全文」（本地补全）
 * · 语句还没备好        → thinking 灰文案「对方正在组织语言…」（点了没反应）
 * · 语句已备好（ready） → nudge   「催一下」
 * 后端没给 aiState 时退回旧行为（canSkip 说了算），避免误把可催的回合变成灰文案。
 */
const speechAction = computed(() => {
  if (debate.waiting) return 'none';
  if (debate.hasTyping()) return 'expand';
  const st = debate.aiState;
  if (st === 'generating' || st === 'waiting') return 'thinking';
  return debate.canSkip() ? 'nudge' : 'none';
});
const speechText = computed(() => {
  const parts = segments.value.length
    ? segments.value.slice()
    : ((draft.value || '').trim() ? [cleanPasted(draft.value)] : []);
  return parts.join('\n\n').slice(0, MAX_DRAFT);
});

function sendSegment() {
  const text = cleanPasted(draft.value).trim();
  if (!text) return toast('先写点内容再发送');
  const head = segJoinedLen.value ? segJoinedLen.value + 2 : 0;    // 已有分段的长度 + 分隔空行
  const room = MAX_DRAFT - head;
  if (room <= 0) {
    toast('已经到 ' + MAX_DRAFT + ' 字上限，先点「结束发言」吧');
    return;
  }
  const cut = text.length > room ? text.slice(0, room) : text;
  segments.value = segments.value.concat(cut);
  if (cut.length < text.length) toast('已到 ' + MAX_DRAFT + ' 字上限，多出来的部分没放进去');
  // 发送即清空（草稿也一起清）——用户报的 bug 就是这里没清
  draft.value = '';
  saveDraft();
  nextTick(() => {
    const ta = document.querySelector('.composer textarea');
    if (ta) ta.focus();
  });
}

function removeSegment(i) {
  segments.value = segments.value.filter((_, idx) => idx !== i);
}

/**
 * 键盘口径（用户定的）：**回车 = 发言（攒一段）**，Shift+回车 = 换行；
 * 只有点「结束发言」才真正结束这一轮（Ctrl/Cmd+回车保留为快捷结束，方便老手）。
 * 输入法组合状态下的回车不能当成发送（否则选词会把半句话发出去）。
 */
function onComposerKeydown(e) {
  if (e.isComposing || e.keyCode === 229) return;   // 输入法正在组合
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return;                           // Shift+Enter 换行
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    endSpeech();                                    // 快捷结束（与按钮同一动作）
    return;
  }
  sendSegment();                                    // 默认：回车 = 发言
}

// 草稿按对局存在本地：刷新、切页回来都不该让用户重打一遍
const draftKey = () => (debate.matchId ? 'sy_draft_' + debate.matchId : '');
function saveDraft() {
  try {
    const k = draftKey();
    if (!k) return;
    if (draft.value) localStorage.setItem(k, draft.value);
    else localStorage.removeItem(k);
  } catch (e) { /* 忽略 */ }
}
function loadDraft() {
  try {
    const k = draftKey();
    const saved = k ? localStorage.getItem(k) : '';
    if (saved) draft.value = saved;
  } catch (e) { /* 忽略 */ }
}
const chatEl = ref(null);
const showTip = ref(false);

const m = computed(() => debate.match || {});

/** 本场 AI 档位：BASIC(基础版) / PRO(高级版) / BYOK(自带 Key)，后端没给就按高级版展示 */
const tierLabel = computed(() => {
  const t = String(m.value.tier || 'PRO').toUpperCase();
  return t === 'BYOK' ? '自带 Key（免费）' : t === 'BASIC' ? '基础版（免费）' : '高级版';
});

/** 多人房整场费用由房主承担：付款人不是**当前这个用户**时才提示「由房主承担」 */
const payerLabel = computed(() => {
  const payer = m.value.payer_user_id || '';
  const me = (auth.user && auth.user.id) || '';
  if (!payer || !me) return '';
  return String(payer) === String(me) ? '' : '房主';
});
const activeSeat = computed(() => debate.seatAt(debate.stepNo) || '');

/** 正在流式输出的气泡（模型一边生成一边显示，不用等整段） */
const streamList = computed(() =>
  Object.entries(debate.streaming || {}).map(([seat, x]) => ({
    key: 'stream-' + seat,
    seat,
    seg: x.seg,
    text: x.text
  }))
);

/**
 * 反驳提示：从对方最近一条发言里按规则挑攻击角度。
 *
 * <p>灵感来自 Kialo（论证图）和辩论教学的「反驳四问」：定义、因果、举证、反例。
 * 纯规则、零成本，专门解决"轮到我了但不知道从哪儿下手"。
 */
const rebutHints = computed(() => {
  if (!debate.waiting) return [];
  const turns = debate.turnsView || [];
  const oppSeats = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']
    .filter((s) => !debate.mySeats.includes(s) && s[0] !== (debate.mySeats[0] || 'A')[0]);
  const last = turns.filter((t) => oppSeats.includes(t.seat)).pop();
  const text = (last && last.text) || '';
  const hints = [];
  if (/显然|众所周知|毋庸置疑|不用多说|不言而喻/.test(text)) hints.push({ k: '举证', v: '对方用了"显然/众所周知"，让他给出处' });
  if (/所有|全部|一律|从来没有|绝对/.test(text)) hints.push({ k: '反例', v: '全称判断，举一个反例就能破' });
  if (/专家说|权威|大家都|人人都|大家都认为/.test(text)) hints.push({ k: '来源', v: '追问是哪个专家、哪份署名论证' });
  if (/因为|所以|因此|导致|从而/.test(text)) hints.push({ k: '因果', v: '检验因果链：是否只是相关？有没有第三因？' });
  if (/是指|指的是|界定为|定义为|所谓/.test(text)) hints.push({ k: '定义', v: '争定义：换一个更常见的界定，他让步了吗？' });
  if (/[？?]/.test(text)) hints.push({ k: '回应', v: '对方在提问，先正面回答再反问' });
  if (/据《|根据《/.test(text)) hints.push({ k: '核实', v: '核对引用的条款是否支持他的结论' });
  if (!hints.length) hints.push({ k: '口径', v: '追问具体口径：谁来做、按什么标准、什么时候生效' });
  return hints.slice(0, 3);
});

const cdText = computed(() => {
  if (debate.unlimited) return debate.waiting ? '不限时' : '';
  if (!debate.waiting) return '';
  const s = Math.max(0, debate.remaining);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
});
const cdColor = computed(() => {
  if (debate.unlimited) return '#0E9F6E';
  if (debate.remaining <= 30) return '#C0392B';
  if (debate.remaining <= 60) return '#C2671E';
  return '#6B7280';
});

/* ==================== 辅助库（原「论据卡」） ====================
 *
 * 数据：`GET /api/matches/{id}/assist` →
 *   { seat, stage, hints:[{ kind:'反驳|口径|论据|追问', text, basis }], sources:[{ title, note }], generatedBy:'ai'|'rules' }
 * 后端没上线时显示「辅助暂时不可用」+ 重试，不阻塞对局。
 */
const assist = ref(null);
const assistBusy = ref(false);
const assistErr = ref('');
const assistErrRaw = ref('');
const assistOpen = ref(false);
const assistEl = ref(null);

const assistGeneratedBy = computed(() => (assist.value && assist.value.generatedBy) || '');

/** 按 kind 分组：反驳 → 口径 → 论据 → 追问（未知类型排在后面） */
const assistGroups = computed(() => {
  const hints = (assist.value && assist.value.hints) || [];
  const order = ['反驳', '口径', '论据', '追问'];
  const map = new Map();
  hints.forEach((h) => {
    const k = (h && h.kind) || '提示';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(h);
  });
  return [...map.keys()]
    .sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .slice(0, 5)
    .map((k) => ({ kind: k, items: map.get(k).slice(0, 5) }));
});

async function loadAssist(force) {
  if (!debate.matchId || assistBusy.value) return;
  if (!force && (assist.value || assistErr.value)) return;
  assistBusy.value = true;
  assistErr.value = '';
  try {
    const d = await debateApi.assist(debate.matchId);
    assist.value = d && typeof d === 'object' ? d : null;
  } catch (e) {
    assist.value = null;
    const raw = String((e && e.message) || '').trim();
    // 后端还没上线时这里是 404 的原始 JSON：面板上只显示一句人话，原始信息留给 title
    assistErr.value = /^\{/.test(raw)
      ? '接口未就绪（' + (((e && e.code) || (e && e.status)) || '404') + '）'
      : (raw || '接口未就绪');
    assistErrRaw.value = raw;
  } finally {
    assistBusy.value = false;
  }
}

/** 点席位条最右的「辅 AI」：打开（首次会拉一次）并滚到可见处 */
function openAssist() {
  assistOpen.value = true;
  loadAssist(false);
  nextTick(() => {
    const el = assistEl.value;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/** 点一条提示 → 插到输入框（原来的论据卡交互保留） */
function insertHint(h) {
  const text = String((h && h.text) || '').trim();
  if (!text) return;
  draft.value = (draft.value.trim() ? draft.value.trim() + ' ' : '') + text + (text.endsWith('。') ? '' : '。');
  saveDraft();
  toast('已插入发言框');
}

/* ==================== 移动端底部抽屉（进度 / 辅助 / 本场） ====================
 * 桌面端这三块常驻右侧栏；手机上右侧栏隐藏，改成两个胶囊 + 半屏 bottom sheet。
 * 抽屉内容与右侧栏同源（同一份数据、同一批方法），只是排得更紧。
 */
const sheet = ref('');
const sheetTitle = computed(() => (sheet.value === 'plan' ? '赛制进度' : sheet.value === 'assist' ? '辅助库' : '本场'));
function openSheet(name) {
  sheet.value = name;
  if (name === 'assist') loadAssist(false);
}
function closeSheet() {
  sheet.value = '';
}
let sheetTouchY = 0;
function onSheetTouchStart(e) {
  sheetTouchY = (e.touches && e.touches[0] ? e.touches[0].clientY : 0) || 0;
}
function onSheetTouchEnd(e) {
  const y = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0) || 0;
  if (y - sheetTouchY > 60) closeSheet();   // 往下拖 60px 关掉
}

onMounted(async () => {
  // 支持深链 #/match?match=<id>：多人房里队友刷新页面、或从房间/消息点进来时，
  // 内存里没有 matchId，但后端允许 owner 与同房间席位成员读这一场（MatchAccess）。
  if (!debate.matchId && route.query.match) debate.rememberMatch(route.query.match);

  // 刷新页面：地址栏没有 ?match= 时，从本地记住的那场接回来

  if (!debate.matchId) {

    try {

      const saved = localStorage.getItem('sy_match');

      if (saved) debate.rememberMatch(saved);

    } catch (e) { /* 忽略 */ }

  }
  // 直接刷新/从别处进来：matchId 可能不在内存里
  if (!debate.matchId) {
    router.replace({ name: 'solo' });
    return;
  }
  if (!debate.match) await debate.load(true);
  loadAssist(false);          // 辅助库先试着拉一次（后端没上线时面板显示失败态，不影响对局）
  debate.startPoll();
  debate.startClock();
  debate.startTyping();
  loadDraft();
  // 打字机要滚的时候由这里决定怎么滚（store 里只做「要不要滚」的判断）
  debate.scrollToBottom = scrollBottom;
  await nextTick();
  bindScrollGuards();
  // 从别处切回来：保留原来的滚动位置（贴底就跟到底，翻着看历史就停在原处）
  if (debate.stickBottom === false && debate.chatScrollTop > 0 && chatEl.value) {
    chatEl.value.scrollTop = debate.chatScrollTop;
    showTip.value = true;
  } else {
    scrollBottom();
  }
});

// 新增条目就拉一次打字机：首条发言到达时定时器可能还没启动，
// 不拉的话那一条会整段直接出现（"对方一辩直接弹出来"就是这么来的）
watch(
  () => (debate.turns || []).length,
  (n, old) => { if (n > (old || 0)) debate.startTyping(); }
);

onBeforeUnmount(() => {
  // 离开前记住位置，下次回来（还没打完的那一场）接着看
  if (chatEl.value) debate.chatScrollTop = chatEl.value.scrollTop;
  debate.scrollToBottom = null;
  debate.stopPoll();
  debate.stopClock();
  debate.stopTyping();
});

// 对局结束：**不自动跳走**。
// 用户反馈「打完之后页面自己跳了，连反应时间都没有」——现在改成留在本页，
// 停掉播放与计时、输入区置灰（对话还能往上翻），由用户点「看复盘 / 退出」再走。
const finishedCardClosed = ref(false);
const finished = computed(() => {
  const st = (debate.match && debate.match.status) || '';
  return !!st && st !== 'RUNNING';
});
const finishedDismissed = computed(() => finishedCardClosed.value);

watch(
  () => (debate.match && debate.match.status) || '',
  (st, old) => {
    if (!st || st === 'RUNNING' || st === old) return;
    finishedCardClosed.value = false;
    debate.stopPoll();
    debate.stopClock();
    debate.stopTyping();
    debate.waiting = false;
    if (st === 'FINISHED') toast('本场结束');
  }
);

/** 本场用时：优先用后端给的 created_at / finished_at，拿不到就按「步数」兜底 */
const finishedDuration = computed(() => {
  const m = debate.match || {};
  const a = Number(m.created_at || m.started_at || 0);
  const b = Number(m.finished_at || m.updated_at || 0);
  const fmt = (sec) => {
    const s = Math.max(0, Math.round(sec));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (mm ? mm + ' 分 ' : '') + ss + ' 秒';
  };
  if (a > 0 && b > a) {
    const sec = b > 1e12 || a > 1e12 ? (b - a) / 1000 : b - a;
    return fmt(sec);
  }
  return '';   // 拿不到时间戳就不编一个假的「用时」
});

/** 本场总分：优先复盘里的总分，其次对局行上的 total_score */
const finishedTotal = computed(() => {
  const rv = debate.review && debate.review.score;
  if (rv && rv.total != null) return rv.total;
  const m = debate.match || {};
  if (m.total_score != null) return m.total_score;
  return null;
});

function goReview() {
  router.push({ name: 'review', query: { match: debate.matchId } });
}

/** 退出：清掉「上次这一场」的本地记忆，否则下次进来又会恢复一场已经结束的局 */
function leaveFinished() {
  debate.rememberMatch(null);
  try { localStorage.removeItem('sy_match'); } catch (e) { /* 忽略 */ }
  debate.reset();
  router.push({ name: 'matches' });
}

// 有新回合/新状态：贴底由用户是否"本来就在底部"决定
watch(
  () => debate.turns.length,
  async () => {
    await nextTick();
    if (debate.stickBottom) scrollBottom();
  }
);

function scrollBottom() {
  const el = chatEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  debate.stickBottom = true;
  showTip.value = false;
}

function onScroll() {
  const el = chatEl.value;
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  debate.stickBottom = nearBottom;
  showTip.value = !nearBottom;
  // 程序化滚动也会触发 scroll，所以只在「确实离底」时才算用户手动滚过
  if (!nearBottom) debate.lastUserScroll = Date.now();
}

/**
 * 滚轮/触摸/方向键：**立刻**解除跟随，不等 scroll 事件。
 * 打字循环可能先一步把滚动条拽回去，只靠 scroll 事件会「刚翻上去又被弹下来」。
 *
 * 注意：对局页首帧可能还在「正在加载」，`.chat` 要到 match 回来才渲染，
 * 所以这里既在 mounted 后调一次，也挂 watch 兜住「元素后来才出现」的情况。
 */
function bindScrollGuards() {
  const el = chatEl.value;
  if (!el || el.dataset.guards === '1') return;
  el.dataset.guards = '1';
  const stopFollow = () => {
    debate.stickBottom = false;
    debate.lastUserScroll = Date.now();
    showTip.value = true;
  };
  el.addEventListener('wheel', stopFollow, { passive: true });
  el.addEventListener('touchstart', () => {
    debate.lastUserScroll = Date.now();
  }, { passive: true });
  el.addEventListener('touchmove', stopFollow, { passive: true });
  el.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) stopFollow();
  });
}

watch(chatEl, (el) => {
  if (el) bindScrollGuards();
});

// ==================== 语音输入（R-VOICE-01~05）====================
const REC_MAX_SEC = 90;
const recOn = ref(false);
const recSec = ref(0);
const recErr = ref('');
let recog = null;
let recTimer = null;
let usedVoice = false;

const recSupported = computed(() => {
  const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
  return !!SR;
});

function stopVoice() {
  if (recTimer) { clearInterval(recTimer); recTimer = null; }
  if (recog) { try { recog.stop(); } catch (e) { /* 忽略 */ } recog = null; }
  recOn.value = false;
}

function startVoice() {
  recErr.value = '';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    recErr.value = '当前浏览器不支持语音识别，请用键盘输入（Chrome / Edge 支持）';
    toast(recErr.value);
    return;
  }
  if (!debate.waiting) return toast('还没轮到你发言');
  try {
    recog = new SR();
  } catch (e) {
    recErr.value = '语音初始化失败，请用键盘输入';
    return;
  }
  recog.lang = 'zh-CN';
  recog.continuous = true;
  recog.interimResults = true;          // 实时转写（R-VOICE-02）

  let base = draft.value;               // 已经写好的部分不覆盖
  recog.onresult = (ev) => {
    let finalText = '', interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText) base = (base ? base + (base.endsWith('。') ? '' : '。') : '') + finalText;
    // 结果落到输入框且可编辑（R-VOICE-02）
    draft.value = base + interim;
    usedVoice = true;
    saveDraft();
    debate.keepalive();
  };
  recog.onerror = (ev) => {
    const code = (ev && ev.error) || 'unknown';
    recErr.value = code === 'not-allowed'
      ? '麦克风被拒绝，请允许权限或改用键盘输入'
      : '语音识别出错（' + code + '），可以继续用键盘输入';
    stopVoice();
  };
  recog.onend = () => { stopVoice(); };

  try {
    recog.start();
  } catch (e) {
    recErr.value = '无法开始录音，请用键盘输入';
    return;
  }

  recOn.value = true;
  recSec.value = 0;
  recTimer = setInterval(() => {
    recSec.value += 1;
    if (recSec.value >= REC_MAX_SEC) {   // 到上限自动停、保留文本（R-VOICE-04）
      toast('已到 90 秒上限，文本已保留');
      stopVoice();
    }
  }, 1000);
}

onBeforeUnmount(() => stopVoice());

/* ==================== 发言审核官 ====================
 *
 * 点「结束发言」先过一次 `POST /api/matches/{id}/speech-check {content}`：
 * · ok:true  → 照旧提交；
 * · ok:false → **不提交**，弹出审核官面板逐条列 message + fix，内容原样保留；
 * · 接口失败（404/网络/超时）→ 降级为直接提交，绝不因为审核官卡住用户。
 */
const checkBusy = ref(false);
const checkOpen = ref(false);
const checkIssues = ref([]);
const checkTips = ref('');

function closeCheck() {
  checkOpen.value = false;
  nextTick(() => {
    const ta = document.querySelector('.composer textarea');
    if (ta && !ta.disabled) ta.focus();
  });
}

/**
 * 结束发言：审核 → 提交。
 * · 只有轮到我时可用；
 * · 成功 / duplicate 都会清空分段与输入框（用户报的 bug：之前只在 ok 时清）；
 * · 审核不通过：不提交、保留内容、打开审核官面板；
 * · 真失败（网络断、离线兜底）保留内容，提示再点一次。
 */
async function endSpeech() {
  if (!debate.waiting) return toast('还没轮到你——写好的内容会留着，轮到你就能发');
  const text = speechText.value;
  if (!text) return toast('说点什么再发');
  if (totalLen.value > MAX_DRAFT) toast('超过 ' + MAX_DRAFT + ' 字，已截断到上限');

  // ① 审核（失败就跳过，直接放行）
  let check = null;
  if (debate.matchId) {
    checkBusy.value = true;
    try {
      check = await debateApi.speechCheck(debate.matchId, text);
    } catch (e) {
      check = null;                      // 404 / 网络：降级为直接提交
    } finally {
      checkBusy.value = false;
    }
  }
  if (check && check.ok === false) {
    checkIssues.value = Array.isArray(check.issues) ? check.issues : [];
    checkTips.value = check.tips || '';
    checkOpen.value = true;
    if (!checkIssues.value.length) toast('审核官建议再改一改');
    return;                              // 不提交，内容保留
  }

  // ② 提交
  const ok = await debate.submitTurn(text, usedVoice ? 'voice' : 'kb');
  if (ok) {
    segments.value = [];
    draft.value = '';
    usedVoice = false;
    saveDraft();
    await nextTick();
    scrollBottom();
  } else {
    toast('提交失败，内容已保留，可以再点一次「结束发言」');
  }
}

/** 兼容旧入口：Ctrl/Cmd+Enter = 结束发言（和按钮同一个动作） */
function submit() {
  return endSpeech();
}

/**
 * 粘贴清洗：从网页/Word 复制常带零宽字符、全角空格、成堆空行。
 * 直接塞给后端会变成一堆看不见的字符，用户看着"明明有字却发不出/评分为空"。
 */
function cleanPasted(raw) {
  return String(raw || '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')  // 零宽
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0|\u3000/g, ' ')                 // &nbsp; / 全角空格
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function onPaste(e) {
  const raw = (e.clipboardData && e.clipboardData.getData('text')) || '';
  if (!raw) return;                       // 图片等交给浏览器默认处理
  e.preventDefault();
  const ta = e.target;
  const cleaned = cleanPasted(raw).slice(0, MAX_DRAFT);
  const start = ta.selectionStart ?? draft.value.length;
  const end = ta.selectionEnd ?? draft.value.length;
  const next = draft.value.slice(0, start) + cleaned + draft.value.slice(end);
  draft.value = next.slice(0, MAX_DRAFT);
  saveDraft();
  debate.keepalive();
  requestAnimationFrame(() => {
    try {
      const pos = Math.min(start + cleaned.length, ta.value.length);
      ta.setSelectionRange(pos, pos);
    } catch (err) { /* 忽略 */ }
  });
  if (raw.length !== cleaned.length && cleaned.length >= MAX_DRAFT) {
    toast('内容超过 ' + MAX_DRAFT + ' 字，已截断');
  }
}

function onType() {
  saveDraft();
  debate.keepalive();
}

/** 点论据卡插入到发言框（没轮到我时只提示，不偷偷塞进别的会话） */
function insertCard(c) {
  if (!debate.waiting) return toast('还没轮到你发言，先把卡片记下来');
  const text = c.claim + '（据' + c.source + '）';
  draft.value = (draft.value.trim() ? draft.value.trim() + ' ' : '') + text + '。';
  toast(c.verified ? '已插入（可信来源）' : '已插入，注意这条标了「需核实」');
}

/**
 * 漏洞卡什么时候出现：
 * 服务端在 AI 说完的同时就把"埋了漏洞"推过来了，但界面上那句话还在打字。
 * 直接弹卡会让人觉得"对方还没说完就让我抓"——所以等那一条打完再显示。
 */
const flawReady = computed(() => {
  const o = debate.flawOffer;
  if (!o) return false;
  const t = (debate.turnsView || []).find((x) => Number(x.step) === Number(o.step));
  if (!t) return false;          // 那句话还没到
  return !t.typing;              // 打完才让抓
});

/** 漏洞针对的那一句（席位 + 环节） */
const flawTarget = computed(() => {
  const o = debate.flawOffer;
  if (!o) return '';
  const t = (debate.turnsView || []).find((x) => Number(x.step) === Number(o.step));
  return t ? t.seat + ' · ' + t.seg : '';
});

async function answerFlaw(opt) {
  // 判定由后端在下一轮计分里体现；这里只需要把用户的选择记下并关闭面板
  toast('已记录你的判断：「' + opt + '」');
  debate.flawOffer = null;
}

async function exitMatch() {
  debate.stopPoll();
  debate.stopClock();
  router.push({ name: 'solo' });
}

/**
 * 气泡文字兜底：模型偶尔把同一段换个说法再说几遍。
 * 服务端已按精确句去重，这里再按"相邻句高度重合"剪一次。
 */
function dedupeBubble(text) {
  if (!text || text.length < 200) return text;
  const parts = text.split(/(?<=[。！？；])/);
  if (parts.length < 4) return text;
  const out = [];
  for (const p of parts) {
    const cur = p.trim();
    if (!cur) continue;
    const dup = out.some((prev) => {
      const a = prev.replace(/\s/g, '');
      const b = cur.replace(/\s/g, '');
      if (a.length < 10 || b.length < 10) return false;
      const setA = new Set(a.slice(0, 40));
      const setB = new Set(b.slice(0, 40));
      let hit = 0;
      setB.forEach((ch) => { if (setA.has(ch)) hit++; });
      return hit / Math.max(1, setB.size) > 0.85;
    });
    if (dup) break;
    out.push(cur);
  }
  return out.join('');
}

const verdictOf = (t) => (t.typing ? '' : '');
</script>

<template>
  <div v-if="!debate.match" class="card">
    <div class="empty">{{ debate.err || '加载中…' }}</div>
  </div>

  <template v-else>
    <div class="row mv-head" style="justify-content: space-between; margin-bottom: 10px">
      <div class="mv-head-main">
        <h1 class="pg mv-title">{{ m.topic_title }}</h1>
        <p class="sub mv-sub" style="margin: 0">
          {{ m.mode === 'SPRINT' ? '快速' : '标准' }} {{ debate.totalSteps || '—' }} 步 · 你占 {{ m.my_seats }} ·
          <span class="dot"></span>{{ m.status === 'RUNNING' ? '进行中' : m.status }}
        </p>
      </div>
      <div class="row mv-head-acts">
        <span class="tag mono">第 {{ debate.stepNo }} 步</span>
        <button class="btn sm ghost mv-exit" @click="exitMatch"><span class="mv-exit-t">退出</span><span class="mv-exit-i" aria-hidden="true">✕</span></button>
      </div>
    </div>

    <!-- 本场结束：留在本页先给结论与出口（不自动跳走） -->
    <div v-if="finished && !finishedDismissed" class="card finish-card">
      <div class="fin-top">
        <div class="fin-main">
          <b class="fin-title">本场结束</b>
          <div class="fin-sub">{{ m.topic_title }}</div>
        </div>
        <div v-if="finishedTotal != null" class="fin-score">
          <b>{{ finishedTotal }}</b><small>分</small>
        </div>
        <div v-else class="fin-score"><b>待出分</b></div>
      </div>
      <div class="fin-meta">
        <span v-if="finishedDuration">用时 {{ finishedDuration }}</span>
        <span>发言 {{ (debate.turns || []).length }} 条</span>
        <span>你占 {{ m.my_seats }}</span>
      </div>
      <div class="fin-acts">
        <button class="btn primary" @click="goReview">看复盘</button>
        <button class="btn ghost" @click="leaveFinished">退出</button>
        <button class="btn ghost" @click="finishedCardClosed = true">继续停留</button>
      </div>
      <div class="fin-tip">对话还能往上翻；想找这一场可以到「对局 → 已结束」。</div>
    </div>

    <!-- 材料浮窗入口 -->
    <button
      v-if="m.topic_id"
      class="btn sm ghost brief-fab"
      @click="debate.toggleBrief()"
    >
      📋 材料
    </button>

    <!-- 材料浮窗 -->
    <div v-if="debate.showBrief" class="mask" @click.self="debate.toggleBrief()">
      <div class="panel" style="width: min(720px, 100%)">
        <div class="row" style="justify-content: space-between">
          <h2 style="margin: 0">作战卡 · {{ (debate.brief && debate.brief.side) || '' }}</h2>
          <button class="btn sm ghost" @click="debate.toggleBrief()">收起</button>
        </div>
        <div class="desc">{{ (debate.brief && debate.brief.topic) || '正在生成…' }}</div>

        <template v-if="debate.brief">
          <b style="font-size: 12.5px">① 先把词定清楚</b>
          <div style="margin: 6px 0 12px">
            <div v-for="(d, i) in debate.brief.definitions || []" :key="i" style="font-size: 12.5px; margin: 4px 0">
              <b>{{ d.term }}</b>：{{ d.def }}
            </div>
            <div v-if="!(debate.brief.definitions || []).length" class="empty">暂无</div>
          </div>

          <b style="font-size: 12.5px">② 立论骨架（按这个顺序说）</b>
          <div style="margin: 6px 0 12px">
            <div
              v-for="(c, i) in debate.brief.case || []"
              :key="i"
              style="font-size: 12.5px; margin: 4px 0; padding-left: 10px; border-left: 2px solid #E6E3DC"
            >
              {{ c }}
            </div>
          </div>

          <b style="font-size: 12.5px">③ 对方最可能怎么打，你怎么接</b>
          <div style="margin: 6px 0 12px">
            <div v-for="(a, i) in debate.brief.attacks || []" :key="i" style="font-size: 12.5px; margin: 4px 0">{{ a }}</div>
          </div>

          <b style="font-size: 12.5px">④ 回应句式</b>
          <div style="margin: 6px 0 12px">
            <div v-for="(r, i) in debate.brief.rebuttals || []" :key="i" style="font-size: 12.5px; margin: 4px 0">{{ r }}</div>
          </div>

          <b style="font-size: 12.5px">⑤ 可引用论据（点一下插入发言框）</b>
          <div style="margin-top: 6px">
            <div
              v-for="(c, i) in debate.brief.evidence || []"
              :key="i"
              style="border: 1px solid #efede6; border-radius: 8px; padding: 7px 9px; margin-bottom: 6px; cursor: pointer"
              @click="insertCard(c)"
            >
              <div style="font-size: 11.5px; line-height: 1.6">{{ c.claim }}</div>
              <div style="font-size: 10.5px; color: #a8adb8; margin-top: 2px">{{ c.source }} {{ c.year || '' }}</div>
            </div>
            <div v-if="!(debate.brief.evidence || []).length" class="empty">这道题暂无卡片</div>
          </div>

          <div style="font-size: 11.5px; color: #a8adb8; margin-top: 10px">
            材料只给结构，句子还是你自己组织——照抄会被抓漏洞。
          </div>
        </template>
      </div>
    </div>

    <!-- 席位条（最右多一个「辅 AI」：不发言、不可抢拍，点开辅助库） -->
    <div class="strip">
      <div v-for="s in debate.stripSeats" :key="s.k" class="sp" :class="{ me: s.me, cur: s.cur }">
        <div class="av" :class="s.side.toLowerCase()">{{ s.me ? '我' : 'AI' }}</div>
        <div>
          <div class="nm">{{ s.me ? '你' : 'AI' }}</div>
          <div class="rl">{{ s.side === 'A' ? '正方' : '反方' }}{{ s.role }}</div>
        </div>
      </div>
      <!-- 辅助席位：不是辩手，只负责给提示 -->
      <button
        type="button"
        class="sp aux"
        :class="{ on: assistOpen }"
        title="打开辅助库：反驳角度 / 口径 / 论据 / 追问"
        @click="openAssist"
      >
        <div class="av aux-av">辅</div>
        <div>
          <div class="nm">辅 AI</div>
          <div class="rl">不出手 · 只提示</div>
        </div>
      </button>
    </div>

    <div class="stage">
      <div>
        <div style="position: relative">
          <div ref="chatEl" class="chat" @scroll="onScroll">
            <div v-if="!debate.turnsView.length" class="sys"><span>对局开始，等待第一条发言…</span></div>
            <div v-for="t in debate.turnsView" :key="t.key" class="msg" :class="[t.side, { me: t.me }]">
              <div class="ava" :class="t.me ? 'me' : t.side">{{ t.me ? '我' : t.side === 'a' ? '正' : '反' }}</div>
              <div class="bd">
                <div class="hd">
                  <b>{{ t.me ? '你' : 'AI 辩手' }}</b>
                  <span>{{ t.seat }}</span>
                  <span>·</span>
                  <span>{{ t.seg }}</span>
                  <span v-if="t.timeout" class="tag r">超时</span>
                  <span v-if="t.degraded" class="tag o" title="模板降级或本地离线草稿，不计入正式评分">离线草稿</span>
                  <span v-if="t.stream" class="tag blue" title="模型正在生成，先显示已收到的部分">生成中…</span>
                </div>
                <div class="bub" :class="{ 'is-pending': t.typing && !t.started }">
                  <span v-if="t.typing && !t.started" class="pending">…</span>
                  <span v-else class="bub-in">
                    <!--
                      B 方气泡：用一个 visibility:hidden 的**全文**占位把宽度先撑到最终值，
                      可见的前缀用绝对定位盖在上面 —— 于是文字从左往右长，左边缘不会往左扩。
                      A 方不渲染 ghost，行为与之前一致。
                    -->
                    <span v-if="t.typing && t.side === 'b'" class="bub-ghost" aria-hidden="true">{{ dedupeBubble(t.text) }}</span>
                    <span :class="t.typing && t.side === 'b' ? 'bub-live' : ''">{{ dedupeBubble(t.text.slice(0, t.shown)) }}</span>
                  </span><span v-if="t.stream" class="caret">▍</span>
                </div>
              </div>
            </div>
          </div>

          <button
            v-if="showTip"
            class="btn sm primary"
            style="position: absolute; right: 14px; bottom: 12px; box-shadow: 0 6px 16px rgba(0,0,0,.16)"
            @click="scrollBottom"
          >
            ↓ 回到底部
          </button>
        </div>

        <!-- 抢拍入口先关掉：用户不该主动抢话（BUZZ 阶段由后端关闭；这里连入口都不再渲染） -->

        <!-- 抓漏洞 -->
        <div
          v-if="flawReady"
          class="card"
          style="margin-top: 12px; border-color: #e3c08a; background: #fff9f0"
        >
          <div class="row" style="justify-content: space-between">
            <b style="font-size: 12.5px">对方那句有逻辑问题 —— 你抓到了吗？<span v-if="flawTarget" class="tag" style="margin-left:8px">{{ flawTarget }}</span></b>
            <span class="tag o">抓对 +3</span>
          </div>
          <div class="row" style="gap: 8px; margin-top: 10px; flex-wrap: wrap">
            <button
              v-for="o in debate.flawOffer.options || []"
              :key="o"
              class="btn sm ghost"
              @click="answerFlaw(o)"
            >
              {{ o }}
            </button>
            <button class="btn sm ghost" style="color: #a8adb8" @click="debate.flawOffer = null">跳过</button>
          </div>
        </div>

        <!-- 发言区 -->
        <div class="composer" :class="{ 'is-finished': finished }">
          <!-- 移动端：底部固定的两个胶囊，打开底部抽屉（桌面端隐藏） -->
          <div class="composer-pills">
            <button type="button" class="pill" @click="openSheet('plan')">
              <span aria-hidden="true">📋</span> 进度 {{ debate.stepNo }}/{{ debate.totalSteps }}
            </button>
            <button type="button" class="pill" :class="{ on: assistErr }" @click="openSheet('assist')">
              <span aria-hidden="true">✦</span> 辅助{{ assistGroups.length ? ' ' + assistGroups.length : '' }}
            </button>
            <button type="button" class="pill" @click="openSheet('stats')">
              <span aria-hidden="true">◔</span> 本场
            </button>
          </div>
          <div class="hint">
            <span>{{ debate.waiting ? '轮到你发言' : '等待对方发言…' }}</span>
            <span :style="{ fontFamily: 'ui-monospace,monospace', color: cdColor, fontWeight: debate.remaining <= 30 && !debate.unlimited ? 700 : 400 }">
              {{ cdText }}
            </span>
          </div>

          <!-- 对方回合：只占一行提示，不挡输入框（你可以在对方说话时先写好） -->
          <div v-if="!debate.waiting && !finished" class="waiting">
            <span>{{ debate.hasTyping() ? '对方正在说话…' : '对方正在思考…' }}</span>
            <button
              v-if="debate.kind === 'solo' && speechAction === 'expand'"
              class="btn sm ghost"
              style="margin-left: 10px"
              title="不用等服务端，直接把这句补全"
              @click="debate.nudge()"
            >直接显示全文</button>
            <button
              v-else-if="debate.kind === 'solo' && speechAction === 'nudge'"
              class="btn sm ghost"
              style="margin-left: 10px"
              :disabled="debate.skipBusy || !debate.canSkip()"
              :title="debate.canSkip() ? '语句已备好，催它立刻开口' : '这一轮已经催过了，等下一步'"
              @click="debate.nudge()"
            >{{ debate.skipBusy ? '催中…' : '催一下' }}</button>
            <span
              v-else-if="debate.kind === 'solo' && speechAction === 'thinking'"
              class="thinking-wait"
            >对方正在组织语言…</span>
          </div>

          <div v-if="debate.waiting && rebutHints.length" class="hints">
            <span class="hint-label">可以从这儿下手</span>
            <span v-for="h in rebutHints" :key="h.k" class="hint-chip" :title="h.v">
              <b>{{ h.k }}</b>{{ h.v }}
            </span>
          </div>

          <div v-if="recOn" class="recbar">正在录音 {{ recSec }}s / 90s · 说完点「停止」，文本可编辑后再发送</div>
          <div v-else-if="recErr" class="recbar err">{{ recErr }}</div>

          <!-- 移动端小工具栏：语音 / 材料（催一下留在上方"对方正在说话"那一行，避免出现两个同名按钮） -->
          <div class="composer-tools">
            <button
              type="button"
              class="tool"
              :disabled="!recSupported || !debate.waiting"
              @click="recOn ? stopVoice() : startVoice()"
            >{{ recOn ? '● 录音 ' + recSec + 's' : '🎤 语音' }}</button>
            <button
              v-if="m.topic_id"
              type="button"
              class="tool"
              @click="debate.toggleBrief()"
            >📋 材料</button>
          </div>

          <!-- 分段发言：发送只是「攒这一段」，点「结束发言」才真正提交 -->
          <div v-if="segments.length" class="segs">
            <div class="segs-hd">
              <b>本次发言 {{ segments.length }} 段</b>
              <span>{{ segJoinedLen }} 字 · 结束后一起发给对方</span>
            </div>
            <div v-for="(s, i) in segments" :key="i" class="seg">
              <span class="seg-no">{{ i + 1 }}</span>
              <div class="seg-tx">{{ s }}</div>
              <button type="button" class="seg-del" title="删掉这一段" @click="removeSegment(i)">×</button>
            </div>
          </div>

          <textarea
            v-model="draft"
            :disabled="recOn || finished"
            :placeholder="finished ? '本场已结束 —— 看复盘，或退出到「对局 → 已结束」' : (debate.waiting ? '写下这一段…（回车 = 发言，Shift+回车 = 换行，点「结束发言」结束）' : '对方还在说 —— 先写这一段，轮到你就能结束发言')"
            @input="onType"
            @paste="onPaste"
            @keydown="onComposerKeydown"
          ></textarea>
          <div class="count">
            <span :class="{ warn: totalLen > MAX_DRAFT }">{{ totalLen }} / {{ MAX_DRAFT }} 字</span>
            <span v-if="totalLen > MAX_DRAFT" style="color: #C0392B">超出上限，结束发言时会截断</span>
          </div>

          <div class="row composer-acts" style="margin-top: 8px">
            <span class="tools-d" style="font-size: 11.5px; color: #a8adb8">
              {{ debate.waiting ? (debate.extendUsed ? '已自动续命 ' + debate.extendUsed + ' 次' : '打字时会自动续时') : '先写好，轮到你就能结束发言' }}
            </span>
            <button
              v-if="debate.kind === 'solo'"
              class="btn sm ghost tools-d"
              disabled
              style="margin-left: 10px"
              title="轮到你说，没法催"
            >催一下</button>
            <span class="tools-d" style="flex: 1"></span>
            <button
              class="btn sm ghost tools-d"
              :disabled="!recSupported || !debate.waiting"
              :title="recSupported ? (debate.waiting ? '语音输入（最长 90 秒）' : '轮到你才能录音') : '当前浏览器不支持语音识别'"
              @click="recOn ? stopVoice() : startVoice()"
            >{{ recOn ? '● 录音 ' + recSec + 's' : '🎤 语音' }}</button>
            <button
              class="btn sm ghost act-send"
              style="margin-left: 8px"
              :disabled="finished || !draft.trim()"
              title="把这一段加进本次发言（立刻清空输入框，随时可用）"
              @click="sendSegment"
            >发送</button>
            <button
              class="btn sm primary act-end"
              style="margin-left: 8px"
              :disabled="finished || !canEndSpeech || checkBusy"
              :title="debate.waiting ? '结束发言，一次提交本次所有分段（Ctrl+Enter）' : '还没轮到你，先攒着，轮到你就能结束发言'"
              @click="endSpeech"
            >{{ checkBusy ? '审核中…' : (debate.waiting ? '结束发言' : '等我回合') }}</button>
          </div>
        </div>
      </div>

      <!-- 右侧（桌面常显；手机上收进底部抽屉：「进度」「辅助」两个胶囊打开） -->
      <div class="right-col">
        <div class="card">
          <div class="row" style="justify-content: space-between; margin-bottom: 8px">
            <b style="font-size: 12.5px">赛制进度</b>
            <span style="font-size: 11.5px; color: #8a909c">{{ debate.stepNo }}/{{ debate.totalSteps }}</span>
          </div>
          <div class="steps">
            <div
              v-for="(step, i) in (debate.plan && debate.plan.length ? debate.plan : [])"
              :key="n"
              class="st"
              :class="{ done: i + 1 < debate.stepNo, cur: i + 1 === debate.stepNo }"
            >
              <span class="no">{{ i + 1 }}</span>
              <span>{{ step.seg }} · {{ step.seat }}{{ debate.mySeats.includes(step.seat) ? ' · 你' : '' }}</span>
            </div>
          </div>
        </div>

        <!-- 辅助库（原「论据卡」）：AI 席位给的角度 + 可引用来源 -->
        <div ref="assistEl" class="card assist-card" style="margin-top: 12px">
          <div class="row" style="justify-content: space-between; margin-bottom: 8px">
            <b style="font-size: 12.5px">辅助 · AI 席位</b>
            <span class="row" style="gap: 8px">
              <span v-if="assistGeneratedBy" class="tag" :class="assistGeneratedBy === 'ai' ? 'b' : ''">
                {{ assistGeneratedBy === 'ai' ? 'AI 生成' : '规则生成' }}
              </span>
              <button class="btn sm ghost" :disabled="assistBusy" @click="loadAssist(true)">
                {{ assistBusy ? '取材料…' : '刷新' }}
              </button>
            </span>
          </div>
          <div style="font-size: 11.5px; color: #8a909c; margin-bottom: 8px">
            点一条提示插入发言框；标「需核实」的来源请自己查证再用。
          </div>

          <!-- 加载中：骨架 -->
          <div v-if="assistBusy && !assist" class="assist-sk">
            <i></i><i></i><i></i>
          </div>

          <!-- 失败：可直接重试 -->
          <div v-else-if="assistErr" class="assist-err">
            <div>辅助暂时不可用</div>
            <div class="assist-err-d" :title="assistErrRaw">{{ assistErr }}</div>
            <button class="btn sm ghost" style="margin-top: 8px" @click="loadAssist(true)">重试</button>
          </div>

          <template v-else-if="assist">
            <div class="assist-meta">
              <span v-if="assist.seat">席位 {{ assist.seat }}</span>
              <span v-if="assist.stage">· {{ assist.stage }}</span>
            </div>
            <div v-for="g in assistGroups" :key="g.kind" class="assist-group">
              <div class="assist-kind">{{ g.kind }}</div>
              <button
                v-for="(h, i) in g.items"
                :key="i"
                type="button"
                class="assist-hint"
                @click="insertHint(h)"
              >
                <span class="assist-tx">{{ h.text }}</span>
                <span v-if="h.basis" class="assist-basis">{{ h.basis }}</span>
              </button>
            </div>
            <div v-if="(assist.sources || []).length" class="assist-sources">
              <div class="assist-kind">来源</div>
              <div v-for="(s, i) in assist.sources" :key="i" class="assist-src">
                <span class="assist-src-t">{{ s.title }}</span>
                <span class="tag o" style="font-size: 9.5px">需核实</span>
                <div v-if="s.note" class="assist-src-n">{{ s.note }}</div>
              </div>
            </div>
            <div v-if="!assistGroups.length && !(assist.sources || []).length" class="empty" style="padding: 12px 0">
              这一轮还没有可用的提示
            </div>
          </template>

          <div v-else class="empty" style="padding: 12px 0">
            <button class="btn sm ghost" @click="loadAssist(false)">打开辅助库</button>
          </div>
        </div>

        <div class="card" style="margin-top: 12px">
          <b style="font-size: 12.5px">本场</b>
          <div style="margin-top: 8px">
            <div class="kv"><span>你的席位</span><b>{{ m.my_seats }}</b></div>
            <div class="kv"><span>已记录发言</span><b>{{ debate.turns.length }}</b></div>
            <div class="kv"><span>AI 档位</span><b>{{ tierLabel }}</b></div>
            <div v-if="payerLabel" class="kv"><span>费用</span><b>由{{ payerLabel }}承担</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 移动端底部抽屉：赛制进度 / 辅助库 / 本场（桌面端隐藏，内容与右侧栏同源） -->
    <div v-if="sheet" class="sheet-mask" @click.self="closeSheet">
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="sheetTitle"
        @touchstart.passive="onSheetTouchStart"
        @touchend.passive="onSheetTouchEnd"
      >
        <div class="sheet-grip" aria-hidden="true"></div>
        <header class="sheet-hd">
          <b>{{ sheetTitle }}</b>
          <button type="button" class="sheet-x" aria-label="关闭" @click="closeSheet">✕</button>
        </header>
        <div class="sheet-bd">
          <template v-if="sheet === 'plan'">
            <div class="steps">
              <div
                v-for="(step, i) in (debate.plan && debate.plan.length ? debate.plan : [])"
                :key="'sp' + i"
                class="st"
                :class="{ done: i + 1 < debate.stepNo, cur: i + 1 === debate.stepNo }"
              >
                <span class="no">{{ i + 1 }}</span>
                <span>{{ step.seg }} · {{ step.seat }}{{ debate.mySeats.includes(step.seat) ? ' · 你' : '' }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="sheet === 'assist'">
            <div class="row" style="justify-content: space-between; margin-bottom: 8px">
              <span style="font-size: 12px; color: #8a909c">
                辅助 · AI 席位{{ assistGeneratedBy ? ' · ' + (assistGeneratedBy === 'ai' ? 'AI 生成' : '规则生成') : '' }}
              </span>
              <button class="btn sm ghost" :disabled="assistBusy" @click="loadAssist(true)">
                {{ assistBusy ? '取材料…' : '刷新' }}
              </button>
            </div>
            <div v-if="assistBusy && !assist" class="assist-sk"><i></i><i></i><i></i></div>
            <div v-else-if="assistErr" class="assist-err">
              <div>辅助暂时不可用</div>
              <div class="assist-err-d" :title="assistErrRaw">{{ assistErr }}</div>
              <button class="btn sm ghost" style="margin-top: 8px" @click="loadAssist(true)">重试</button>
            </div>
            <template v-else-if="assist">
              <div v-for="g in assistGroups" :key="'sg' + g.kind" class="assist-group">
                <div class="assist-kind">{{ g.kind }}</div>
                <button v-for="(h, i) in g.items" :key="i" type="button" class="assist-hint" @click="insertHint(h)">
                  <span class="assist-tx">{{ h.text }}</span>
                  <span v-if="h.basis" class="assist-basis">{{ h.basis }}</span>
                </button>
              </div>
              <div v-if="(assist.sources || []).length" class="assist-sources">
                <div class="assist-kind">来源</div>
                <div v-for="(s, i) in assist.sources" :key="'ss' + i" class="assist-src">
                  <span class="assist-src-t">{{ s.title }}</span>
                  <span class="tag o" style="font-size: 9.5px">需核实</span>
                  <div v-if="s.note" class="assist-src-n">{{ s.note }}</div>
                </div>
              </div>
            </template>
            <div v-else class="empty" style="padding: 12px 0">
              <button class="btn sm ghost" @click="loadAssist(false)">打开辅助库</button>
            </div>
          </template>

          <template v-else>
            <div class="kv"><span>你的席位</span><b>{{ m.my_seats }}</b></div>
            <div class="kv"><span>已记录发言</span><b>{{ debate.turns.length }}</b></div>
            <div class="kv"><span>AI 档位</span><b>{{ tierLabel }}</b></div>
            <div v-if="payerLabel" class="kv"><span>费用</span><b>由{{ payerLabel }}承担</b></div>
          </template>
        </div>
      </section>
    </div>

    <!-- 审核官：发言没过审 → 不提交，逐条给 message + fix，内容原样保留 -->
    <div v-if="checkOpen" class="check-mask" @click.self="closeCheck">
      <section class="check-panel" role="dialog" aria-modal="true" aria-label="发言审核官">
        <header class="check-hd">
          <span class="check-av" aria-hidden="true">审</span>
          <div class="check-who">
            <b>审核官 · AI</b>
            <div class="check-sub">这条发言建议先改一改再发</div>
          </div>
          <button type="button" class="check-x" aria-label="关闭" @click="checkOpen = false">✕</button>
        </header>

        <ul class="check-list">
          <li v-for="(it, i) in checkIssues" :key="i" class="check-item">
            <div class="check-msg">{{ it.message || it.code }}</div>
            <div v-if="it.fix" class="check-fix">改成：{{ it.fix }}</div>
          </li>
          <li v-if="!checkIssues.length" class="check-item">
            <div class="check-msg">这条发言还不够清楚，建议补一句判断或依据。</div>
          </li>
        </ul>

        <p v-if="checkTips" class="check-tips">{{ checkTips }}</p>

        <div class="check-acts">
          <button class="btn primary" @click="closeCheck">继续修改</button>
          <button class="btn ghost" @click="checkOpen = false">关闭</button>
        </div>
        <div class="check-note">内容都保留着，关掉面板也不会丢。</div>
      </section>
    </div>
  </template>
</template>

<style scoped>
/* ---------- 发言审核官面板 ---------- */
.check-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(20, 22, 28, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.check-panel {
  width: min(520px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 16px 14px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24);
}
.check-hd { display: flex; align-items: center; gap: 10px; }
.check-av {
  flex: 0 0 36px;
  width: 36px; height: 36px; border-radius: 11px;
  background: var(--org-w);
  color: var(--org);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800;
}
.check-who { flex: 1; min-width: 0; }
.check-who b { font-size: 14px; color: var(--ink); }
.check-sub { font-size: 11.5px; color: var(--sub); margin-top: 2px; }
.check-x {
  width: 44px; height: 44px; border-radius: 12px;
  color: var(--sub); font-size: 15px;
}
.check-list { list-style: none; margin: 12px 0 0; padding: 0; }
.check-item {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--card);
}
.check-msg { font-size: 13px; line-height: 1.6; color: var(--ink); }
.check-fix {
  font-size: 12.5px; line-height: 1.6; color: var(--ok-ink, #087a52);
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.check-tips { font-size: 12px; color: var(--sub); margin: 6px 0 0; line-height: 1.6; }
.check-acts { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.check-acts .btn { flex: 1 1 120px; }
.check-note { font-size: 11.5px; color: var(--sub); margin-top: 8px; }
@media (max-width: 520px) {
  .check-mask { align-items: flex-end; padding: 0; }
  .check-panel {
    width: 100%;
    max-height: 82vh;
    border-radius: 16px 16px 0 0;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
  }
}

/* 对方还没准备好时的灰文案（不是按钮，点了没反应） */
.thinking-wait { font-size: 11.5px; color: var(--sub); margin-left: 10px; }
/* ---------- 发言框：单独一条边框（深色/纸感皮肤下也不再和卡片糊在一起） ----------
 * 1.5px 实线 var(--line)；focus 变主色 + 1px 外发光；圆角 10px。
 * 三套皮肤都靠 --line/--blue/--card 这三个变量，换皮肤自动跟着变。 */
.composer textarea {
  width: 100%;
  /* !important：皮肤样式（themes.css）和 debate.css 都会给 textarea 设背景/边框，
     这里必须是最终生效的那一条，否则深色皮肤下输入区又和卡片糊在一起 */
  border: 1.5px solid var(--line) !important;
  border-radius: 10px !important;
  background: var(--card) !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.composer textarea:focus {
  outline: none;
  border-color: var(--blue) !important;
  box-shadow: 0 0 0 1px var(--blue);
}
.composer textarea:disabled { opacity: 0.8; }
/* ---------- B 方气泡：预留最终宽度，左边缘定住 ----------
 * ghost 是全文（visibility:hidden），先把气泡撑到最终宽度；
 * 可见前缀绝对定位覆盖在上面。于是可见部分从左往右长，
 * 气泡宽度（进而左边缘）在整个出字过程中不变。
 * 只对 B 方生效；A 方不渲染 ghost，行为与之前一致。 */
.bub-in {
  position: relative;
  display: inline-block;
  max-width: 100%;
  vertical-align: top;
}
.bub-ghost {
  display: block;
  visibility: hidden;
  user-select: none;
  pointer-events: none;
  white-space: pre-wrap;
}
.bub-live {
  position: absolute;
  inset: 0;
  white-space: pre-wrap;
}
@media (max-width: 520px) {
  /* 375px：预留宽度不能把气泡撑出视口 */
  .bub { max-width: 100%; overflow-wrap: anywhere; }
  .bub-in { max-width: 100%; }
}

/* ==================== 对局页 · 移动端（≤860px） ====================
 * 头部压成一行、席位条横滑 chips、聊天占满、输入区吸在底部、右侧栏收进抽屉。
 * 全部走 var(--*)，换皮肤跟着变。
 */
.composer-pills,
.composer-tools { display: none; }
.sheet-mask { display: none; }
/* 「材料」浮动按钮：桌面右下角；手机上收进输入区工具栏，别再盖住「结束发言」 */
.brief-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 70;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
}
@media (max-width: 860px) {
  .brief-fab { display: none !important; }
}

/* ---------- 本场结束卡片 + 结束后的输入区灰态 ---------- */
.finish-card {
  border-color: var(--blue);
  background: var(--blue-w);
  margin-bottom: 12px;
}
.fin-top { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
.fin-main { min-width: 0; flex: 1; }
.fin-title { font-size: 15px; color: var(--ink); }
.fin-sub {
  font-size: 12.5px; color: var(--sub); margin-top: 2px;
  overflow-wrap: anywhere;
}
.fin-score { flex: 0 0 auto; text-align: right; }
.fin-score b { font-size: 28px; font-weight: 800; color: var(--blue); letter-spacing: -1px; }
.fin-score small { font-size: 12px; color: var(--sub); margin-left: 2px; }
.fin-meta {
  display: flex; gap: 10px 14px; flex-wrap: wrap;
  margin-top: 8px; font-size: 12px; color: var(--sub);
}
.fin-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.fin-tip { margin-top: 8px; font-size: 11.5px; color: var(--sub); }

/* 结束后：输入区置灰、不可编辑（对话仍可往上翻）。
 * 注意**不要**给整个 .composer 设 opacity —— 它是吸底的，半透明会把后面的气泡透出来，
 * 看起来像「输入区和聊天叠在一起」。改成只灰化输入框与按钮。 */
.composer.is-finished { background: var(--card); }
.composer.is-finished textarea {
  background: var(--bg) !important;
  color: var(--sub) !important;
  border-color: var(--line) !important;
  cursor: not-allowed;
}
.composer.is-finished .btn,
.composer.is-finished .tool,
.composer.is-finished .pill { opacity: 0.55; }

@media (max-width: 860px) {
  /* ---- 头部 ---- */
  .mv-head { align-items: flex-start; gap: 8px; margin-bottom: 8px !important; }
  .mv-head-main { min-width: 0; flex: 1; }
  .mv-title {
    font-size: 17px !important;
    line-height: 1.4;
    margin: 0 !important;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .mv-sub {
    font-size: 11.5px !important;
    color: var(--sub);
    margin-top: 2px !important;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .mv-head-acts { gap: 6px; flex-shrink: 0; }
  .mv-head-acts .tag { display: none; }
  .mv-exit { width: 44px; min-height: 44px; padding: 0; }
  .mv-exit-t { display: none; }
  .mv-exit-i { font-size: 16px; color: var(--sub); }

  /* ---- 席位条：横向 chips + 两侧渐隐 ---- */
  .strip {
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
    border-radius: 14px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%);
  }
  .strip::-webkit-scrollbar { display: none; }
  .strip .sp {
    scroll-snap-align: start;
    border-radius: 12px;
    padding: 6px 10px;
    min-height: 44px;
  }
  .strip .sp.cur { border-color: var(--blue); box-shadow: none; }
  .strip .sp.aux { min-height: 44px; }

  /* ---- 两栏 → 单栏：右侧栏收进抽屉 ---- */
  .stage { display: block !important; }
  .right-col { display: none !important; }

  /* ---- 聊天区：占满剩余高度 ---- */
  .chat {
    height: calc(100dvh - 52px - 68px - 44px - 180px);
    min-height: 220px;
    max-height: none;
    border-radius: 14px;
    padding: 10px 10px 6px;
  }
  .msg .bd { max-width: 88%; }
  .msg .bub { max-width: 88vw; }

  /* ---- 输入区：吸在底部（对局页没有 tabbar，贴 safe-area） ---- */
  .composer {
    position: sticky;
    bottom: 0;
    z-index: 45;
    margin-top: 8px;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -6px 20px rgba(26, 29, 36, 0.08);
    background: var(--card);
  }
  .composer .hint { font-size: 12px; }

  /* 小工具栏：语音 / 催一下（收在输入框上方） */
  .composer-tools {
    display: flex;
    gap: 8px;
    margin: 8px 0 4px;
    flex-wrap: wrap;
  }
  .tool {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--sub);
    font-size: 12.5px;
  }
  .tool:disabled { opacity: 0.5; }

  /* 底部胶囊：进度 / 辅助 / 本场（≥44px 触控） */
  .composer-pills { display: flex; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  .pill {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--sub);
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pill.on { border-color: var(--org); color: var(--org); }

  /* 输入框与按钮 */
  .composer textarea { min-height: 76px; font-size: 14px; line-height: 1.7; }
  .composer-acts { gap: 8px; flex-wrap: nowrap; }
  .composer-acts .tools-d { display: none !important; }
  .composer-acts .act-send,
  .composer-acts .act-end {
    flex: 1 1 0; min-width: 0; min-height: 44px; margin-left: 0 !important; font-size: 14px;
  }

  /* ---- 底部抽屉 ---- */
  .sheet-mask {
    display: block;
    position: fixed; inset: 0; z-index: 80;
    background: rgba(20, 22, 28, 0.42);
  }
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0;
    max-height: 72dvh;
    background: var(--card);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--line);
    padding: 8px 14px calc(16px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column;
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.18);
  }
  .sheet-grip {
    width: 38px; height: 4px; border-radius: 2px;
    background: var(--line);
    margin: 2px auto 8px;
  }
  .sheet-hd {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .sheet-hd b { font-size: 15px; color: var(--ink); }
  .sheet-x {
    width: 44px; height: 44px; border-radius: 12px;
    color: var(--sub); font-size: 15px;
  }
  .sheet-bd { overflow-y: auto; -webkit-overflow-scrolling: touch; min-height: 0; }
}


/* ---------- 席位条最右的「辅 AI」 ---------- */
.sp.aux {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: #fff;
  border-style: dashed;
  text-align: left;
}
.sp.aux:hover,
.sp.aux.on { border-color: #9db4f5; background: #f4f7ff; }
.sp.aux .aux-av { background: #6b7280; }

/* ---------- 辅助库面板 ---------- */
.assist-card { min-width: 0; }
.assist-meta { font-size: 11.5px; color: #8a909c; margin-bottom: 8px; }
.assist-group { margin-bottom: 10px; }
.assist-kind {
  font-size: 11px;
  font-weight: 700;
  color: #8a909c;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.assist-hint {
  display: block;
  width: 100%;
  text-align: left;
  font: inherit;
  background: #fff;
  border: 1px solid #efede6;
  border-radius: 8px;
  padding: 7px 9px;
  margin-bottom: 6px;
  cursor: pointer;
}
.assist-hint:hover { border-color: #9db4f5; background: #f8faff; }
.assist-tx { display: block; font-size: 11.5px; line-height: 1.6; color: #1a1d24; }
.assist-basis { display: block; font-size: 10.5px; color: #a8adb8; margin-top: 3px; }
.assist-src {
  border: 1px solid #efede6;
  border-radius: 8px;
  padding: 7px 9px;
  margin-bottom: 6px;
  font-size: 11.5px;
  color: #4a5568;
}
.assist-src-t { margin-right: 6px; }
.assist-src-n { font-size: 10.5px; color: #a8adb8; margin-top: 3px; }
.assist-err { font-size: 12.5px; color: #c0392b; padding: 10px 0; }
.assist-err-d { font-size: 11.5px; color: #a8adb8; margin-top: 4px; overflow-wrap: anywhere; }
.assist-sk i {
  display: block;
  height: 12px;
  border-radius: 6px;
  background: #f1efe9;
  margin-bottom: 8px;
  animation: assistPulse 1.2s ease-in-out infinite;
}
.assist-sk i:nth-child(2) { width: 80%; }
.assist-sk i:nth-child(3) { width: 60%; }
@keyframes assistPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
/* 分段发言（发送 = 攒一段，结束发言 = 一次提交）——只作用于本页，不动 debate.css */
.segs {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfcfe;
  padding: 8px 10px 10px;
  margin-bottom: 8px;
}
.segs-hd {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: #8a909c;
  margin-bottom: 6px;
}
.segs-hd b { font-size: 12.5px; color: #1a1d24; }
.seg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 9px;
  margin-bottom: 6px;
  min-width: 0;
}
.seg:last-child { margin-bottom: 0; }
.seg-no {
  flex: 0 0 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--blue-w);
  color: var(--blue);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.seg-tx {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: #4a5568;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.seg-del {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  line-height: 1;
  border-radius: 6px;
  color: #a8adb8;
  font-size: 15px;
}
.seg-del:hover { background: var(--red-w); color: var(--red); }
@media (max-width: 520px) {
  .seg-tx { font-size: 12px; }
}
</style>
