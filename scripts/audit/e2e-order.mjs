#!/usr/bin/env node
// 审计：单人 / 双人房间对局的端到端不变量（HTTP + SSE，不依赖 LLM）
//
// 跑法（先起 18092 服务）：
//   node scripts/audit/e2e-order.mjs
//   BASE_URL=http://127.0.0.1:18092 AUDIT_LOG_DIR=target/audit-logs node scripts/audit/e2e-order.mjs
//
// 覆盖：
//   1) SOLO：催一下连点 5 次只推进一步、轮到我时不能催、每 step 恰好 1 条、step 不回退、
//      无重复 (step,seat)、FINISHED 后 turns == steps、SSE 每个 step 只推一次 / match.end 只发一次
//   2) 房间双人：第二人补对面、不能替对方提交、双方看到同一 step、抢拍只有一人且席位不串、
//      结束时 turns == steps
//   3) 3 场自然 SOLO（不催）：总时长 / 最慢一步 / step 空窗 >15s / 重复 step
//
// 退出码：0=全部通过；1=有失败断言（失败项就是审计发现，日志里有完整时间线）。

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:18092').replace(/\/+$/, '');
const LOG_DIR = process.env.AUDIT_LOG_DIR || 'target/audit-logs';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const MAX_SOLO_MS = Number(process.env.AUDIT_SOLO_TIMEOUT_MS || 180_000);
const MAX_ROOM_MS = Number(process.env.AUDIT_ROOM_TIMEOUT_MS || 240_000);

const checks = [];
const logs = { startedAt: new Date().toISOString(), baseUrl: BASE_URL, checks, scenarios: {} };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail: String(detail ?? '') });
  console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${name}${detail ? ' · ' + detail : ''}`);
  return ok;
}

async function request(method, p, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE_URL + p, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, ok: res.ok, text, json };
}

async function register(prefix) {
  const account = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;
  const r = await request('POST', '/api/auth/register', { body: { account, password: 'Test123456' } });
  if (!r.ok || !r.json?.token) throw new Error(`注册失败 ${r.status} ${r.text}`);
  return { account, token: r.json.token, id: r.json.user?.id };
}

async function topic() {
  const r = await request('GET', '/api/topics');
  if (!r.ok || !Array.isArray(r.json) || !r.json.length) throw new Error(`题库为空 ${r.status}`);
  return r.json[0];
}

// ---------------- SSE 监听 ----------------

async function startSse(matchId, token) {
  const ac = new AbortController();
  const events = [];
  const done = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/matches/${matchId}/events?since=0`, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try { events.push({ t: Date.now(), ...JSON.parse(raw) }); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.log(`  [warn] SSE 断开：${e.message}`);
    }
  })();
  return { events, stop: async () => { ac.abort(); await Promise.race([done, sleep(500)]); } };
}

// ---------------- SOLO ----------------

function speech(seg, n) {
  return `我方判断：${seg}这一轮先立判准，再谈结论。判准两条：一是替代方案能否被复核，`
    + `二是成本由谁承担。据现有制度，考核形式本可由学校规定，所以改革可行；`
    + `但任何替代评价都要有明细分项与复核主体。请问对方：如果没有人复核，凭什么说它公平？（第 ${n} 轮）`;
}

