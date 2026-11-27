/**
 * ux-probe.mjs -- 验收本批四项：pending ≤1 / 条间停顿 / 出字变慢 / B 方气泡左边缘固定 /
 *                辅助库（含失败态）/ 抢拍入口已隐藏（只读探针）
 *
 *   node scripts/audit/ux-probe.mjs
 *
 * 前置：
 *   java -jar server/target/siyige-backend-0.1.0.jar --server.port=18091 \
 *        --spring.web.resources.static-locations=file:///D:/siyige/server/src/main/resources/static/
 *   msedge --headless=new --remote-debugging-port=9341 --user-data-dir=C:\Windows\Temp\edge-audit-fe about:blank
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:18091';
const CDP = 9341;
const OUT = 'D:/siyige/target/audit-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const log = (...a) => console.log(...a);
const checks = [];
const R = {};
const t = (id, label, ok, detail) => {
  checks.push({ id, label, ok: !!ok, detail });
  log((ok ? 'PASS  ' : 'FAIL  ') + id + ' ' + label + (detail ? ' | ' + detail : ''));
};
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-ux.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
setTimeout(() => { log('[watchdog] timeout'); save(); process.exit(2); }, 170000);

async function connect() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const pages = list.filter((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (pages.length) { target = pages[0]; break; }
    } catch (e) {}
    await sleep(200);
  }
  if (!target) throw new Error('no CDP page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 5000); });
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(String(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '')).split('\n')[0]);
  };
  const send = (method, params = {}, ms = 6000) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return Promise.race([new Promise((r) => pend.set(mid, r)), sleep(ms).then(() => ({ __timeout: method }))]);
  };
  const ev = async (expr, ms = 7000) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms);
    if (!r || r.__timeout) return { __err: 'timeout' };
    if (r.exceptionDetails) return { __err: String(((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '')).split('\n')[0] };
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name, ms = 12000) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, ms);
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot: ' + name); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, ev, shot, errs, close: () => ws.close() };
}

const SNAP = `(() => {
  const msgs = [...document.querySelectorAll('.chat .msg')];
  const items = msgs.map((m) => {
    const hd = m.querySelector('.hd'); const bub = m.querySelector('.bub');
    const r = bub ? bub.getBoundingClientRect() : null;
    const seats = hd ? hd.querySelectorAll('span') : [];
    return {
      seat: seats[1] ? seats[1].textContent.trim() : '',
      side: m.className.replace('msg', '').trim(),
      len: bub ? (bub.textContent || '').length : 0,
      pending: !!(bub && bub.classList.contains('is-pending')),
      ghost: !!(bub && bub.querySelector('.bub-ghost')),
      left: r ? Math.round(r.left * 10) / 10 : null,
      right: r ? Math.round(r.right * 10) / 10 : null,
      width: r ? Math.round(r.width * 10) / 10 : null
    };
  });
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  return {
    items,
    pendingCount: items.filter((x) => x.pending).length,
    view: s ? s.turnsView.map((v) => ({ k: v.key, seat: v.seat, shown: v.shown, len: v.text.length, typing: v.typing, started: v.started })) : [],
    hasTyping: s ? s.hasTyping() : null,
    waiting: s ? s.waiting : null,
    buzzBlock: !!document.querySelector('button') && [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '抢 ！'),
    assist: {
      card: !!document.querySelector('.assist-card'),
      heading: (document.querySelector('.assist-card b') || {}).textContent || '',
      err: (document.querySelector('.assist-err') || {}).textContent || '',
      hints: document.querySelectorAll('.assist-hint').length,
      sources: document.querySelectorAll('.assist-src').length,
      kinds: [...document.querySelectorAll('.assist-kind')].map((x) => x.textContent.trim()),
      retry: [...document.querySelectorAll('.assist-err button')].map((b) => b.textContent.trim()),
      auxSeat: !!document.querySelector('.sp.aux'),
      auxText: (document.querySelector('.sp.aux') || {}).textContent || ''
    }
  };
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/* ---------- 准备：注册 + 建局（我坐 A1 → 第 1 步我说，第 2 步 B1=AI 右侧气泡） ---------- */
const acc = 'ux_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1600);
const prep = await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  if (!d.token) return { err: JSON.stringify(d).slice(0, 150) };
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['A1']));
  localStorage.setItem('sy_mode', 'STANDARD');
  localStorage.setItem('sy_tier', 'BASIC');
  localStorage.removeItem('sy_match');
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 900 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
  const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: 't3', seats: ['A1'], mode: 'STANDARD', pace: 'normal', difficulty: 'pro', tier: 'BASIC' }) })).json();
  const id = m.matchId || (m.match && m.match.id);
  const a = await fetch('/api/matches/' + id + '/assist', { headers: H });
  return { matchId: id, assistStatus: a.status, assistBody: (await a.text()).slice(0, 200) };
})()`, 30000);
R.prep = prep;
log('prep: ' + JSON.stringify(prep).slice(0, 300));
const matchId = prep && prep.matchId;
if (!matchId) { t('UX-0', '建局', false, JSON.stringify(prep).slice(0, 200)); save(); process.exit(1); }

await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + matchId });
await sleep(1900);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/match?match=' + matchId }); await sleep(2400); }

/* ---------- 辅助库（打开即拉一次） ---------- */
let a0 = await c.ev(SNAP);
for (let i = 0; i < 20 && a0 && a0.__err; i++) { await sleep(300); a0 = await c.ev(SNAP); }
R.assistFirst = a0 && a0.assist;
t('UX-1', '右下角是「辅助 · AI 席位」面板', !!(a0 && a0.assist && /辅助/.test(a0.assist.heading)), JSON.stringify(a0 && a0.assist && a0.assist.heading));
t('UX-2', '席位条最右有「辅 AI」卡（不发言）', !!(a0 && a0.assist && a0.assist.auxSeat), JSON.stringify(a0 && a0.assist && a0.assist.auxText));
const assistOk = prep && prep.assistStatus === 200;
t('UX-3', assistOk ? '辅助接口 200：显示 3–5 条提示' : '接口未通：显示失败态 + 重试按钮', assistOk
  ? !!(a0 && a0.assist.hints >= 3 && a0.assist.hints <= 5)
  : !!(a0 && a0.assist.err && /辅助暂时不可用/.test(a0.assist.err) && a0.assist.retry.length > 0),
  JSON.stringify({ status: prep && prep.assistStatus, hints: a0 && a0.assist.hints, err: a0 && a0.assist.err }));
await c.shot('ux-assist.png');

/* ---------- 我的回合：先交一句，让 AI（B1，右侧）开始说 ---------- */
let st = null;
for (let i = 0; i < 60; i++) { st = await c.ev(SNAP); if (st && !st.__err && st.waiting) break; await sleep(300); }
if (st && st.waiting) {
  await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = '我方判断：平台要先把推荐口径公开，才谈得上问责，成本要从推荐收益里出。'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(250);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => x.textContent.trim() === '结束发言'); if (b && !b.disabled) { b.click(); return 1; } return 0; })()`);
}

