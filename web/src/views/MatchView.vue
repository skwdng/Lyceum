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

// 对局结束 → 自动去复盘
watch(
  () => (debate.match && debate.match.status) || '',
  (st) => {
    // 带 ?match= ：复盘页刷新/分享也不丢对局（旧版只放内存，一刷新就没了）
    if (st && st !== 'RUNNING') router.replace({ name: 'review', query: { match: debate.matchId } });
  }
);

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

/**
 * 结束发言：把全部分段（没有分段就用输入框内容）按空行拼起来一次性提交。
 * · 只有轮到我时可用；
 * · 成功 / duplicate 都会清空分段与输入框（用户报的 bug：之前只在 ok 时清）；
 * · 真失败（网络断、离线兜底）保留内容，提示再点一次。
 */
async function endSpeech() {
  if (!debate.waiting) return toast('还没轮到你——写好的内容会留着，轮到你就能发');
  const text = speechText.value;
  if (!text) return toast('说点什么再发');
  if (totalLen.value > MAX_DRAFT) toast('超过 ' + MAX_DRAFT + ' 字，已截断到上限');
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
    <div class="row" style="justify-content: space-between; margin-bottom: 10px">
      <div>
        <h1 class="pg">{{ m.topic_title }}</h1>
        <p class="sub" style="margin: 0">
          {{ m.mode === 'SPRINT' ? '快速' : '标准' }} {{ debate.totalSteps || '—' }} 步 · 你占 {{ m.my_seats }} ·
          <span class="dot"></span>{{ m.status === 'RUNNING' ? '进行中' : m.status }}
        </p>
      </div>
      <div class="row">
        <span class="tag mono">第 {{ debate.stepNo }} 步</span>
        <button class="btn sm ghost" @click="exitMatch">退出</button>
      </div>
    </div>

    <!-- 材料浮窗入口 -->
    <button
      v-if="m.topic_id"
      class="btn sm ghost"
      style="position: fixed; right: 22px; bottom: 22px; z-index: 70; box-shadow: 0 6px 18px rgba(0,0,0,.14)"
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

    <!-- 席位条 -->
    <div class="strip">
      <div v-for="s in debate.stripSeats" :key="s.k" class="sp" :class="{ me: s.me, cur: s.cur }">
        <div class="av" :class="s.side.toLowerCase()">{{ s.me ? '我' : 'AI' }}</div>
        <div>
          <div class="nm">{{ s.me ? '你' : 'AI' }}</div>
          <div class="rl">{{ s.side === 'A' ? '正方' : '反方' }}{{ s.role }}</div>
        </div>
      </div>
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
                  <template v-else>{{ dedupeBubble(t.text.slice(0, t.shown)) }}</template><span v-if="t.stream" class="caret">▍</span>
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

        <!-- 抢拍 -->
        <div
          v-if="debate.phase === 'BUZZ'"
          class="card"
          style="margin-top: 12px; border-color: #2f5bea; background: #f2f5ff; text-align: center"
        >
          <div style="font-size: 13px; font-weight: 600; color: #2f5bea">自由辩 · 抢话中</div>
          <div style="font-size: 11.5px; color: #6b7280; margin: 4px 0 10px">
            谁说都行，抢到话筒就归你。窗口 {{ Math.max(0, debate.remaining) }} 秒
          </div>
          <button class="btn primary" style="width: 100%; padding: 12px; font-size: 15px" @click="debate.buzz()">
            抢 ！
          </button>
        </div>

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
        <div class="composer">
          <div class="hint">
            <span>{{ debate.waiting ? '轮到你发言' : '等待对方发言…' }}</span>
            <span :style="{ fontFamily: 'ui-monospace,monospace', color: cdColor, fontWeight: debate.remaining <= 30 && !debate.unlimited ? 700 : 400 }">
              {{ cdText }}
            </span>
          </div>

          <!-- 对方回合：只占一行提示，不挡输入框（你可以在对方说话时先写好） -->
          <div v-if="!debate.waiting" class="waiting">
            <span>{{ debate.hasTyping() ? '对方正在说话…' : '对方正在思考…' }}</span>
            <button
              v-if="debate.kind === 'solo'"
              class="btn sm ghost"
              style="margin-left: 10px"
              :disabled="debate.skipBusy || !debate.canSkip()"
              :title="debate.canSkip() ? '让对方立刻开口，或立刻显示全文' : '这一轮已经催过了，等下一步'"
              @click="debate.nudge()"
            >{{ debate.skipBusy ? '催中…' : (debate.hasTyping() ? '直接显示全文' : '催一下') }}</button>
          </div>

          <div v-if="debate.waiting && rebutHints.length" class="hints">
            <span class="hint-label">可以从这儿下手</span>
            <span v-for="h in rebutHints" :key="h.k" class="hint-chip" :title="h.v">
              <b>{{ h.k }}</b>{{ h.v }}
            </span>
          </div>

          <div v-if="recOn" class="recbar">正在录音 {{ recSec }}s / 90s · 说完点「停止」，文本可编辑后再发送</div>
          <div v-else-if="recErr" class="recbar err">{{ recErr }}</div>

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
            :disabled="recOn"
            :placeholder="debate.waiting ? '写下这一段…（回车 = 发言，Shift+回车 = 换行，点「结束发言」结束）' : '对方还在说 —— 先写这一段，轮到你就能结束发言'"
            @input="onType"
            @paste="onPaste"
            @keydown="onComposerKeydown"
          ></textarea>
          <div class="count">
            <span :class="{ warn: totalLen > MAX_DRAFT }">{{ totalLen }} / {{ MAX_DRAFT }} 字</span>
            <span v-if="totalLen > MAX_DRAFT" style="color: #C0392B">超出上限，结束发言时会截断</span>
          </div>

          <div class="row" style="margin-top: 8px">
            <span style="font-size: 11.5px; color: #a8adb8">
              {{ debate.waiting ? (debate.extendUsed ? '已自动续命 ' + debate.extendUsed + ' 次' : '打字时会自动续时') : '先写好，轮到你就能结束发言' }}
            </span>
            <button
              v-if="debate.kind === 'solo'"
              class="btn sm ghost"
              disabled
              style="margin-left: 10px"
              title="轮到你说，没法催"
            >催一下</button>
            <span style="flex: 1"></span>
            <button
              class="btn sm ghost"
              :disabled="!recSupported || !debate.waiting"
              :title="recSupported ? (debate.waiting ? '语音输入（最长 90 秒）' : '轮到你才能录音') : '当前浏览器不支持语音识别'"
              @click="recOn ? stopVoice() : startVoice()"
            >{{ recOn ? '● 录音 ' + recSec + 's' : '🎤 语音' }}</button>
            <button
              class="btn sm ghost"
              style="margin-left: 8px"
              :disabled="!draft.trim()"
              title="把这一段加进本次发言（立刻清空输入框，随时可用）"
              @click="sendSegment"
            >发送</button>
            <button
              class="btn sm primary"
              style="margin-left: 8px"
              :disabled="!canEndSpeech"
              :title="debate.waiting ? '结束发言，一次提交本次所有分段（Ctrl+Enter）' : '还没轮到你，先攒着，轮到你就能结束发言'"
              @click="endSpeech"
            >{{ debate.waiting ? '结束发言' : '等我回合' }}</button>
          </div>
        </div>
      </div>

      <!-- 右侧 -->
      <div>
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

        <div class="card" style="margin-top: 12px">
          <div class="row" style="justify-content: space-between">
            <b style="font-size: 12.5px">论据卡</b>
            <span class="tag">{{ (debate.cards || []).length }} 张</span>
          </div>
          <div style="font-size: 11.5px; color: #8a909c; margin: 6px 0 8px">
            点一下插入到发言框。标「需核实」的自己查证过再用。
          </div>
          <div style="max-height: 230px; overflow: auto">
            <div
              v-for="(c, i) in debate.cards || []"
              :key="i"
              style="border: 1px solid #efede6; border-radius: 8px; padding: 7px 9px; margin-bottom: 6px; cursor: pointer"
              @click="insertCard(c)"
            >
              <div style="font-size: 11.5px; line-height: 1.6">{{ c.claim }}</div>
              <div style="font-size: 10.5px; color: #a8adb8; margin-top: 3px">
                {{ c.source }} {{ c.year || '' }}
                <span v-if="c.verified" class="tag g" style="font-size: 9.5px">已核实</span>
                <span v-else class="tag o" style="font-size: 9.5px">需核实</span>
              </div>
            </div>
            <div v-if="!(debate.cards || []).length" class="empty">这道题暂无论据卡</div>
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
  </template>
</template>

<style scoped>
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
