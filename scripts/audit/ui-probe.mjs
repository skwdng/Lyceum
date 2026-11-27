/**
 * ui-probe.mjs -- B4 frontend playback acceptance probe (read-only)
 *
 *   node scripts/audit/ui-probe.mjs
 *
 * Server (must serve the on-disk build, not the jar copy):
 *   java -jar server/target/siyige-backend-0.1.0.jar --server.port=18091 \
 *        --spring.web.resources.static-locations=file:///D:/siyige/server/src/main/resources/static/
 * Edge:
 *   msedge --headless=new --remote-debugging-port=9341 --user-data-dir=C:\Windows\Temp\edge-audit-fe about:blank
 *
 * Output: target/audit-shots/probe-b4.json + b4-*.png
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
const results = {};
const t = (id, label, ok, detail) => {
  checks.push({ id, label, ok: !!ok, detail });
  log((ok ? 'PASS  ' : 'FAIL  ') + id + ' ' + label + (detail ? ' | ' + detail : ''));
};
const dump = () => {
  try { fs.writeFileSync(path.join(OUT, 'probe-b4.json'), JSON.stringify({ checks, results }, null, 2), 'utf8'); } catch (e) {}
};
setTimeout(() => { log('[watchdog] timeout, dump partial'); dump(); process.exit(2); }, 175000);

async function connect() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const pages = list.filter((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (pages.length) { target = pages[0]; break; }
    } catch (e) { /* not up */ }
    await sleep(200);
  }
  if (!target) throw new Error('no CDP page target on ' + CDP);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws timeout')), 5000); });
  let id = 0;
  const pend = new Map();
  const errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(String(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '')).split('\n')[0]);
    }
  };
  const send = (method, params = {}, ms = 5000) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return Promise.race([new Promise((r) => pend.set(mid, r)), sleep(ms).then(() => ({ __timeout: method }))]);
  };
  const ev = async (expr, ms = 5000) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms);
    if (!r || r.__timeout) return { __err: 'timeout' };
    if (r.exceptionDetails) return { __err: String(((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '')).split('\n')[0] };
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, 9000);
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot: ' + name); }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return { send, ev, shot, errs, close: () => ws.close() };
}

const SNAP = `(() => {
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  const dom = [...document.querySelectorAll('.chat .msg')].map((m) => {
    const hd = m.querySelector('.hd'); const bub = m.querySelector('.bub');
    return { head: hd ? hd.textContent.replace(/\\s+/g, ' ').trim() : '', len: bub ? (bub.textContent || '').length : 0,
      pending: !!(bub && bub.classList.contains('is-pending')) };
  });
  const btns = [...document.querySelectorAll('button')].filter((b) => /催一下|直接显示全文|催中/.test(b.textContent || ''));
  return {
    matchId: s ? s.matchId : null, kind: s ? s.kind : null, step: s && s.match ? s.match.step : null,
    waiting: s ? s.waiting : null, skipStep: s ? s.skipStep : null,
    canSkip: s ? s.canSkip() : null, hasTyping: s ? s.hasTyping() : null,
    turnsN: s ? s.turns.length : 0, typedKeys: s ? Object.keys(s.typed || {}) : [],
    view: s ? s.turnsView.map((v) => ({ k: v.key, step: v.step, seat: v.seat, len: (v.text || '').length, shown: v.shown, typing: v.typing, started: v.started })) : [],
    dom, btns: btns.map((b) => ({ text: b.textContent.trim().slice(0, 10), disabled: b.disabled })),
    net: (window.__net || []).slice(-12), toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim())
  };
})()`;

const okv = (v) => v && !v.__err;
const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

const acc = 'b4_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1600);
const prepExpr = `(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  if (!d.token) return { err: JSON.stringify(d).slice(0, 160) };
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['B2']));
  localStorage.setItem('sy_mode', 'STANDARD');
  localStorage.setItem('sy_pace', 'normal');
  localStorage.setItem('sy_tier', 'BASIC');
  localStorage.removeItem('sy_match');
  Object.keys(localStorage).filter((k) => k.indexOf('sy_typed_') === 0).forEach((k) => localStorage.removeItem(k));
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 900 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
  const tp = await (await fetch('/api/topics', { headers: H })).json();
  const list = Array.isArray(tp) ? tp : (tp.items || tp.topics || tp.list || []);
  const topicId = list.length ? list[0].id : null;
  const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify(topicId ? { topicId } : {}) })).json();
  return { account: '${acc}', topicId, matchId: m.matchId || (m.match && m.match.id) || m.id || null };
})()`;
let prep = await c.ev(prepExpr, 30000);
if (!okv(prep)) {
  log('prep retry after reload');
  await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(2500);
  prep = await c.ev(prepExpr, 30000);
}
results.prep = prep;
log('prep: ' + JSON.stringify(prep));
const matchId = prep && prep.matchId;
if (!matchId) { t('B4-0', 'create match', false, JSON.stringify(prep).slice(0, 200)); dump(); process.exit(1); }

