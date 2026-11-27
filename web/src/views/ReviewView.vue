<script setup>
/**
 * 复盘（等价旧 review.js）：三维/五维分数、席位拆分、逐回合点评、证据、AI 评审团、本场费用。
 *
 * 「本场费用」直接用批 1 抽好的 `<BillStrip>`（旧版是 wallet.js 的 billHTML），
 * 避免两处金额口径不一致。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebateStore } from '../stores/debate.js';
import { useAuthStore } from '../stores/auth.js';
import { debateApi } from '../api.js';
import '../assets/tokens.css';   // 设计 tokens（--warn-ink / --accent-weak / --muted-3 …）：新样式只写 var()
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

/** 五维的唯一来源：顺序 / 名称 / 权重都从这里取，口径面板与条形图不会对不上 */
const DIM_META = {
  matter: { name: '立论', weight: 25 },
  method: { name: '论证', weight: 30 },
  manner: { name: '表达', weight: 15 },
  adapt: { name: '应变', weight: 20 },
  evidence: { name: '论据', weight: 10 }
};
const DIM_ORDER = ['matter', 'method', 'manner', 'adapt', 'evidence'];
const DIMS = DIM_ORDER.map((k) => [DIM_META[k].name, k, DIM_META[k].weight + '%']);

/* ==================== 评分口径（后端 rubric） ====================
 *
 * 后端 /api/matches/{id}/review 的 score 上会带：
 *   rubric = { version, dims:[{key,name,weight,score,basis,evidence}], focus:{key,name,score,action,reason} }
 * 这是**灰度字段**：没落地时整段缺失，面板要降级成「现有五维分数」，不能报错、不能白屏。
 * 所有读取都走下面的 normalize：字段类型不对（weight 是字符串、dims 是对象、score 是 null）一律当作缺失。
 */

function asText(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v.trim() : String(v).trim();
}

function asNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 权重可能给 25（百分数）/ 0.25（小数）/ "25%"，统一成 `25%`；拿不到就用本地兜底权重 */
function weightText(v, fallback) {
  let pct = asNum(v);
  if (pct === null && typeof v === 'string' && v.trim().endsWith('%')) pct = asNum(v.trim().slice(0, -1));
  if (pct === null) pct = asNum(fallback);
  if (pct === null) return '—';
  if (pct > 0 && pct <= 1) pct *= 100;
  const rounded = Math.round(pct * 10) / 10;
  return (Number.isInteger(rounded) ? rounded : rounded.toFixed(1)) + '%';
}

