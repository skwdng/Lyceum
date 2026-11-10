<script setup>
/**
 * 复盘（等价旧 review.js）：三维/五维分数、席位拆分、逐回合点评、证据、AI 评审团、本场费用。
 *
 * 「本场费用」直接用批 1 抽好的 `<BillStrip>`（旧版是 wallet.js 的 billHTML），
 * 避免两处金额口径不一致。
 */
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebateStore } from '../stores/debate.js';
import { useAuthStore } from '../stores/auth.js';
import BillStrip from '../components/BillStrip.vue';

const route = useRoute();
const router = useRouter();
const debate = useDebateStore();
const auth = useAuthStore();

const r = computed(() => (debate.review && debate.review.score) || null);
const seatScores = computed(() => (debate.review && debate.review.seatScores) || {});
const seatKeys = computed(() => Object.keys(seatScores.value));
const match = computed(() => debate.match || {});
const billTokens = computed(() => (debate.review && debate.review.billTokens) || 0);
/** 本场 AI 档位（BASIC/PRO/BYOK）：自带 Key 与基础版都免费，账单里要显示成「免费」 */
const billTier = computed(() => (debate.match && debate.match.tier) || '');
/**
 * 付款人：多人房整场费用记在房主名下（后端 payer_user_id）。
 * 和自己不是同一个人时显示「房主」——注意要和**当前登录用户**比，不能拿 user_id 比，
 * 因为房间开局时后端把 user_id 也写成了房主，两者恒等，那样永远显示不出来。
 */
const billPayer = computed(() => {
  const payer = (debate.match && debate.match.payer_user_id) || '';
  const me = (auth.user && auth.user.id) || '';
  if (!payer || !me || String(payer) === String(me)) return '';
  return '房主';
});

const DIMS = [
  ['立论', 'matter', '25%'],
  ['论证', 'method', '30%'],
  ['表达', 'manner', '15%'],
  ['应变', 'adapt', '20%'],
  ['论据', 'evidence', '10%']
];

const PANEL_COLORS = { 结构裁判: '#3A63FF', 交锋裁判: '#C0392B', 表达裁判: '#0E9F6E', 论据裁判: '#C2671E' };

const panelJudges = computed(() => {
  const p = debate.panel;
  if (!p || p.failed) return [];
  return (p.judges || []).filter((j) => !j.failed);
});

onMounted(async () => {
  // 支持深链 #/review?match=<id>：刷新/从别处进来时内存里没有 matchId，
  // 旧版只把它放内存里，一刷新复盘就没了。
  // 对局 id 是字符串（形如 m9324a4c326），**不能** Number() —— 转成 NaN 就再也取不到复盘了
  if (!debate.matchId && route.query.match) debate.matchId = String(route.query.match);
  if (!debate.review) await debate.loadReview();
  if (!debate.match && debate.matchId) {
    // 复盘页也要 topic_title / my_seats，但不需要轮询
    try {
      const d = await (await import('../api.js')).debateApi.match(debate.matchId);
      debate.match = d.match;
    } catch (e) {
      /* 拿不到就用空壳渲染 */
    }
  }
});

function verdictClass(v) {
  return v === '有交锋' ? 'g' : v === '脱靶' ? 'o' : 'r';
}
</script>