/* ---------- 采样：pending 数 / 条间停顿 / B 方左边缘 ---------- */
const series = [];
const t0 = now();
while (now() - t0 < 60000) {
  const s = await c.ev(SNAP);
  if (!s || s.__err) break;
  series.push({ t: now() - t0, items: s.items, pending: s.pendingCount, view: s.view, hasTyping: s.hasTyping });
  const typedCount = (s.view || []).filter((v) => v.started).length;
  if (typedCount >= 3 && !s.hasTyping) break;
  await sleep(100);
}
R.seriesLen = series.length;
R.maxPending = Math.max(...series.map((x) => x.pending), 0);
t('UX-4', '屏幕上 pending 占位始终 ≤1', R.maxPending <= 1, 'max=' + R.maxPending + ' samples=' + series.length);

// 关键帧：B 方（右侧）气泡打字期间宽度是否恒定（宽度恒定 → 左边缘不会往左扩张）
const bLefts = [];
for (const sp of series) {
  const bub = sp.items.find((it) => it.ghost);
  if (bub) bLefts.push({ t: sp.t, left: bub.left, width: bub.width, len: bub.len });
}
// 按「宽度突变」切成不同气泡，逐条统计宽度抖动
const runs = [];
let cur = [];
for (const x of bLefts) {
  if (cur.length && Math.abs(x.width - cur[cur.length - 1].width) > 8) { runs.push(cur); cur = []; }
  cur.push(x);
}
if (cur.length) runs.push(cur);
const perBubble = runs.filter((r) => r.length >= 5).map((r) => {
  const ws = r.map((x) => x.width);
  const ls = r.map((x) => x.left);
  return {
    samples: r.length,
    widthVar: Math.round((Math.max(...ws) - Math.min(...ws)) * 10) / 10,
    leftVar: Math.round((Math.max(...ls) - Math.min(...ls)) * 10) / 10,
    width: ws[0]
  };
});
const worstWidthVar = perBubble.length ? Math.max(...perBubble.map((x) => x.widthVar)) : null;
R.bSide = { samples: bLefts.length, bubbles: perBubble.length, perBubble, worstWidthVar, first: bLefts[0], last: bLefts[bLefts.length - 1] };
t('UX-5', 'B 方气泡出字时宽度/左边缘固定（不往左扩）', perBubble.length > 0 && worstWidthVar !== null && worstWidthVar <= 1.5, JSON.stringify({ bubbles: perBubble.length, worstWidthVar, perBubble }));

