<script setup>
/**
 * 离线对练（纯前端，不联网、不调模型）。
 *
 * 和在线对局的差别要讲清楚：
 * · 只给**规则化教练提示**（字数、有无数据、有无因果、是否接住对方原话、有没有问句）；
 * · 对手回应是模板池 + 本轮去重，保证"像在对话"但**不计分**；
 * · 页面明确写：离线模板不计入正式评分，要真对练回在线模式。
 */
import { ref, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const SEGS = ['立论', '驳立论', '质询', '自由辩', '总结'];
const segIdx = ref(0);
const draft = ref('');
const log = ref([]);           // [{who:'me'|'opp'|'coach', seg, text}]
const used = ref({});          // 每个环节已用过的模板下标，防重复
const chatEl = ref(null);

/** 模板池：按环节分，表达风格偏"对手"而不是"助手" */
const POOL = {
  立论: [
    '先定标准：这件事要看结果是否可核，而不是看动机是否善良。你方连标准都没给，后面很难判。',
    '我方判断很直接：现状的代价被低估了。你要推翻，得先说明代价由谁承担。',
    '把定义钉死：你讲的「合理」是程序合理还是结果合理？两者结论完全不同。'
  ],
  驳立论: [
    '你反驳的是我的措辞，不是我的判断。我方判断只有一句：可行性优先，你还没碰这句。',
    '你说我忽略了个体差异，但我方要的是可执行的统一规则；个体差异恰恰要靠规则兜底。',
    '举一个反例就够了：如果按你的逻辑推到底，会出现没人负责的空白区。'
  ],
  质询: [
    '请正面回答：这套方案的复核主体是谁？说不出主体，就等于没有方案。',
    '你刚才说「更公平」，那请给一个可核查口径：用什么指标、谁来测、多久测一次？',
    '如果条件不成立，你的结论还成立吗？成立就说明条件不是必要条件。'
  ],
  自由辩: [
    '回到分歧点：你守的是「应该」，我守的是「可行」，这两个不是一回事。',
    '你一直没回答代价问题。换个问法：出了事，谁签字？',
    '你方论证里有个跳跃：从「个别案例有效」直接推到「普遍适用」，中间缺一步。'
  ],
  总结: [
    '收一下：全场真正的分歧只有一条——标准要不要可核查。我方守住了，你方没有。',
    '你方三次回避同一个问题：复核主体。回避本身就是答案。',
    '结辩只讲一句：评价方式可以改，底线责任不能空。'
  ]
};

const seg = computed(() => SEGS[Math.min(segIdx.value, SEGS.length - 1)]);
const finished = computed(() => segIdx.value >= SEGS.length);

/** 规则化教练提示：只看可观察特征，不做语义理解 */
function coachNote(text) {
  const t = String(text || '');
  const len = t.replace(/\s/g, '').length;
  const tips = [];
  if (len < 30) tips.push('太短了：连一个完整判断都没说完，至少给"判断 + 理由"两句');
  else if (len > 220) tips.push('偏长：一口气两百多字，评委跟不上，砍掉重复修饰');
  if (/\d/.test(t) || /(据|数据显示|报告|研究)/.test(t)) tips.push('有数据/依据 ✓（离线模式不校验真伪）');
  else tips.push('没有论据：至少给一个可核查的事实或出处');
  if (/(因为|所以|因此|导致|从而)/.test(t)) tips.push('有因果链 ✓');
  else tips.push('缺因果：把"我认为"换成"因为…所以…"');
  if (/(虽然|但是|即便|退一步)/.test(t)) tips.push('有让步转折 ✓');
  if (/(对方|你方)/.test(t)) tips.push('回应了对方 ✓');
  else tips.push('没接对方原话：先复述他一句，再打');
  if (seg.value === '质询' && !/[？?]/.test(t)) tips.push('质询环节没有问句：这一轮等于白说');
  if (seg.value === '总结' && !/(分歧|争议点|核心)/.test(t)) tips.push('总结没回到分歧点：结辩要收口');
  return tips.slice(0, 4);
}

function pickReply(s) {
  const pool = POOL[s] || POOL.自由辩;
  const usedIdx = used.value[s] || [];
  const rest = pool.map((_, i) => i).filter((i) => !usedIdx.includes(i));
  const pick = rest.length ? rest[0] : 0;
  used.value[s] = rest.length ? usedIdx.concat([pick]) : [pick];
  return pool[pick];
}

async function send() {
  const text = draft.value.trim();
  if (!text) return;
  const s = seg.value;
  log.value.push({ who: 'me', seg: s, text });
  log.value.push({ who: 'coach', seg: s, text: coachNote(text).join('\n') });
  log.value.push({ who: 'opp', seg: s, text: pickReply(s) });
  draft.value = '';
  segIdx.value += 1;
  await nextTick();
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight;
}

function reset() {
  segIdx.value = 0;
  draft.value = '';
  log.value = [];
  used.value = {};
}

function backOnline() {
  router.push('/solo');
}
</script>

<template>
  <div class="pg-wrap">
    <h1 class="pg">离线对练 <span class="tag o">离线 · 模板</span></h1>
    <p class="sub">
      不联网、不调模型，纯本地模板。用来热身和练结构，<b>不计入正式评分</b>——要真实评分请回单人辩论。
    </p>

    <div class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <b style="font-size:13px">当前环节：{{ finished ? '已打完' : seg }}</b>
        <div style="font-size:11.5px;color:#8A909C;margin-top:3px">
          进度 {{ Math.min(segIdx + 1, SEGS.length) }} / {{ SEGS.length }}
        </div>
      </div>
      <button class="btn ghost sm" @click="reset">重新开始</button>
      <button class="btn ghost sm" @click="backOnline">回在线模式</button>
    </div>

    <div ref="chatEl" class="card" style="margin-top:12px;max-height:52vh;overflow:auto">
      <div v-if="!log.length" class="empty">还没有发言。写下你的第一段立论试试。</div>
      <div v-for="(x, i) in log" :key="i" style="margin:10px 0">
        <div v-if="x.who === 'coach'" style="background:#FBF7EC;border:1px solid #EFE6D2;border-radius:10px;padding:9px 12px">
          <b style="font-size:11.5px;color:#9A7B2E">教练提示</b>
          <div style="font-size:12px;color:#6B5B33;white-space:pre-wrap;margin-top:3px">{{ x.text }}</div>
        </div>
        <div v-else>
          <div style="font-size:11.5px;color:#8A909C;margin-bottom:2px">
            {{ x.who === 'me' ? '你' : '对手（模板）' }} · {{ x.seg }}
          </div>
          <div class="bub" :style="x.who === 'me' ? 'background:#EEF3FF' : ''">{{ x.text }}</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:12px" v-if="!finished">
      <textarea
        v-model="draft"
        placeholder="写下这一轮要说的话…（Ctrl+Enter 提交）"
        style="width:100%;min-height:96px;border:1px solid #E6E3DC;border-radius:10px;padding:10px 12px;font-size:13.5px;background:#FCFBF8"
        @keydown.ctrl.enter="send"
      ></textarea>
      <div class="row" style="justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:11.5px;color:#A8ADB8">{{ draft.length }} 字 · 离线不校验内容真伪</span>
        <button class="btn primary" @click="send">发言并看反馈</button>
      </div>
    </div>

    <div class="card" style="margin-top:12px" v-else>
      <b style="font-size:13px">打完了</b>
      <div style="font-size:12.5px;color:#4A5568;margin-top:6px">
        五轮都走完了。离线模式只练结构；想要评分、抓漏、评审团，请回在线模式。
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" @click="reset">再来一遍</button>
        <button class="btn ghost" @click="backOnline">回在线模式</button>
      </div>
    </div>
  </div>
</template>