<template>
  <div v-if="!r" class="card"><div class="empty">没有复盘数据</div></div>

  <template v-else>
    <h1 class="pg">本场复盘</h1>
    <p class="sub">
      {{ match.topic_title || '' }} · 你占 {{ match.my_seats || '' }} · 发言 {{ r.turns }} 次{{ r.timeout ? ' · 超时 ' + r.timeout + ' 次' : '' }}
    </p>

    <div class="card">
      <div class="row" style="align-items: flex-end; gap: 30px; flex-wrap: wrap">
        <div>
          <div class="big">{{ r.total }}<small>分</small></div>
          <div style="font-size: 12px; color: #8a909c; margin-top: 4px">三维加权 · 已写入记录</div>
        </div>
        <div style="flex: 1; min-width: 240px">
          <div v-for="d in DIMS" :key="d[1]" class="dim">
            <span class="lb" :title="'权重 ' + d[2]">{{ d[0] }}</span>
            <div class="dbar"><i :style="{ width: r[d[1]] + '%' }"></i></div>
            <b>{{ r[d[1]] }}</b>
          </div>
          <div v-if="r.collab" class="dim">
            <span class="lb">协同</span>
            <div class="dbar"><i :style="{ width: r.collab * 8 + '%', background: '#0E9F6E' }"></i></div>
            <b>+{{ r.collab }}</b>
          </div>
        </div>
      </div>

      <!-- 多席位拆分 -->
      <div v-if="seatKeys.length > 1" style="margin-top: 14px">
        <b style="font-size: 12.5px">按席位看</b>
        <span style="font-size: 11.5px; color: #8a909c; margin-left: 6px">
          你占了 {{ seatKeys.length }} 个位置，分开算
        </span>
        <div v-for="k in seatKeys" :key="k" class="card" style="margin-top: 8px; padding: 10px 12px">
          <div class="row" style="justify-content: space-between; align-items: center">
            <b style="font-size: 12.5px">{{ k }} 席位</b>
            <span style="font-size: 13px"><b>{{ seatScores[k].total }}</b> 分 · 发言 {{ seatScores[k].turns }} 次</span>
          </div>
          <div class="row" style="gap: 14px; margin-top: 6px; font-size: 11.5px; color: #6b7280; flex-wrap: wrap">
            <span>立论 {{ seatScores[k].matter }}</span>
            <span>论证 {{ seatScores[k].method }}</span>
            <span>表达 {{ seatScores[k].manner }}</span>
            <span>应变 {{ seatScores[k].adapt }}</span>
            <span>论据 {{ seatScores[k].evidence }}</span>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(r.flaws || {}).length" class="row" style="gap: 8px; margin-top: 10px; flex-wrap: wrap">
        <span style="font-size: 12.5px; color: #6b7280">本场检出：</span>
        <span v-for="([k, v]) in Object.entries(r.flaws)" :key="k" class="tag o">{{ k }} × {{ v }}</span>
      </div>

      <div v-if="r.flawTries" class="row" style="gap: 8px; margin-top: 10px">
        <span style="font-size: 12.5px; color: #6b7280">抓漏：</span>
        <b :style="{ color: r.flawHits > 0 ? '#0E9F6E' : '#C0392B' }">{{ r.flawHits }}/{{ r.flawTries }}</b>
        <span style="font-size: 11.5px; color: #8a909c">对方故意埋的逻辑漏洞，你抓对了几处</span>
      </div>

      <!-- 逐回合点评 -->
      <div v-if="(r.perTurn || []).length" style="margin-top: 14px">
        <b style="font-size: 12.5px">逐回合点评</b>
        <table class="t" style="margin-top: 6px">
          <thead>
            <tr>
              <th style="width: 46px">步</th>
              <th style="width: 64px">环节</th>
              <th style="width: 56px">字数</th>
              <th style="width: 64px">判定</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in r.perTurn || []" :key="i">
              <td class="mono">{{ p.step }}</td>
              <td>{{ p.seg }}</td>
              <td class="mono">{{ p.chars }}</td>
              <td><span class="tag" :class="verdictClass(p.verdict)">{{ p.verdict }}</span></td>
              <td style="font-size: 12px; color: #4a5568">{{ p.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 证据 -->
      <div class="ev">
        <div class="k">证据（你的原句）</div>
        <div>{{ r.quote || '（本轮未发言）' }}</div>
        <div class="row" style="gap: 20px; margin-top: 10px; font-size: 12.5px">
          <div>引用论据：<b :style="{ color: r.cited > 0 ? '#0E9F6E' : '#C0392B' }">{{ r.cited }} 条</b></div>
          <div>
            编造数字：<b :style="{ color: (r.fabricated || []).length ? '#C0392B' : '#0E9F6E' }">
              {{ (r.fabricated || []).length }} 处
            </b>
            <span v-if="(r.fabricated || []).length" style="color: #c0392b">（{{ (r.fabricated || []).join('、') }}）</span>
          </div>
        </div>
        <div class="k" style="margin-top: 10px">问题</div>
        <div style="color: #c0392b">{{ r.problem }}</div>
        <div class="k" style="margin-top: 10px">改成这样</div>
        <div style="color: #0e9f6e">{{ r.improve }}</div>
      </div>

      <!-- AI 评审团 -->
      <div class="card" style="margin-top: 14px; border-color: #dce3f5; background: #fbfcfe">
        <div class="row" style="justify-content: space-between; align-items: center">
          <div>
            <b style="font-size: 13.5px">AI 评审团</b>
            <span style="font-size: 11.5px; color: #8a909c; margin-left: 8px">4 位裁判独立打分 · 取平均</span>
          </div>
          <div>
            <span v-if="debate.panelBusy" style="font-size: 12px; color: #a8adb8">评审中…</span>
            <button v-else class="btn sm ghost" @click="debate.runPanel()">
              {{ debate.panel ? '重新评一次' : '让裁判点评' }}
            </button>
          </div>
        </div>
        <div style="font-size: 11.5px; color: #a8adb8; margin-top: 6px">
          结构 / 交锋 / 表达 / 论据 四个视角各评一次，找出「多位裁判都提到」的问题——那才是真问题。约 5–8 秒，一次约 0.02 元。
        </div>

        <div v-if="debate.panelBusy" class="empty" style="padding: 16px 0">四位裁判正在看你的发言…</div>
        <div v-else-if="debate.panel && debate.panel.failed" class="empty" style="padding: 14px 0">
          {{ debate.panel.reason }}
        </div>
        <template v-else-if="debate.panel">
          <div style="display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin-top: 14px">
            <div>
              <div class="big" style="font-size: 38px">{{ debate.panel.average }}<small>分</small></div>
              <div style="font-size: 11.5px; color: #8a909c">
                裁判平均 · 区间 {{ debate.panel.min }}–{{ debate.panel.max }}
              </div>
            </div>
            <div style="flex: 1; min-width: 220px">
              <div v-for="j in panelJudges" :key="j.name" class="dim">
                <span class="lb" :title="j.lens || ''">{{ j.name }}</span>
                <div class="dbar">
                  <i :style="{ width: j.score + '%', background: PANEL_COLORS[j.name] || '#3A63FF' }"></i>
                </div>
                <b>{{ j.score }}</b>
              </div>
            </div>
          </div>
          <div style="font-size: 12.5px; color: #4a5568; margin-top: 8px">
            {{ debate.panel.summary }}
            <b v-if="debate.panel.max - debate.panel.min >= 20" style="color: #c2671e">（分歧大 = 有争议点，见下）</b>
          </div>

          <div v-if="(debate.panel.consensus || []).length" style="margin-top: 14px">
            <b style="font-size: 12.5px; color: #c0392b">多位裁判都提到的问题</b>
            <div
              v-for="(c, i) in debate.panel.consensus"
              :key="i"
              style="background: #fff; border: 1px solid #edeff5; border-radius: 10px; padding: 10px 12px; margin-top: 8px"
            >
              <div style="font-size: 11.5px; color: #8a909c">{{ c.category }} · {{ c.agreed }}</div>
              <div v-if="c.quote" style="font-size: 12.5px; color: #4a5568; margin: 3px 0">你写的「{{ c.quote }}」</div>
              <div style="font-size: 12.5px; color: #c0392b">{{ c.why }}</div>
              <div style="font-size: 12.5px; color: #0e9f6e; margin-top: 4px">改成：{{ c.fix }}</div>
            </div>
          </div>

          <div style="margin-top: 14px">
            <b style="font-size: 12.5px">各裁判的加/扣分点</b>
            <div
              v-for="j in panelJudges"
              :key="j.name"
              style="background: #fff; border: 1px solid #edeff5; border-radius: 10px; padding: 10px 12px; margin-top: 8px"
            >
              <div class="row" style="justify-content: space-between">
                <b style="font-size: 12.5px" :style="{ color: PANEL_COLORS[j.name] || '#3A63FF' }">{{ j.name }}</b>
                <span style="font-size: 12px; color: #8a909c">{{ j.score }} 分 · {{ j.lens }}</span>
              </div>
              <div v-if="(j.scoringPoints || []).length" style="margin-top: 6px">
                <div v-for="(s, i) in j.scoringPoints" :key="i" style="font-size: 12px; color: #0e9f6e">＋ {{ s }}</div>
              </div>
              <div v-for="(w, i) in (j.weaknesses || []).slice(0, 2)" :key="'w' + i" style="margin-top: 6px; font-size: 12px; color: #4a5568">
                － {{ w.why }}
                <span style="color: #0e9f6e">（{{ (w.fix || '').slice(0, 40) }}）</span>
              </div>
              <div v-if="j.comment" style="font-size: 11.5px; color: #a8adb8; margin-top: 6px">{{ j.comment }}</div>
            </div>
          </div>
        </template>
      </div>

      <!-- 本场费用（复用批 1 的 BillStrip）：带上档位与付款人，自带 Key / 基础版会显示「免费」 -->
      <BillStrip :bill-tokens="billTokens" :tier="billTier" :payer="billPayer" />

      <div class="row" style="margin-top: 16px">
        <button class="btn primary" @click="router.push({ name: 'solo' })">再来一场</button>
        <button class="btn ghost" @click="router.push({ name: 'diag' })">看能力画像</button>
        <button class="btn ghost" @click="router.push({ name: 'records' })">辩论记录</button>
      </div>
    </div>
  </template>
</template>