// 条间停顿：上一条打完 → 下一条开始出字，间隔 ≥1.0s（目标 1.2–2.0s）
const firstShownAt = {};
const doneAt = {};
for (const sp of series) {
  for (const v of sp.view || []) {
    if (v.shown > 0 && firstShownAt[v.k] == null) firstShownAt[v.k] = sp.t;
    if (v.len > 0 && v.shown >= v.len && doneAt[v.k] == null) doneAt[v.k] = sp.t;
  }
}
const keys = Object.keys(firstShownAt);
const gaps = [];
for (const k of keys) {
  const t2 = firstShownAt[k];
  const prevDone = Object.keys(doneAt).filter((x) => doneAt[x] <= t2).map((x) => doneAt[x]).sort((a, b) => b - a)[0];
  if (prevDone != null && t2 > prevDone) gaps.push({ key: k, gapMs: t2 - prevDone });
}
R.gaps = gaps;
t('UX-6', '相邻两条之间有停顿（≥1.0s）', gaps.length > 0 && gaps.every((g) => g.gapMs >= 1000), JSON.stringify(gaps));

// 出字速率（应比上一版 3.2s/条更慢）
const rate = [];
for (const k of Object.keys(firstShownAt)) {
  if (doneAt[k] != null && doneAt[k] > firstShownAt[k]) rate.push({ key: k, secs: Math.round(((doneAt[k] - firstShownAt[k]) / 100) / 10) });
}
R.rates = rate;

// 抢拍入口
R.buzz = series.some((s) => s.buzzBlock);
t('UX-7', '抢拍入口已隐藏（页面无「抢！」按钮）', !R.buzz);

/* ---------- 375px ---------- */
await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(900);
const m375 = await c.ev(`(() => ({
  vw: document.documentElement.clientWidth,
  scrollW: document.documentElement.scrollWidth,
  // .strip 是刻意横向滚动的席位条，不算页面溢出；这里只看对话/输入区/辅助库
  over: [...document.querySelectorAll('.chat *, .composer *, .assist-card *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0.5 && (r.right > document.documentElement.clientWidth + 0.5 || r.left < -0.5); }).slice(0, 6).map((el) => (el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().right))
}))()`);
R.m375 = m375;
t('UX-8', '375px 无横向溢出', !!(m375 && m375.scrollW <= m375.vw && (m375.over || []).length === 0), JSON.stringify(m375));
await c.shot('ux-375.png', 14000);

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