function scoreText(v) {
  const n = asNum(v);
  if (n === null) return '—';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** rubric 本体：非对象（null / 数组 / 字符串）一律当没有 */
const rubricRaw = computed(() => {
  const raw = r.value && r.value.rubric;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
});

const rubricVersion = computed(() => asText(rubricRaw.value && rubricRaw.value.version));
/** 后端没给 version 时用当前口径版本兜底（面板标题行常显版本，见设计稿 §9.4） */
const RUBRIC_VERSION_FALLBACK = 'v3-2026-11';
const rubricVersionLabel = computed(() => rubricVersion.value || RUBRIC_VERSION_FALLBACK);

function normDim(d, fallbackKey, synthetic) {
  const src = d && typeof d === 'object' ? d : {};
  const key = asText(src.key) || fallbackKey || '';
  const meta = DIM_META[key] || { name: key || '维度', weight: null };
  const basis = asText(src.basis);
  const evidence = asText(src.evidence);
  const scoreNum = asNum(src.score);
  return {
    key: key || 'dim',
    name: asText(src.name) || meta.name,
    weight: weightText(src.weight, meta.weight),
    score: scoreText(src.score),
    scoreNum,
    low: scoreNum !== null && scoreNum < 60,
    hasBasis: !!basis,
    hasEvidence: !!evidence,
    basis: basis || '本场未命中该判据',
    evidence: evidence || (basis ? '本条判据未附原话证据' : '本场未命中该判据'),
    fromRubric: !synthetic && !!d && typeof d === 'object'
  };
}

/** 面板永远按五维顺序出；rubric 只给了部分维度，其余用现有分数补位（不报错、不消失） */
const rubricRows = computed(() => {
  const raw = rubricRaw.value;
  const list = raw && Array.isArray(raw.dims) ? raw.dims.filter((d) => d && typeof d === 'object') : [];
  const byKey = new Map();
  const extra = [];
  list.forEach((d) => {
    const k = asText(d.key);
    if (DIM_META[k] && !byKey.has(k)) byKey.set(k, d);
    else extra.push(d);
  });
  const rows = DIM_ORDER.map((k) => {
    const hit = byKey.get(k);
    if (hit) return normDim(hit, k);
    return normDim({ key: k, name: DIM_META[k].name, weight: DIM_META[k].weight, score: r.value ? r.value[k] : null }, k, true);
  });
  extra.forEach((d, i) => rows.push(normDim(d, 'extra' + i)));
  return rows;
});

/** 后端到底给没给明细：决定面板顶部那句降级提示 */
const hasRubricDims = computed(() => {
  const raw = rubricRaw.value;
  return !!(raw && Array.isArray(raw.dims) && raw.dims.some((d) => d && typeof d === 'object'));
});

/** 权重合计：本地兜底权重也是 100%，所以两种情况下都是 100%（设计稿要求标题行常显） */
const rubricWeightSum = computed(() => {
  const sum = rubricRows.value.reduce((acc, d) => {
    const n = asNum(String(d.weight).replace('%', ''));
    return acc + (n === null ? 0 : n);
  }, 0);
  return Math.round(sum * 10) / 10;
});

/** 顶部「本场最该改的一件事」：没有 focus / focus 全空 → 整块不渲染 */
const focusCard = computed(() => {
  const f = rubricRaw.value && rubricRaw.value.focus;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const action = asText(f.action);
  const reason = asText(f.reason);
  if (!action && !reason) return null;
  const key = asText(f.key);
  const score = asNum(f.score);
  const row = rubricRows.value.find((d) => d.key === key);
  return {
    name: asText(f.name) || (DIM_META[key] ? DIM_META[key].name : ''),
    score: score === null ? '' : scoreText(f.score),
    weight: row ? row.weight : '',
    action: action || reason,
    reason: action ? reason : ''
  };
});

/** 口径面板折叠：自己管状态（button + aria-expanded，键盘可达） */
const rubricOpen = ref(false);
function toggleRubric() {
  rubricOpen.value = !rubricOpen.value;
}

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
      const d = await debateApi.match(debate.matchId);
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

    <!-- 本场最该改的一件事：来自 score.rubric.focus（没有就不渲染），位置在「问题 / 改成这样」之前 -->
    <section v-if="focusCard" class="focus-card" aria-labelledby="focus-title">
      <div class="focus-kicker">
        <span>本场最该改的一件事</span>
        <span v-if="focusCard.name" class="focus-tag">{{ focusCard.name }}</span>
      </div>
      <div class="focus-hd">
        <h2 id="focus-title" class="focus-title">{{ focusCard.action }}</h2>
        <span v-if="focusCard.score" class="focus-score">{{ focusCard.score }}<i>分</i></span>
        <span v-if="focusCard.weight" class="focus-weight">权重 {{ focusCard.weight }}</span>
      </div>
      <p v-if="focusCard.reason" class="focus-reason">为什么是它：{{ focusCard.reason }}</p>
    </section>

    <div class="card">
      <div class="row" style="align-items: flex-end; gap: 30px; flex-wrap: wrap">
        <div>
          <div class="big score-color">{{ r.total == null ? '待出分' : r.total }}<small v-if="r.total != null">分</small></div>
          <div class="score-note">五维加权 · 已写入记录（{{ rubricVersionLabel }}）</div>
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

      <!-- 评分口径：可展开；rubric 未落地时降级成现有五维分数（不报错） -->
      <section class="rubric">
        <button
          type="button"
          class="rubric-toggle"
          aria-controls="rubric-body"
          :aria-expanded="rubricOpen ? 'true' : 'false'"
          @click="toggleRubric"
        >
          <span class="rubric-caret" aria-hidden="true">{{ rubricOpen ? '▾' : '▸' }}</span>
          <span class="rubric-title">评分口径</span>
          <span class="rubric-meta">
            <span class="nowrap">口径 {{ rubricVersionLabel }}</span>
            <span class="nowrap">权重合计 {{ rubricWeightSum }}%</span>
          </span>
          <span class="rubric-hint">{{ rubricOpen ? '收起' : '展开' }}</span>
        </button>
        <div v-show="rubricOpen" id="rubric-body" class="rubric-body">
          <p v-if="!hasRubricDims" class="rubric-note">
            本场未返回评分口径明细（后端 rubric 字段还没有落地），下面是本场五维分数与固定权重。
          </p>
          <ul class="rubric-list">
            <li v-for="d in rubricRows" :key="d.key" class="rubric-row">
              <div class="rubric-head">
                <b class="rubric-name">{{ d.name }}</b>
                <span class="rubric-score" :class="{ low: d.low }">{{ d.score }}<i v-if="d.score !== '—'">分</i></span>
                <span class="rubric-weight">{{ d.weight }}</span>
              </div>
              <div class="rubric-line">
                <span class="rubric-key">命中依据</span>
                <span class="rubric-val" :class="{ miss: !d.hasBasis }">{{ d.basis }}</span>
              </div>
              <div class="rubric-line">
                <span class="rubric-key">原话证据</span>
                <span class="rubric-val" :class="d.hasEvidence ? 'quote' : 'miss'">{{ d.evidence }}</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- 逐回合点评 -->
      <div v-if="(r.perTurn || []).length" style="margin-top: 14px">
        <b style="font-size: 12.5px">逐回合点评</b>
        <div class="tbl-wrap">
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

<style scoped>
/* 只写本批新增的两块（focus 卡 + 评分口径面板）；其余沿用 style.css 的 .card / .dim / .tag */

/* ---------- 总分卡注脚 ---------- */
.score-note {
  margin-top: var(--space-1);
  font-size: var(--fs-12);
  color: var(--muted-3);
}

/* ---------- 本场最该改的一件事（对照 docs/mockups/复盘页-口径面板.html） ---------- */
.focus-card {
  background: var(--accent-weak);
  border: 1px solid var(--accent-line);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: var(--space-4) 18px;
  margin-bottom: var(--space-3);
  min-width: 0;
}
.focus-kicker {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  font-size: var(--fs-12);
  font-weight: var(--fw-semi);
  color: var(--accent);
  letter-spacing: 0.5px;
}
.focus-kicker::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.focus-tag {
  font-size: var(--fs-12);
  font-weight: var(--fw-normal);
  letter-spacing: 0;
  color: var(--warn-ink);
  background: var(--warn-weak);
  border-radius: var(--radius-sm);
  padding: 0 6px;
}
.focus-hd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: var(--space-2);
}
.focus-title {
  font-size: var(--fs-16);
  line-height: 1.45;
  font-weight: var(--fw-bold);
  color: var(--text);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.focus-score {
  font-family: var(--font-mono);
  font-size: var(--fs-14);
  font-weight: var(--fw-bold);
  color: var(--accent);
}
.focus-score i {
  font-style: normal;
  font-family: var(--font-sans);
  font-size: var(--fs-12);
  font-weight: var(--fw-normal);
  color: var(--muted);
  margin-left: 1px;
}
.focus-weight {
  font-size: var(--fs-12);
  color: var(--warn-ink);
  background: var(--warn-weak);
  border-radius: var(--radius-sm);
  padding: 1px 8px;
}
.focus-reason {
  margin-top: var(--space-2);
  font-size: var(--fs-13);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ---------- 评分口径 ---------- */
.rubric {
  margin-top: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel-2);
  overflow: hidden;
  min-width: 0;
}
.rubric-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  font-size: var(--fs-13);
  line-height: 1.5;
  color: var(--text);
  background: none;
  border: none;
  cursor: pointer;
}
.rubric-toggle:hover { background: var(--accent-weak); }
.rubric-toggle:focus-visible {
  outline: var(--focus-w) solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}
