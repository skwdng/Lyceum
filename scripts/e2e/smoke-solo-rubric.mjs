#!/usr/bin/env node
// 思弈阁 · 评分链路端到端冒烟（只依赖 HTTP，不碰浏览器 / 数据库）
//
// 用法：
//   node scripts/e2e/smoke-solo-rubric.mjs
//   BASE_URL=http://127.0.0.1:8080 node scripts/e2e/smoke-solo-rubric.mjs
//   STRICT_RUBRIC=1 node scripts/e2e/smoke-solo-rubric.mjs   # rubric 缺失时判失败
//
// 流程：健康检查 → 注册 → 开单人局（SOLO/SPRINT）→ 逐轮提交 → 复盘
// 断言：review.score.total 是 0–100 的数字；rubric 字段存在（未合并时默认软断言，见 README）。
// 任何一步失败都会打印 HTTP 状态码 + 响应体，方便直接贴给后端。

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const STRICT_RUBRIC = process.env.STRICT_RUBRIC === '1';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 180_000);
const SEATS = (process.env.SMOKE_SEATS || 'B2').split(',').map(s => s.trim()).filter(Boolean);
const MODE = process.env.SMOKE_MODE || 'SPRINT';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
  console.log(msg);
}

async function request(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON 响应保留原文 */ }
  return { status: res.status, ok: res.ok, text, json };
}

function fail(step, res) {
  const body = res && res.text ? res.text : '(空响应体)';
  console.error(`\n[FAIL] ${step}`);
  if (res) console.error(`  HTTP ${res.status} ${BASE_URL}`);
  console.error(`  响应体: ${body}`);
  throw new Error(step);
}

function assert(cond, msg, res) {
  if (!cond) fail(msg, res);
}

function speech(seg, n) {
  return '我方判断：' + seg + '这一轮先立判准，再谈结论。判准两条：一是替代方案能否被复核，'
    + '二是成本由谁承担。据现有制度，考核形式本可由学校规定，所以改革可行；'
    + '但任何替代评价都要有明细分项与复核主体。请问对方：如果没有人复核，凭什么说它公平？'
    + '（第 ' + n + ' 轮）';
}