// 注意：hash 变化不会重启应用，store 里可能还留着上一场的 matchId（深链会被忽略）。
// 这里带一个 cache-buster 查询串，强制整页重载，保证读的是 URL 里的新 matchId。
await c.send('Page.navigate', { url: BASE + '/v2/index.html?run=' + Date.now() + '#/match?match=' + matchId });
await sleep(1900);
let alive = (await c.ev('1+1')) === 2;
if (!alive) {
  log('page busy, re-navigate');
  await c.send('Page.navigate', { url: BASE + '/v2/index.html#/match?match=' + matchId });
  await sleep(2600);
}
await c.ev(`(() => { if (!window.__netPatched) { window.__net = []; const of = window.fetch.bind(window); window.fetch = (...a) => { try { window.__net.push(String((a[0] && a[0].url) || a[0])); } catch (e) {} return of(...a); }; window.__netPatched = true; } return true; })()`);

let s0 = null;
for (let i = 0; i < 30; i++) { s0 = await c.ev(SNAP); if (okv(s0) && s0.matchId) break; await sleep(250); }
results.boot = { matchId: s0 && s0.matchId, kind: s0 && s0.kind, step: s0 && s0.step, turns: s0 && s0.turnsN };
log('boot: ' + JSON.stringify(results.boot));
t('B4-0', 'reached match page with store', okv(s0) && !!s0.matchId, 'match=' + (s0 && s0.matchId));
t('B4-6a', 'kind whitelist (not "null")', ['solo', 'room'].includes(s0 && s0.kind), 'kind=' + (s0 && s0.kind));

