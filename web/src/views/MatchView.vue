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
import { useDebateStore, SEAT_OF, SEG_OF } from '../stores/debate.js';
import { useAuthStore } from '../stores/auth.js';
import { toast } from '../utils/toast.js';

const route = useRoute();
const router = useRouter();
const debate = useDebateStore();
const auth = useAuthStore();

const draft = ref('');
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
const activeSeat = computed(() => SEAT_OF[debate.stepNo] || '');

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
  if (!debate.matchId && route.query.match) debate.matchId = String(route.query.match);
  // 直接刷新/从别处进来：matchId 可能不在内存里
  if (!debate.matchId) {
    router.replace({ name: 'solo' });
    return;
  }
  if (!debate.match) await debate.load(true);
  debate.startPoll();
  debate.startClock();
  debate.startTyping();
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

async function submit() {
  const text = draft.value;
  if (!String(text || '').trim()) return toast('说点什么再发');
  // 先发请求，成功才清空（失败时把用户打的字原样留着）
  const ok = await debate.submitTurn(text);
  if (ok) draft.value = '';
  await nextTick();
  scrollBottom();
}

function onType() {
  debate.keepalive();
}

/** 点论据卡插入到发言框（没轮到我时只提示，不偷偷塞进别的会话） */
function insertCard(c) {
  if (!debate.waiting) return toast('还没轮到你发言，先把卡片记下来');
  const text = c.claim + '（据' + c.source + '）';
  draft.value = (draft.value.trim() ? draft.value.trim() + ' ' : '') + text + '。';
  toast(c.verified ? '已插入（可信来源）' : '已插入，注意这条标了「需核实」');
}

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
          {{ m.mode === 'SPRINT' ? '快速 8 步' : '标准版 12 步' }} · 你占 {{ m.my_seats }} ·
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
                </div>
                <div class="bub">
                  <span v-if="t.typing && !t.shown" class="pending">…</span>
                  <template v-else>{{ t.typing ? t.text.slice(0, t.shown) : t.text }}</template>
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
          v-if="debate.flawOffer"
          class="card"
          style="margin-top: 12px; border-color: #e3c08a; background: #fff9f0"
        >
          <div class="row" style="justify-content: space-between">
            <b style="font-size: 12.5px">这一轮对方发言有逻辑问题 —— 你抓到了吗？</b>
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

          <template v-if="debate.waiting">
            <textarea v-model="draft" placeholder="写下你的发言…" @input="onType"></textarea>
            <div class="row" style="margin-top: 8px">
              <span style="font-size: 11.5px; color: #a8adb8">
                {{ debate.extendUsed ? '已自动续命 ' + debate.extendUsed + ' 次' : '打字时会自动续时' }}
              </span>
              <span style="flex: 1"></span>
              <button class="btn sm primary" @click="submit">发送</button>
            </div>
          </template>
          <div v-else class="waiting">
            对方正在思考…
            <button
              v-if="debate.kind === 'solo' && debate.canSkip()"
              class="btn sm ghost"
              style="margin-left: 10px"
              :disabled="debate.skipBusy"
              @click="debate.skipAi()"
            >
              {{ debate.skipBusy ? '催中…' : '催一下' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧 -->
      <div>
        <div class="card">
          <div class="row" style="justify-content: space-between; margin-bottom: 8px">
            <b style="font-size: 12.5px">赛制进度</b>
            <span style="font-size: 11.5px; color: #8a909c">{{ debate.stepNo }}/{{ debate.steps.length }}</span>
          </div>
          <div class="steps">
            <div
              v-for="(n, i) in debate.steps"
              :key="n"
              class="st"
              :class="{ done: i + 1 < debate.stepNo, cur: i + 1 === debate.stepNo }"
            >
              <span class="no">{{ i + 1 }}</span>
              <span>{{ SEG_OF[n] }} · {{ SEAT_OF[n] }}{{ debate.mySeats.includes(SEAT_OF[n]) ? ' · 你' : '' }}</span>
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