async function main() {
  log(`\n思弈阁冒烟 · BASE_URL=${BASE_URL} · mode=${MODE} · seats=${SEATS.join(',')}`);

  // 1. 健康检查
  const health = await request('GET', '/api/health');
  assert(health.ok, '健康检查 /api/health 失败（服务没起来或地址不对）', health);
  log(`[1/5] 健康检查 OK · service=${health.json?.service ?? '?'}`);

  // 2. 注册
  const account = `smoke_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
  const password = 'Test123456';
  const reg = await request('POST', '/api/auth/register', { body: { account, password } });
  assert(reg.ok && reg.json?.token, `注册失败（account=${account}）`, reg);
  const token = reg.json.token;
  log(`[2/5] 注册 OK · account=${account} · user=${reg.json?.user?.id ?? '?'}`);

  // 3. 选题 + 开局
  const topics = await request('GET', '/api/topics');
  assert(topics.ok && Array.isArray(topics.json) && topics.json.length > 0, '题库 /api/topics 为空', topics);
  const topic = topics.json[0];
  const created = await request('POST', '/api/matches', {
    token,
    body: { topicId: topic.id, seats: SEATS, mode: MODE, kind: 'solo', tier: 'PRO' },
  });
  assert(created.ok && created.json?.matchId, '开局 POST /api/matches 失败（常见：余额不足）', created);
  const matchId = created.json.matchId;
  log(`[3/5] 开局 OK · matchId=${matchId} · topic=${topic.id} ${topic.title ?? ''}`);

  // 4. 逐轮推进：轮到我 → 提交；轮到 AI → skip 跳过思考
  const deadline = Date.now() + TIMEOUT_MS;
  let submits = 0;
  let skips = 0;
  let finalStatus = null;
  let lastDetail = null;
  while (Date.now() < deadline) {
    const detail = await request('GET', `/api/matches/${matchId}`, { token });
    assert(detail.ok, '查询对局详情失败', detail);
    lastDetail = detail.json || {};
    const status = lastDetail.match?.status;
    if (status && status !== 'RUNNING') {
      finalStatus = status;
      break;
    }
    if (lastDetail.waitingForMe) {
      const seg = lastDetail.currentStep?.seg || '自由辩';
      const res = await request('POST', `/api/matches/${matchId}/turns`, {
        token,
        body: { content: speech(seg, submits + 1), inputType: 'kb' },
      });
      if (res.ok) {
        submits++;
        log(`      第 ${submits} 次提交 · ${seg} · step=${lastDetail.currentStep?.no ?? '?'}`);
      } else if (res.status === 409 && String(res.text).includes('NOT_YOUR_TURN')) {
        // 刚好推进到下一步，下一轮再判断
      } else {
        fail('提交发言 POST /api/matches/{id}/turns 失败', res);
      }
    } else {
      const res = await request('POST', `/api/matches/${matchId}/skip`, { token, body: {} });
      if (res.ok && res.json?.ok) skips++;
    }
    await sleep(700);
  }
  assert(finalStatus === 'FINISHED',
    `对局 ${TIMEOUT_MS / 1000}s 内未结束（status=${finalStatus ?? 'TIMEOUT'}，已提交 ${submits} 轮）`,
    { status: 0, text: JSON.stringify(lastDetail?.match ?? {}, null, 2) });
  log(`[4/5] 对局结束 · 提交 ${submits} 轮 · skip ${skips} 次 · status=${finalStatus}`);

  // 5. 复盘：total + rubric
  const review = await request('GET', `/api/matches/${matchId}/review`, { token });
  assert(review.ok, '复盘 GET /api/matches/{id}/review 失败', review);
  const score = review.json?.score;
  assert(score && typeof score.total === 'number', '复盘响应缺少 score.total', review);
  assert(score.total >= 0 && score.total <= 100, `score.total 越界：${score.total}`, review);

  const rubric = score.rubric ?? review.json?.rubric ?? review.json?.rubricDetail ?? null;
  const dims = ['matter', 'method', 'manner', 'adapt', 'evidence']
    .map(k => `${k}=${score[k] ?? '?'}`).join(' ');
  log(`[5/5] 复盘 OK · total=${score.total} · ${dims}`);

  if (rubric) {
    const rows = Array.isArray(rubric.dims) ? rubric.dims
      : rubric.dimensions ? Object.values(rubric.dimensions) : [];
    const weightSum = rows.length
      ? rows.reduce((a, d) => a + Number(d?.weight ?? d?.weightPct ?? 0), 0)
      : null;
    const missingBasis = rows.filter(d => !String(d?.basis ?? '').trim()).map(d => d?.key ?? d?.name ?? '?');
    const hasFocus = Boolean(rubric.focus);
    log(`[OK] rubric 存在 · version=${rubric.version ?? '?'} · dims=${rows.length}`
      + (weightSum !== null ? ` · 权重合计=${weightSum}` : '')
      + ` · focus=${hasFocus ? '有' : '无'}`);

    const problems = [];
    if (weightSum !== null && weightSum !== 100) problems.push(`五维权重合计=${weightSum}（应 100）`);
    if (missingBasis.length) problems.push(`缺 basis 的维度：${missingBasis.join(',')}`);
    if (rows.length && !hasFocus) problems.push('缺 focus');
    if (problems.length) {
      const msg = `rubric 完整性不通过：${problems.join('；')}`;
      if (STRICT_RUBRIC) fail(msg, review);
      console.warn(`[WARN] ${msg}（STRICT_RUBRIC=1 时判失败）`);
    }
  } else {
    const msg = 'rubric 字段缺失（待后端合并）';
    if (STRICT_RUBRIC) fail(msg, review);
    console.warn(`[WARN] ${msg}：本次按软断言通过。后端落地后请用 STRICT_RUBRIC=1 复跑。`);
  }

  log(`\n[PASS] 冒烟通过 · matchId=${matchId} · total=${score.total} · turns=${review.json?.turns?.length ?? '?'} · rubric=${rubric ? '有' : '待后端合并'}`);
}

main().catch(err => {
  console.error(`\n[FAIL] ${err.message}`);
  process.exitCode = 1;
});
