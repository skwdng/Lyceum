/**
 * matches-probe.mjs -- 验收「对局」板块 + 催一下按钮（只读探针）
 *
 *   node scripts/audit/matches-probe.mjs
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
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-matches.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
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
  const shot = async (name, ms = 10000) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, ms);
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot: ' + name); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, ev, shot, errs, close: () => ws.close() };
}

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/* ---------- 准备：注册 + 3 场单人局 ---------- */
const acc = 'mv_' + Math.floor(Math.random() * 900000 + 10000);
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
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 5000 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 5000, sign: o.sign }) });
  const tp = await (await fetch('/api/topics', { headers: H })).json();
  const list = (Array.isArray(tp) ? tp : (tp.items || [])).slice(0, 3);
  const ids = [];
  for (const x of list) {
    const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: x.id }) })).json();
    ids.push(m.matchId || (m.match && m.match.id));
  }
  const mine = await (await fetch('/api/matches/mine', { headers: H })).json();
  return { account: '${acc}', created: ids, mineN: Array.isArray(mine) ? mine.length : null };
})()`, 30000);
R.prep = prep;
log('prep: ' + JSON.stringify(prep));
if (!prep || !prep.created || prep.created.length < 3) { t('MV-0', '建 3 场单人局', false, JSON.stringify(prep).slice(0, 200)); save(); process.exit(1); }

const MINE = `(() => {
  const rows = [...document.querySelectorAll('.mv-row')].map((r) => ({
    title: (r.querySelector('.mv-title') || {}).textContent || '',
    metas: [...r.querySelectorAll('.mv-kv')].map((x) => x.textContent.trim()),
    acts: [...r.querySelectorAll('button')].map((b) => b.textContent.trim())
  }));
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  const listBox = document.querySelector('.mv-list');
  return {
    hash: location.hash, rows, n: rows.length,
    empty: !!document.querySelector('.mv-empty'),
    scrollable: !!(listBox && listBox.classList.contains('scroll')),
    listScroll: listBox ? { sh: listBox.scrollHeight, ch: listBox.clientHeight } : null,
    vw: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth,
    storeMatchId: s ? s.matchId : null,
    toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim())
  };
})()`;

async function goMatches() {
  await c.ev(`(() => { location.hash = '#/matches'; return 1; })()`);
  await sleep(1500);
  if (!(await c.ev('1+1')) === 2) { await sleep(800); }
}
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/matches' });
await sleep(1900);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/matches' }); await sleep(2300); }
let st = await c.ev(MINE);
for (let i = 0; i < 20 && (!st || st.__err || st.n < 3); i++) { await sleep(400); st = await c.ev(MINE); }
R.list3 = st;
t('MV-1', '#/matches 显示 3 条未完成对局', st && st.n === 3, 'n=' + (st && st.n) + ' rows=' + JSON.stringify((st && st.rows || []).slice(0, 2)));
t('MV-2', '每行有辩题/步数/席位/模式', !!(st && st.rows[0] && /第 \d+\/\d+ 步/.test(st.rows[0].metas.join(' ')) && /单人|房间/.test(st.rows[0].metas.join(' '))), JSON.stringify(st && st.rows[0]));
await c.shot('matches-list.png');

/* ---------- 继续 ---------- */
const firstId = prep.created[0];
const resumed = await c.ev(`(() => { const b = [...document.querySelectorAll('.mv-row button')].find((x) => x.textContent.trim() === '继续'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(2200);
let mst = await c.ev(MINE);
for (let i = 0; i < 20 && mst && !/^#\/match/.test(mst.hash || ''); i++) { await sleep(400); mst = await c.ev(MINE); }
R.afterResume = { clicked: resumed, hash: mst && mst.hash, storeMatchId: mst && mst.storeMatchId };
t('MV-3', '点「继续」进入对局页', !!(mst && /^#\/match/.test(mst.hash || '')), 'hash=' + (mst && mst.hash));
t('MV-4', '进入的是被点的那一场', !!(mst && firstId && String(mst.storeMatchId) === String(firstId)), 'store=' + (mst && mst.storeMatchId) + ' want=' + firstId);
await c.shot('match-after-resume.png');

/* ---------- 返回 + 删除 ---------- */
await goMatches();
let st2 = await c.ev(MINE);
for (let i = 0; i < 20 && (!st2 || st2.n < 3); i++) { await sleep(400); st2 = await c.ev(MINE); }
R.backToList = st2 && { n: st2.n };
await c.ev(`(() => { window.confirm = () => true; return 1; })()`);
const delClicked = await c.ev(`(() => { const b = [...document.querySelectorAll('.mv-row button')].find((x) => x.textContent.trim() === '删除'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(2000);
let st3 = await c.ev(MINE);
for (let i = 0; i < 20 && st3 && st3.n !== 2; i++) { await sleep(400); st3 = await c.ev(MINE); }
R.afterDelete = { clicked: delClicked, n: st3 && st3.n, toast: st3 && st3.toast };
t('MV-5', '删除一条后剩 2 条', !!(st3 && st3.n === 2), 'n=' + (st3 && st3.n));
await c.shot('matches-after-delete.png');

/* ---------- 12 条：页面内滚动 + 375px ---------- */
const bulk = await c.ev(`(async () => {
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('sy_jwt') };
  let ok = 0, lastErr = '';
  for (let i = 0; i < 10; i++) {
    const r = await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: 't3' }) });
    const m = await r.json();
    if (m && (m.matchId || (m.match && m.match.id))) ok++;
    else { lastErr = JSON.stringify(m).slice(0, 120); break; }
  }
  const mine = await (await fetch('/api/matches/mine', { headers: H })).json();
  return { ok, lastErr, n: Array.isArray(mine) ? mine.length : null };
})()`, 60000);
R.bulk = bulk;
// 注意：hash 没变（还在 #/matches）时组件不会重新挂载，列表会是旧的——这里整页重载拿新数据
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/matches' });
await sleep(2100);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/matches' }); await sleep(2300); }
let st4 = await c.ev(MINE);
for (let i = 0; i < 25 && (!st4 || st4.__err || st4.n < 11); i++) { await sleep(400); st4 = await c.ev(MINE); }
R.many = st4 && { n: st4.n, scrollable: st4.scrollable, listScroll: st4.listScroll };
t('MV-6', '多于 10 条时列表内部滚动', !!(st4 && st4.n > 10 && st4.scrollable && st4.listScroll && st4.listScroll.sh > st4.listScroll.ch), JSON.stringify(R.many));

await c.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(900);
const m375 = await c.ev(MINE);
R.m375 = m375 && { vw: m375.vw, scrollW: m375.scrollW, n: m375.n };
t('MV-7', '375px 无横向溢出', !!(m375 && m375.scrollW <= m375.vw), 'vw=' + (m375 && m375.vw) + ' scrollW=' + (m375 && m375.scrollW));
await c.shot('matches-375.png', 12000);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await sleep(400);

/* ---------- 催一下 5 步 ---------- */
const NUDGE_SNAP = `(() => {
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  const btn = [...document.querySelectorAll('button')].find((b) => /催一下|直接显示全文|催中/.test(b.textContent || ''));
  return {
    hash: location.hash, waiting: s ? s.waiting : null, hasTyping: s ? s.hasTyping() : null,
    canSkip: s ? s.canSkip() : null, kind: s ? s.kind : null,
    btn: btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null,
    typing: s ? s.turnsView.filter((v) => v.typing).map((v) => ({ k: v.key, shown: v.shown, len: v.len })) : [],
    typedN: s ? Object.keys(s.typed || {}).length : null,
    toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim())
  };
})()`;

const nid = prep.created[1];
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + nid });
await sleep(1900);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/match?match=' + nid }); await sleep(2300); }

let n0 = null;
// 若当前轮到我说：先交一句，制造出「AI 还没开口」的窗口（这时按钮是「催一下」且可点）
const warm = await c.ev(NUDGE_SNAP);
if (warm && warm.waiting) {
  await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = '我方判断：平台要先把推荐口径公开，才谈得上问责。'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(300);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => x.textContent.trim() === '结束发言'); if (b && !b.disabled) { b.click(); return 1; } return 0; })()`);
  await sleep(700);
}
for (let i = 0; i < 60; i++) {
  n0 = await c.ev(NUDGE_SNAP);
  if (n0 && !n0.__err && !n0.waiting && n0.btn && /催一下|直接显示全文/.test(n0.btn.text)) break;
  await sleep(300);
}
R.nudgeStep1 = n0;
t('ND-1', 'AI 思考时能看到可点的「催一下」', !!(n0 && !n0.waiting && n0.btn), JSON.stringify(n0 && { btn: n0.btn, waiting: n0.waiting, hasTyping: n0.hasTyping }));
// 点一下，确认按钮没消失
const click1 = await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /催一下|直接显示全文/.test(x.textContent || '')); if (!b) return 'no-btn'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
await sleep(700);
const n1 = await c.ev(NUDGE_SNAP);
R.nudgeStep2 = { clicked: click1, after: n1 && { btn: n1.btn, hasTyping: n1.hasTyping, toast: n1.toast } };
t('ND-2', '点完之后按钮还在（不消失）', !!(n1 && n1.btn), 'clicked=' + click1 + ' btn=' + JSON.stringify(n1 && n1.btn));