async function soloRun({ label, fast, skipProbe }) {
  const user = await register('audit_solo');
  const t = await topic();
  const created = await request('POST', '/api/matches', {
    token: user.token,
    body: { topicId: t.id, seats: ['B2'], mode: 'SPRINT', kind: 'solo', tier: 'PRO' },
  });
  if (!created.ok || !created.json?.matchId) throw new Error(`开局失败 ${created.status} ${created.text}`);
  const id = created.json.matchId;
  const sse = await startSse(id, user.token);

  const timeline = [];
  const actions = [];
  const start = Date.now();
  let lastKey = '';
  let skipBatch = null;
  let myTurnSkip = null;
  let cooldownProbe = null;
  let buzzed = false;
  let firstMyTurn = true;
  let submits = 0;
  let status = null;
  let lastDetail = null;
  const skipped = new Set();

  while (Date.now() - start < MAX_SOLO_MS) {
    const d = await request('GET', `/api/matches/${id}`, { token: user.token });
    if (!d.ok) throw new Error(`详情失败 ${d.status} ${d.text}`);
    lastDetail = d.json;
    const m = d.json.match;
    const step = m.step;
    const key = `${m.step}|${d.json.phase}|${d.json.turns.length}|${d.json.waitingForMe}`;
    if (key !== lastKey) {
      timeline.push({ t: Date.now() - start, step, stepNo: d.json.currentStep?.no ?? null,
        seat: d.json.currentStep?.seat ?? null, phase: d.json.phase,
        waitingForMe: d.json.waitingForMe, turns: d.json.turns.length });
      lastKey = key;
    }
    if (m.status !== 'RUNNING') { status = m.status; break; }

    // ① 催一下连点 5 次：任选一个 AI 步做一次
    if (skipProbe && !skipBatch && !d.json.waitingForMe) {
      const before = step;
      const rs = await Promise.all(Array.from({ length: 5 }, () =>
        request('POST', `/api/matches/${id}/skip`, { token: user.token, body: {} })));
      // skip 只改 deadline，推进由 tick 异步完成：等 step 变化后再记 stepAfter
      let afterDetail = null;
      for (let i = 0; i < 20; i++) {
        await sleep(150);
        afterDetail = await request('GET', `/api/matches/${id}`, { token: user.token });
        if (afterDetail.json?.match?.step !== before) break;
      }
      skipBatch = {
        stepBefore: before,
        stepAfter: afterDetail.json?.match?.step,
        okCount: rs.filter(r => r.json?.ok === true).length,
        responses: rs.map(r => ({ status: r.status, ok: r.json?.ok, reason: r.json?.reason })),
      };
      actions.push({ type: 'skip-batch', ...skipBatch });
      continue;
    }

    if (d.json.waitingForMe) {
      // ② 轮到我说：催一下必须被拒
      if (skipProbe && firstMyTurn) {
        const r = await request('POST', `/api/matches/${id}/skip`, { token: user.token, body: {} });
        myTurnSkip = { status: r.status, ok: r.json?.ok, reason: r.json?.reason };
        actions.push({ type: 'skip-my-turn', ...myTurnSkip });
        firstMyTurn = false;
      }
      const seg = d.json.currentStep?.seg || '自由辩';
      const r = await request('POST', `/api/matches/${id}/turns`, {
        token: user.token, body: { content: speech(seg, submits + 1), inputType: 'kb' },
      });
      if (r.ok) {
        submits++;
        actions.push({ type: 'submit', step: step + 1, seat: d.json.currentStep?.seat, t: Date.now() - start });
      } else if (r.status !== 409) {
        throw new Error(`提交失败 ${r.status} ${r.text}`);
      }
      await sleep(120);
      continue;
    }

    // ③ AI 步：fast 模式下催一下加速（每个 step 最多一次）
    if (fast && step > 0 && !skipped.has(step)) {
      skipped.add(step);
      const r = await request('POST', `/api/matches/${id}/skip`, { token: user.token, body: {} });
      actions.push({ type: 'skip', step: step + 1, ok: r.json?.ok, reason: r.json?.reason });
      if (skipProbe && !cooldownProbe && r.json?.ok === false
          && String(r.json?.reason || '').includes('别急')) {
        cooldownProbe = { step: step + 1, reason: r.json.reason };
      }
    }
    await sleep(180);
  }

  await sleep(300);
  const final = await request('GET', `/api/matches/${id}`, { token: user.token });
  const review = await request('GET', `/api/matches/${id}/review`, { token: user.token });
  await sse.stop();
  const detail = final.json || lastDetail;
  const steps = detail?.steps || [];
  const turns = detail?.turns || [];
  const durationSec = (Date.now() - start) / 1000;

  // ---- 不变量 ----
  const byStep = new Map();
  for (const tr of turns) {
    const k = Number(tr.step);
    byStep.set(k, (byStep.get(k) || 0) + 1);
  }
  const stepNos = turns.map(t => Number(t.step)).sort((a, b) => a - b);
  const expected = steps.map(s => s.no);
  const contiguous = stepNos.length === steps.length
    && stepNos.every((v, i) => v === expected[i]);
  const perStepOnce = [...byStep.values()].every(n => n === 1);
  // 自由辩抢拍允许「同侧替位」：人类用自己的席位接手本侧 AI 的回合，
  // 所以这里校验侧别（A/B），不要求 seat 与赛制逐字相等；抢到的必须是本人席位由房间场景单独断言。
  const seatAligned = turns.every(tr => {
    const st = steps[Number(tr.step) - 1];
    return st && String(st.seat).charAt(0) === String(tr.seat).charAt(0);
  });
  const dupPair = (() => {
    const seen = new Set();
    for (const tr of turns) {
      const k = `${tr.step}|${tr.seat}`;
      if (seen.has(k)) return k;
      seen.add(k);
    }
    return null;
  })();
  const stepMonotonic = timeline.every((x, i) => i === 0 || x.step >= timeline[i - 1].step);
  const gaps = [];
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].step !== timeline[i - 1].step) gaps.push(timeline[i].t - timeline[i - 1].t);
  }
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const bigGaps = gaps.filter(g => g > 15_000);

  const sseTurns = sse.events.filter(e => e.type === 'turn').length;
  const sseStepEvents = sse.events.filter(e => e.type === 'step').map(e => e.step);
  const sseStepDup = sseStepEvents.length !== new Set(sseStepEvents).size;
  const sseEnd = sse.events.filter(e => e.type === 'match.end').length;

  check(`${label}: 结束状态 FINISHED`, status === 'FINISHED', `status=${status}`);
  check(`${label}: turns 数 == steps 数`, turns.length === steps.length, `${turns.length}/${steps.length}`);
  check(`${label}: 每 step 恰好 1 条发言`, perStepOnce, `byStep=${JSON.stringify([...byStep])}`);
  check(`${label}: step 1..N 连续无缺号`, contiguous, `steps=${stepNos.join(',')}`);
  check(`${label}: 无重复 (step,seat)`, !dupPair, dupPair || 'none');
  check(`${label}: 发言侧别与赛制 steps 对齐`, seatAligned,
    turns.filter(tr => steps[Number(tr.step) - 1]?.seat !== tr.seat).map(tr => `${tr.step}:${tr.seat}≠${steps[Number(tr.step) - 1]?.seat}`).join(';'));
  check(`${label}: step 单调不回退`, stepMonotonic, `${timeline.map(x => x.step).join('>')}`);
  check(`${label}: SSE turn 事件数 == 发言记录数`, sseTurns === turns.length, `${sseTurns}/${turns.length}`);
  check(`${label}: SSE step 事件无重复`, !sseStepDup, `events=${sseStepEvents.join(',')}`);
  check(`${label}: SSE match.end 只发一次`, sseEnd === 1, `count=${sseEnd}`);

  if (skipProbe) {
    check(`${label}: 连点催一下只推进一步`,
      skipBatch?.okCount === 1 && skipBatch?.stepAfter === skipBatch?.stepBefore + 1,
      JSON.stringify(skipBatch));
    check(`${label}: 轮到我说时催一下被拒`,
      myTurnSkip?.ok === false && String(myTurnSkip?.reason || '').includes('轮到你'),
      JSON.stringify(myTurnSkip));
    check(`${label}: 冷却期观察`, cooldownProbe ? true : '未触发（不判失败）', JSON.stringify(cooldownProbe));
  }

  const report = {
    label, matchId: id, durationSec: Number(durationSec.toFixed(2)),
    turns: turns.length, steps: steps.length, submits, skipBatch, myTurnSkip, cooldownProbe,
    maxGapMs: maxGap, bigGaps, gaps, timeline, actions,
    sse: { total: sse.events.length, turns: sseTurns, end: sseEnd, stepEvents: sseStepEvents },
    reviewTotal: review.json?.score?.total ?? null,
  };
  console.log(`  [stats] ${label}: ${durationSec.toFixed(1)}s · turns=${turns.length} · 最慢一步=${(maxGap / 1000).toFixed(1)}s · >15s 空窗=${bigGaps.length}`);
  return report;
}

