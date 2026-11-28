<script setup>
/**
 * 单场记录详情（2026-11-28 新增）：把某一场的**整场逐句**摊开。
 *
 * 为什么要单独一个页面、而不是塞进复盘页：
 *   复盘页（ReviewView）的语义是「打分与改进」，逐句全文搬进去会把它变重；
 *   而且复盘的分是**实时重算**的、记录列表的分是**快照**（sy_record.total），
 *   两个数字在同屏出现必须写清楚来源，否则会被当成 bug。
 *
 * 数据来源（都是现成接口，本次没有新增后端形状）：
 *   · GET /api/matches/{id}        -> 辩题 / 我方席位 / 结束时间（match 行）
 *   · GET /api/matches/{id}/review -> turns（全席位逐句）+ score（按当前口径重算）
 * 深链靠 route.params.matchId + 这两个请求，不依赖任何内存 store（刷新照样能看）。
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { debateApi } from '../api.js';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const detail = ref(null);    // /api/matches/{id}
const reviewed = ref(null);  // /api/matches/{id}/review

const matchId = computed(() => String(route.params.matchId || ''));
const match = computed(() => (detail.value && detail.value.match) || null);
const score = computed(() => (reviewed.value && reviewed.value.score) || null);
const scoreTotal = computed(() => {
  const t = score.value && score.value.total;
  return t === null || t === undefined ? '—' : t;
});

/** 我方席位（my_seats 是逗号分隔的字符串，如 "A1" 或 "A1,A2"）。 */
const mySeats = computed(() =>
  String((match.value && match.value.my_seats) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * 整场逐句：按 step 升序（同一 step 保持后端顺序 —— 后端是 order by id，
 * step 在库里本来就是 1-based 步号，不再 +1）。
 */
const turns = computed(() => {
  const raw = (reviewed.value && reviewed.value.turns) || (detail.value && detail.value.turns) || [];
  return raw.slice().sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0));
});

const endedAt = computed(() => {
  const m = match.value || {};
  return fmtTime(m.finished_at || m.started_at || null);
});

/** 席位 -> 「我方 A1」/「对方 B1」；AI 代打的回合额外标 AI。 */
function seatLabel(t) {
  const seat = String((t && t.seat) || '');
  const mine = mySeats.value.includes(seat);
  return {
    mine,
    text: (mine ? '我方 ' : '对方 ') + (seat || '—'),
    ai: String((t && t.input_type) || '') === 'ai',
    // ai_reason 只在「AI 降级/模板兜底」时有值，hover 提示用得上
    aiReason: String((t && t.ai_reason) || '')
  };
}

/**
 * 异常回合的说明。
 * 库里实际只有三种 status：OK / TIMEOUT / TEMPLATE（EMPty 是旧口径，一起兜住）。
 */
function statusNote(t) {
  const s = String((t && t.status) || '');
  if (s === 'TIMEOUT') return '超时未发言';
  if (s === 'EMPTY' || s === 'TEMPLATE') return '敷衍发言';
  return '';
}

/** 时间：接口给的是 ISO 字符串（带 +00:00），也兼容毫秒数。 */
function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function back() {
  router.push({ name: 'records' });
}

function openReview() {
  router.push('/review?match=' + encodeURIComponent(matchId.value));
}

async function load() {
  loading.value = true;
  error.value = '';
  detail.value = null;
  reviewed.value = null;
  try {
    // 两个请求互不依赖，并行发；任一失败都按「打不开」处理（403 = 不是你的对局）
    const [d, r] = await Promise.all([debateApi.match(matchId.value), debateApi.review(matchId.value)]);
    detail.value = d || null;
    reviewed.value = r || null;
  } catch (e) {
    const code = e && e.code;
    if (code === 'FORBIDDEN' || code === 'MATCH_NOT_FOUND') error.value = '这一场不在了，或者不属于你';
    else error.value = (e && e.message) || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
// 从「另一场记录」直接切过来时（同一个组件复用）也要重新拉
watch(matchId, (v, old) => {
  if (v && v !== old) load();
});
</script>

<template>
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px">
    <a style="font-size: 13px; color: #165dff; cursor: pointer" @click="back">← 辩论记录</a>
  </div>

  <div v-if="loading" class="card"><div class="empty">加载中…</div></div>
  <div v-else-if="error" class="card"><div class="empty">{{ error }}</div></div>

  <template v-else>
    <!-- 1) 顶部条 -->
    <div class="card" style="margin-bottom: 14px">
      <div style="font-size: 18px; font-weight: 600; line-height: 1.5">
        {{ (match && match.topic_title) || '（无辩题）' }}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 18px; margin-top: 12px; font-size: 13px; color: #4e5969">
        <span>结束时间 <b style="color: #1d2129">{{ endedAt }}</b></span>
        <span>我方席位 <b class="mono" style="color: #1d2129">{{ mySeats.length ? mySeats.join('、') : '—' }}</b></span>
        <span>
          得分 <b style="color: #1d2129; font-size: 16px">{{ scoreTotal }}</b>
          <!-- 必须写明白：列表页那个分是落库快照，这里是按当前口径重算的 -->
          <span style="color: #8a909c; font-size: 12px; margin-left: 6px">按当前评分口径重算</span>
        </span>
      </div>
    </div>

    <!-- 2) 整场逐句 -->
    <div class="card">
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px">
        整场逐句
        <span style="color: #8a909c; font-size: 12.5px; font-weight: 400">（{{ turns.length }} 句）</span>
      </div>

      <div v-if="!turns.length" class="empty">这一场没有逐句记录</div>

      <div v-else>
        <div
          v-for="(t, i) in turns"
          :key="i"
          style="padding: 12px 0"
          :style="{ borderTop: i === 0 ? 'none' : '1px solid #f2f3f5' }"
        >
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; color: #86909c">
            <span class="mono">第 {{ t.step }} 步</span>
            <span v-if="t.seg" style="color: #4e5969">{{ t.seg }}</span>
            <b :style="{ color: seatLabel(t).mine ? '#165dff' : '#1d2129', fontWeight: 600 }">{{ seatLabel(t).text }}</b>
            <span v-if="seatLabel(t).ai" class="ai-badge" :title="seatLabel(t).aiReason || 'AI 代打'">AI</span>
            <span v-if="statusNote(t)" style="color: #c9cdd4">{{ statusNote(t) }}</span>
            <span style="color: #c9cdd4">{{ fmtTime(t.created_at) }}</span>
          </div>
          <div
            class="rec-turn-body"
            :style="{ color: statusNote(t) ? '#a9aeb8' : '#1d2129' }"
          >{{ t.content }}</div>
        </div>
      </div>
    </div>

    <!-- 4) 底部：去复盘页 -->
    <div style="display: flex; justify-content: flex-end; margin-top: 14px">
      <button class="btn btn-primary" @click="openReview">看复盘评分</button>
    </div>
  </template>
</template>

<style scoped>
/* 逐句正文：原样换行、长文自动折行，不截断；超时/敷衍的句子由行内色值变灰 */
.rec-turn-body {
  margin-top: 6px;
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
</style>