// 等 AI 开始打字 → 文案应变「直接显示全文」
let n2 = null;
for (let i = 0; i < 80; i++) {
  n2 = await c.ev(NUDGE_SNAP);
  if (n2 && n2.hasTyping) break;
  await sleep(250);
}
R.nudgeStep3 = n2 && { hasTyping: n2.hasTyping, btn: n2.btn, typing: n2.typing };
t('ND-3', 'AI 开始打字后按钮变「直接显示全文」', !!(n2 && n2.hasTyping && n2.btn && n2.btn.text === '直接显示全文'), JSON.stringify(n2 && n2.btn) + ' typing=' + JSON.stringify(n2 && n2.typing));
await c.shot('nudge-typing.png');

// 点「直接显示全文」→ 文字立即补全
const beforeFill = n2 && n2.typing && n2.typing[0] ? n2.typing[0].shown : null;
const click2 = await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /直接显示全文/.test(x.textContent || '')); if (!b) return 'no-btn'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
await sleep(350);
const n3 = await c.ev(NUDGE_SNAP);
R.nudgeStep4 = { clicked: click2, beforeFill, after: { hasTyping: n3 && n3.hasTyping, btn: n3 && n3.btn, toast: n3 && n3.toast } };
t('ND-4', '点完立刻补全（不再逐字）', !!(n3 && n3.hasTyping === false), 'clicked=' + click2 + ' hasTyping=' + (n3 && n3.hasTyping));
await c.shot('nudge-fill.png');

// 下一步还能再点：等到下一次 AI 回合的按钮可点
let n4 = null;
for (let i = 0; i < 120; i++) {
  n4 = await c.ev(NUDGE_SNAP);
  if (n4 && n4.btn && !n4.btn.disabled && /催一下|直接显示全文/.test(n4.btn.text)) break;
  await sleep(300);
}
R.nudgeStep5 = n4 && { btn: n4.btn, canSkip: n4.canSkip, hasTyping: n4.hasTyping, waiting: n4.waiting };
t('ND-5', '下一步按钮仍可点（没有被永久隐藏）', !!(n4 && n4.btn && !n4.btn.disabled), JSON.stringify(n4 && n4.btn));

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