// ---------------- 房间双人 ----------------

async function roomRun() {
  const host = await register('audit_host');
  const guest = await register('audit_guest');
  const t = await topic();

  const room = await request('POST', '/api/rooms', { token: host.token, body: { topicId: t.id, visibility: 'public' } });
  if (!room.ok || !room.json?.code) throw new Error(`建房失败 ${room.status} ${room.text}`);
  const code = room.json.code;

  const joined = await request('POST', `/api/rooms/${code}/join`, { token: guest.token, body: {} });
  if (!joined.ok) throw new Error(`加入失败 ${joined.status} ${joined.text}`);
  const guestSeat = joined.json?.mySeat;
  check('房间: 第二人补对面席位', guestSeat === 'B1', `guestSeat=${guestSeat}`);

  await request('POST', `/api/rooms/${code}/ready`, { token: guest.token, body: { ready: true } });
  const started = await request('POST', `/api/rooms/${code}/start`, { token: host.token, body: {} });
  if (!started.ok || !started.json?.matchId) throw new Error(`开局失败 ${started.status} ${started.text}`);
  const matchId = started.json.matchId;
  check('房间: 开局席位为 A1,B1', started.json.seats === 'A1,B1', JSON.stringify(started.json));

  const sse = await startSse(matchId, host.token);
  const timeline = [];
  const actions = [];
  const start = Date.now();
  let lastKey = '';
  let status = null;
  let lastDetail = null;
  let wrongGuest = null;
  let wrongHost = null;
  let skipRejected = null;
  let buzzResult = null;
  let buzzStep = null;
  let orderMismatch = 0;
  let waitingBoth = null;

  while (Date.now() - start < MAX_ROOM_MS) {
    const dh = await request('GET', `/api/matches/${matchId}`, { token: host.token });
    const dg = await request('GET', `/api/matches/${matchId}`, { token: guest.token });
    if (!dh.ok || !dg.ok) throw new Error(`详情失败 ${dh.status}/${dg.status}`);
    lastDetail = dh.json;
    const m = dh.json.match;
    const step = m.step;
    if (dh.json.currentStep?.no !== dg.json.currentStep?.no
        || dh.json.match.step !== dg.json.match.step
        || dh.json.match.status !== dg.json.match.status) orderMismatch++;
    const key = `${step}|${dh.json.phase}|${dh.json.turns.length}|${dh.json.buzzSeat}|${dh.json.match.status}`;
    if (key !== lastKey) {
      timeline.push({ t: Date.now() - start, step, stepNo: dh.json.currentStep?.no ?? null,
        seat: dh.json.currentStep?.seat ?? null, phase: dh.json.phase,
        buzzSeat: dh.json.buzzSeat, turns: dh.json.turns.length,
        waitingHost: dh.json.waitingForMe, waitingGuest: dg.json.waitingForMe });
      lastKey = key;
    }
    if (m.status !== 'RUNNING') { status = m.status; break; }

    if (step === 0 && waitingBoth === null) {
      waitingBoth = { host: dh.json.waitingForMe, guest: dg.json.waitingForMe, seat: dh.json.currentStep?.seat };
      // 记录：房间对局 my_seats=A1,B1，两端 waitingForMe 可能同时为 true（是否算缺陷见报告）
      // 客队替主队提交（step1 = A1）
      const r = await request('POST', `/api/matches/${matchId}/turns`, {
        token: guest.token, body: { content: speech('立论', 99), inputType: 'kb' },
      });
      wrongGuest = { status: r.status, code: r.json?.code, message: r.json?.message };
      check('房间: 客队不能替主队提交', r.status >= 400, `HTTP ${r.status} ${r.json?.code || ''}`);
      // 房主（A1）正常提交
      const ok = await request('POST', `/api/matches/${matchId}/turns`, {
        token: host.token, body: { content: speech('立论', 1), inputType: 'kb' },
      });
      check('房间: 主队可在 A1 提交', ok.ok, `${ok.status} ${ok.text.slice(0, 120)}`);
      actions.push({ type: 'wrong-submit-guest-on-A1', ...wrongGuest }, { type: 'submit-host-A1', ok: ok.ok });
      await sleep(150);
      continue;
    }

    if (step === 1 && wrongHost === null) {
      const r = await request('POST', `/api/matches/${matchId}/turns`, {
        token: host.token, body: { content: speech('驳立论', 98), inputType: 'kb' },
      });
      wrongHost = { status: r.status, code: r.json?.code, message: r.json?.message };
      check('房间: 主队不能替客队提交', r.status >= 400, `HTTP ${r.status} ${r.json?.code || ''}`);
      const ok = await request('POST', `/api/matches/${matchId}/turns`, {
        token: guest.token, body: { content: speech('驳立论', 2), inputType: 'kb' },
      });
      check('房间: 客队可在 B1 提交', ok.ok, `${ok.status} ${ok.text.slice(0, 120)}`);
      actions.push({ type: 'wrong-submit-host-on-B1', ...wrongHost }, { type: 'submit-guest-B1', ok: ok.ok });
      await sleep(150);
      continue;
    }

    // 房间模式下催一下必须被拒
    if (!skipRejected && !dh.json.waitingForMe) {
      const r = await request('POST', `/api/matches/${matchId}/skip`, { token: host.token, body: {} });
      skipRejected = { ok: r.json?.ok, reason: r.json?.reason, status: r.status };
      check('房间: 多人对局不能催一下', r.json?.ok === false, JSON.stringify(skipRejected));
    }

    // 抢拍：第一次自由辩窗口，两端同时抢
    if (dh.json.phase === 'BUZZ' && buzzResult === null) {
      buzzStep = step;
      const [rh, rg] = await Promise.all([
        request('POST', `/api/matches/${matchId}/buzz`, { token: host.token, body: {} }),
        request('POST', `/api/matches/${matchId}/buzz`, { token: guest.token, body: {} }),
      ]);
      const winners = [];
      if (rh.json?.ok) winners.push({ who: 'host', seat: rh.json.seat });
      if (rg.json?.ok) winners.push({ who: 'guest', seat: rg.json.seat });
      buzzResult = {
        host: { ok: rh.json?.ok, seat: rh.json?.seat, reason: rh.json?.reason },
        guest: { ok: rg.json?.ok, seat: rg.json?.seat, reason: rg.json?.reason },
        winners,
      };
      check('房间: 抢拍只有一人成功', winners.length <= 1, JSON.stringify(buzzResult));
      const mismatch = winners.filter(w => (w.who === 'host' ? w.seat !== 'A1' : w.seat !== 'B1'));
      check('房间: 抢拍席位与本人座位一致', mismatch.length === 0,
        mismatch.length ? `抢到 ${mismatch.map(w => w.who + '=' + w.seat).join(',')}（座位 A1/B1）` : '一致');
      actions.push({ type: 'buzz', step: step + 1, ...buzzResult });
      // 只有席位匹配时才提交（不匹配时不提交，记录为审计发现）
      const own = winners.find(w => (w.who === 'host' ? w.seat === 'A1' : w.seat === 'B1'));
      if (own) {
        const r = await request('POST', `/api/matches/${matchId}/turns`, {
          token: own.who === 'host' ? host.token : guest.token,
          body: { content: speech('自由辩', 50), inputType: 'kb' },
        });
        actions.push({ type: 'submit-after-buzz', by: own.who, ok: r.ok, status: r.status });
      }
    }

    if (dh.json.waitingForMe && dh.json.phase !== 'BUZZ') {
      const seat = dh.json.buzzSeat || dh.json.currentStep?.seat;
      const who = seat === 'A1' ? host : seat === 'B1' ? guest : null;
      if (who) {
        const r = await request('POST', `/api/matches/${matchId}/turns`, {
          token: who.token, body: { content: speech(dh.json.currentStep?.seg || '自由辩', 3), inputType: 'kb' },
        });
        actions.push({ type: 'submit', seat, ok: r.ok, status: r.status });
      }
    }
    await sleep(220);
  }

  await sleep(300);
  const final = await request('GET', `/api/matches/${matchId}`, { token: host.token });
  await sse.stop();
  const detail = final.json || lastDetail;
  const steps = detail?.steps || [];
  const turns = detail?.turns || [];
  const byStep = new Map();
  for (const tr of turns) byStep.set(Number(tr.step), (byStep.get(Number(tr.step)) || 0) + 1);
  const stepNos = turns.map(t => Number(t.step)).sort((a, b) => a - b);
  const expected = steps.map(s => s.no);
  const contiguous = stepNos.length === steps.length && stepNos.every((v, i) => v === expected[i]);
  const perStepOnce = [...byStep.values()].every(n => n === 1);
  // 同上：抢拍允许同侧替位，校验侧别；「抢到的必须是本人席位」在下方单独断言
  const seatAligned = turns.every(tr => steps[Number(tr.step) - 1]?.seat?.charAt(0) === tr.seat.charAt(0));
  const stepMonotonic = timeline.every((x, i) => i === 0 || x.step >= timeline[i - 1].step);
  const sseEnd = sse.events.filter(e => e.type === 'match.end').length;
  const sseTurns = sse.events.filter(e => e.type === 'turn').length;
  const sseStepDup = (() => {
    const arr = sse.events.filter(e => e.type === 'step').map(e => e.step);
    return arr.length !== new Set(arr).size;
  })();

  check('房间: 双方看到同一 step/状态', orderMismatch === 0, `mismatch=${orderMismatch}`);
  check('房间: 结束状态 FINISHED', status === 'FINISHED', `status=${status}`);
  check('房间: turns 数 == steps 数', turns.length === steps.length, `${turns.length}/${steps.length}`);
  check('房间: 每 step 恰好 1 条发言', perStepOnce, JSON.stringify([...byStep]));
  check('房间: step 1..N 连续', contiguous, stepNos.join(','));
  check('房间: 发言侧别与赛制 steps 对齐', seatAligned,
    turns.filter(tr => steps[Number(tr.step) - 1]?.seat !== tr.seat).map(tr => `${tr.step}:${tr.seat}≠${steps[Number(tr.step) - 1]?.seat}`).join(';'));
  check('房间: step 单调不回退', stepMonotonic, timeline.map(x => x.step).join('>'));
  check('房间: SSE turn 事件数 == 发言记录数', sseTurns === turns.length, `${sseTurns}/${turns.length}`);
  check('房间: SSE step 事件无重复', !sseStepDup);
  check('房间: SSE match.end 只发一次', sseEnd === 1, `count=${sseEnd}`);

  const report = {
    host: host.account, guest: guest.account, roomCode: code, matchId,
    durationSec: Number(((Date.now() - start) / 1000).toFixed(2)),
    guestSeat, wrongGuest, wrongHost, skipRejected, buzzResult, buzzStep,
    waitingBoth, orderMismatch, turns: turns.length, steps: steps.length,
    timeline, actions, sse: { total: sse.events.length, turns: sseTurns, end: sseEnd },
  };
  console.log(`  [stats] 房间: ${report.durationSec}s · turns=${turns.length} · buzz=${JSON.stringify(buzzResult?.winners)}`);
  return report;
}