.rubric-caret { width: 10px; flex-shrink: 0; color: var(--muted); }
.rubric-title { flex-shrink: 0; font-weight: var(--fw-semi); }
.rubric-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-2);
  font-size: var(--fs-12);
  color: var(--muted);
  overflow-wrap: anywhere;
}
.rubric-hint { flex-shrink: 0; font-size: var(--fs-12); color: var(--accent); }
.nowrap { white-space: nowrap; }
.rubric-body { padding: 0 var(--space-3) var(--space-3); }
.rubric-note {
  margin-bottom: var(--space-2);
  font-size: var(--fs-12);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.rubric-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rubric-row {
  background: var(--panel);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  padding: 10px;
  min-width: 0;
}
.rubric-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
  min-width: 0;
}
.rubric-name { font-size: var(--fs-13); color: var(--text); }
.rubric-score {
  font-family: var(--font-mono);
  font-size: var(--fs-13);
  font-weight: var(--fw-bold);
  color: var(--accent);
}
.rubric-score.low { color: var(--warn-ink); }
.rubric-score i {
  font-style: normal;
  font-family: var(--font-sans);
  font-size: var(--fs-12);
  font-weight: var(--fw-normal);
  color: var(--muted);
  margin-left: 1px;
}
.rubric-weight { margin-left: auto; font-size: var(--fs-12); color: var(--muted); }
.rubric-weight::before { content: "权重"; margin-right: var(--space-1); }
.rubric-line {
  display: flex;
  gap: 6px;
  margin-top: 5px;
  font-size: var(--fs-12);
  line-height: var(--lh-body);
  min-width: 0;
}
.rubric-key { flex-shrink: 0; width: 52px; color: var(--muted); }
.rubric-val {
  flex: 1;
  min-width: 0;
  color: var(--text-2);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.rubric-val.quote {
  background: var(--panel-3);
  border-left: 2px solid var(--line-strong);
  border-radius: 2px;
  padding-left: 6px;
}
.rubric-val.miss { color: var(--muted-3); }

/* 原句 / 复盘正文里的超长串不撑破容器 */
.ev { overflow-wrap: anywhere; word-break: break-word; }

/* ---------- 窄屏（375px）：口径表降级成卡片，每维竖排，不横向滚 ---------- */
@media (max-width: 520px) {
  .focus-card { padding: var(--space-3) var(--space-4); }
  .rubric-head { flex-direction: column; align-items: flex-start; gap: 2px; }
  .rubric-weight { margin-left: 0; }
  /* 竖排时补出「分数」标签，去掉「分」后缀，避免重复 */
  .rubric-score::before {
    content: "分数";
    font-family: var(--font-sans);
    font-size: var(--fs-12);
    font-weight: var(--fw-normal);
    color: var(--muted);
    margin-right: var(--space-1);
  }
  .rubric-score i { display: none; }
  /* 逐回合点评：固定列宽在 375px 下会溢出，改成按内容分配 + 兜底横向滚动 */
  .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tbl-wrap table.t { font-size: var(--fs-12); }
  .tbl-wrap table.t th,
  .tbl-wrap table.t td { padding: 6px 4px; }
  .tbl-wrap table.t th { width: auto !important; white-space: nowrap; }
  .tbl-wrap table.t th:last-child { white-space: normal; }
  /* 「有交锋 / 太短」这类短标签不要被挤成竖排 */
  .tbl-wrap .tag { white-space: nowrap; }
}
</style>