// 新局第一步可能就轮到我说（取决于格式），先交一句，否则没有 AI 发言可采样
const pre = await c.ev(SNAP);
if (okv(pre) && pre.waiting) {
  await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = '我方判断：推荐算法的成本要由平台先承担，才谈得上公开口径。'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(300);
  const sent = await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => /发送/.test(x.textContent || '')); if (b && !b.disabled) { b.click(); return 1; } return 0; })()`);
  log('pre-submit: ' + JSON.stringify(sent) + ' (step ' + pre.step + ')');
}

const series = [];
const tStart = now();
let domeq = { ok: true, worst: '' };
let sawTyping = false;
let completedKeys = 0;
while (now() - tStart < 46000) {
  const x = await c.ev(SNAP);
  if (!okv(x)) break;
  series.push({ dt: now() - tStart, view: x.view, dom: x.dom, hasTyping: x.hasTyping, turnsN: x.turnsN });
  if (x.hasTyping) sawTyping = true;
  if (x.dom.length !== x.view.length || x.view.length !== x.turnsN) {
    if (domeq.ok) domeq = { ok: false, worst: 'dom=' + x.dom.length + ' view=' + x.view.length + ' turns=' + x.turnsN };
  }
  completedKeys = x.view.filter((v) => v.len > 0 && v.shown >= v.len && !v.me).length;
  if (sawTyping && !x.hasTyping && completedKeys >= 2 && series.length > 25) break;
  await sleep(110);
}
results.seriesLen = series.length;
results.domVsTurns = domeq;
let multiGrow = 0;
const perKey = {};
for (let i = 1; i < series.length; i++) {
  const prev = series[i - 1].view;
  let grown = 0;
  for (const v of series[i].view) {
    const old = prev.find((p) => p.k === v.k);
    if (old && v.shown > old.shown) grown++;
  }
  if (grown > 1) multiGrow++;
}
for (const sp of series) {
  for (const v of sp.view) {
    perKey[v.k] = perKey[v.k] || { len: v.len, pts: [] };
    perKey[v.k].len = Math.max(perKey[v.k].len, v.len);
    perKey[v.k].pts.push({ dt: sp.dt, shown: v.shown });
  }
}
let regress = 0;
const durations = [];
for (const k of Object.keys(perKey)) {
  const v = perKey[k];
  let prev = null; let first = null;
  for (const p of v.pts) {
    if (p.shown > 0 && first == null) first = p.dt;
    if (prev != null && p.shown < prev) regress++;
    prev = p.shown;
  }
  const done = v.pts.find((p) => p.shown >= v.len && v.len > 0);
  if (done && first != null) durations.push({ key: k, len: v.len, secs: Math.round(((done.dt - first) / 1000) * 10) / 10 });
}
results.perKey = Object.keys(perKey).map((k) => ({ key: k, len: perKey[k].len, samples: perKey[k].pts.length, first: perKey[k].pts[0].shown, last: perKey[k].pts[perKey[k].pts.length - 1].shown }));
results.multiGrowSamples = multiGrow;
results.regress = regress;
results.durations = durations;
t('B4-1', 'only one bubble grows at a time', multiGrow === 0, 'violations=' + multiGrow + ' samples=' + series.length);
t('B4-2', 'length never regresses', regress === 0, 'regressions=' + regress);
t('B4-3', 'bubble count == turns count', domeq.ok, domeq.ok ? '' : domeq.worst);
t('B4-5', 'single turn done in <=5s (FE-2)', durations.length > 0 && durations.every((d) => d.secs <= 5.2), JSON.stringify(durations.slice(0, 3)));
await c.shot('b4-typing.png');

const s1 = await c.ev(SNAP);
const api = await c.ev(`(async () => {
  const tk = localStorage.getItem('sy_jwt');
  const r = await fetch('/api/matches/${matchId}', { headers: { Authorization: 'Bearer ' + tk } });
  const d = await r.json();
  return { turns: (d.turns || []).map((x) => ({ step: x.step, seat: x.seat, chars: (x.content || '').length })) };
})()`, 8000);
const apiSeq = ((api && api.turns) || []).map((x) => x.step + '|' + x.seat);
const viewSeq = ((s1 && s1.view) || []).map((x) => x.step + '|' + x.seat);
results.apiSeq = apiSeq;
results.viewSeq = viewSeq;
t('B4-4', 'bubble (step,seat) == API order', apiSeq.length > 0 && JSON.stringify(apiSeq) === JSON.stringify(viewSeq), apiSeq.join(' ') + ' vs ' + viewSeq.join(' '));

const nudge = { sawWindow: false, skipCalls: 0, toast: [] };
for (let i = 0; i < 240 && now() - tStart < 150000; i++) {
  const x = await c.ev(SNAP);
  if (!okv(x)) break;
  if (x.waiting) {
    await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = '我方判断：成本要由平台先承担，否则推荐口径无法核查。'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await sleep(300);
    await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => /发送/.test(x.textContent || '')); if (b && !b.disabled) { b.click(); return 1; } return 0; })()`);
    for (let j = 0; j < 14; j++) {
      const y = await c.ev(SNAP);
      if (!okv(y)) break;
      const nb = (y.btns || []).find((b) => /催一下/.test(b.text));
      if (!y.waiting && nb && !nb.disabled) {
        nudge.sawWindow = true;
        await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /催一下|直接显示全文/.test(x.textContent || '')); if (b) b.click(); return 1; })()`);
        await sleep(900);
        const z = await c.ev(SNAP);
        nudge.skipCalls = ((z && z.net) || []).filter((u) => u.includes('/skip')).length;
        nudge.toast = (z && z.toast) || [];
        await c.shot('b4-nudge.png');
        break;
      }
      await sleep(220);
    }
    break;
  }
  await sleep(300);
}
results.nudge = nudge;
t('B4-6b', 'nudge while thinking really sends /skip', nudge.sawWindow && nudge.skipCalls > 0, nudge.sawWindow ? 'skip=' + nudge.skipCalls + ' toast=' + JSON.stringify(nudge.toast) : 'window not reached (not measured)');

const before = await c.ev(SNAP);
const typedBefore = ((before && before.typedKeys) || []);
await c.shot('b4-before-reload.png');
await c.send('Page.reload');
await sleep(1300);
let after = null;
for (let i = 0; i < 30; i++) { const x = await c.ev(SNAP); if (okv(x) && x.view.length) { after = x; break; } await sleep(200); }
const replayed = after ? after.view.filter((v) => typedBefore.includes(v.k) && v.shown < v.len) : [];
results.reload = { typedBefore: typedBefore.length, typedAfter: after ? (after.typedKeys || []).length : null, replayed: replayed.map((r) => r.k) };
t('B4-7', 'no full replay after F5', typedBefore.length > 0 && replayed.length === 0, 'typedBefore=' + typedBefore.length + ' replayed=' + replayed.length);
await c.shot('b4-after-reload.png');

await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(900);
const mob = await c.ev(`(() => {
  const de = document.documentElement;
  const over = [];
  document.querySelectorAll('.chat *, .composer *, .stage *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0.5 && (r.right > de.clientWidth + 0.5 || r.left < -0.5)) over.push(String(el.className || el.tagName).slice(0, 30));
  });
  const ta = document.querySelector('.composer textarea');
  const r = ta ? ta.getBoundingClientRect() : null;
  return { vw: de.clientWidth, scrollW: de.scrollWidth, overflow: over.length, overflowList: over.slice(0, 5),
    textareaVisible: r ? (r.bottom <= window.innerHeight + 1 && r.top >= 0) : null,
    textareaTop: r ? Math.round(r.top) : null, textareaBottom: r ? Math.round(r.bottom) : null };
})()`);
results.mobile = mob;
t('B4-8', '375px no horizontal overflow', mob && mob.scrollW <= mob.vw && mob.overflow === 0, JSON.stringify(mob));
t('B4-9', '375px composer in viewport', mob && mob.textareaVisible === true, 'top=' + (mob && mob.textareaTop) + ' bottom=' + (mob && mob.textareaBottom));
await c.shot('b4-375.png');

results.consoleErrs = c.errs.slice(0, 8);
dump();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (results.consoleErrs.length ? JSON.stringify(results.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