// ---------------- main ----------------

async function health() {
  const r = await request('GET', '/api/health');
  if (!r.ok) throw new Error(`服务未就绪 ${BASE_URL}/api/health -> ${r.status}`);
  return r.json;
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  console.log(`\n审计 e2e-order · BASE_URL=${BASE_URL}`);
  console.log(await health());

  console.log('\n[1/3] SOLO · 催一下与顺序不变量（快速模式）');
  logs.scenarios.soloSkip = await soloRun({ label: 'SOLO(催)', fast: true, skipProbe: true });

  console.log('\n[2/3] 房间 · 双人席位/顺序/抢拍');
  logs.scenarios.room = await roomRun();

  console.log('\n[3/3] SOLO × 3 · 自然节奏统计');
  logs.scenarios.soloStats = [];
  for (let i = 1; i <= 3; i++) {
    logs.scenarios.soloStats.push(await soloRun({ label: `SOLO-自然#${i}`, fast: false, skipProbe: false }));
  }

  const failed = checks.filter(c => !c.ok);
  logs.finishedAt = new Date().toISOString();
  logs.failed = failed;
  logs.summary = { total: checks.length, passed: checks.length - failed.length, failed: failed.length };
  const file = path.join(LOG_DIR, `e2e-order-${STAMP}.json`);
  fs.writeFileSync(file, JSON.stringify(logs, null, 2), 'utf8');

  const stats = logs.scenarios.soloStats;
  const avg = stats.reduce((a, s) => a + s.durationSec, 0) / (stats.length || 1);
  console.log('\n===== 汇总 =====');
  console.log(`断言：${checks.length - failed.length}/${checks.length} 通过，失败 ${failed.length} 项`);
  console.log(`3 场 SOLO 平均 ${avg.toFixed(1)}s · 最慢一步 ${Math.max(...stats.map(s => s.maxGapMs)) / 1000}s · >15s 空窗 ${stats.reduce((a, s) => a + s.bigGaps.length, 0)} 次`);
  console.log(`日志：${file}`);
  if (failed.length) {
    console.log('\n失败项：');
    failed.forEach(f => console.log(`  - ${f.name}${f.detail ? ' · ' + f.detail : ''}`));
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(`\n[ERROR] ${e.stack || e.message}`);
  process.exitCode = 2;
});
