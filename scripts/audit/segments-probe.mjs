/**
 * segments-probe.mjs -- 验收「分段发言 + 结束发言」与「进行中的对局」（只读探针，不改主代码）
 *
 *   node scripts/audit/segments-probe.mjs
 *
 * 前置：
 *   java -jar server/target/siyige-backend-0.1.0.jar --server.port=18091 \
 *        --spring.web.resources.static-locations=file:///D:/siyige/server/src/main/resources/static/
 *   msedge --headless=new --remote-debugging-port=9341 --user-data-dir=C:\Windows\Temp\edge-audit-fe about:blank
 *
 * 产出：target/audit-shots/seg-*.png、probe-segments.json
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
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-segments.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
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
  const send = (method, params = {}, ms = 5000) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return Promise.race([new Promise((r) => pend.set(mid, r)), sleep(ms).then(() => ({ __timeout: method }))]);
  };
  const ev = async (expr, ms = 6000) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms);
    if (!r || r.__timeout) return { __err: 'timeout' };
    if (r.exceptionDetails) return { __err: String(((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '')).split('\n')[0] };
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, 9000);
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot: ' + name); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, ev, shot, errs, close: () => ws.close() };
}

const STATE = `(() => {
  const ta = document.querySelector('.composer textarea');
  const segs = [...document.querySelectorAll('.segs .seg')].map((s) => (s.querySelector('.seg-tx') || {}).textContent || '');
  const bc = [...document.querySelectorAll('.composer button')].map((b) => ({ text: b.textContent.trim().slice(0, 8), disabled: b.disabled }));
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  return {
    url: location.hash,
    draftLen: ta ? (ta.value || '').length : null,
    draft: ta ? (ta.value || '') : null,
    segs, segCount: segs.length,
    buttons: bc,
    waiting: s ? s.waiting : null,
    turnsN: s ? s.turns.length : null,
    matchId: s ? s.matchId : null,
    toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim()),
    myRows: [...document.querySelectorAll('.myrow')].map((r) => ({ tt: (r.querySelector('.mytt') || {}).textContent, meta: (r.querySelector('.mymeta') || {}).textContent }))
  };
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/* ---------- 准备：注册 + 建局 ---------- */
const acc = 'seg_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1600);
const prep = await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  if (!d.token) return { err: JSON.stringify(d).slice(0, 150) };
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['B2']));
  localStorage.setItem('sy_mode', 'STANDARD');
  localStorage.setItem('sy_tier', 'BASIC');
  localStorage.removeItem('sy_match');
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 900 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
  const tp = await (await fetch('/api/topics', { headers: H })).json();
  const list = Array.isArray(tp) ? tp : (tp.items || []);
  const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: list[0] && list[0].id }) })).json();
  return { account: '${acc}', matchId: m.matchId || (m.match && m.match.id) || m.id, mine: null };
})()`, 30000);
R.prep = prep;
log('prep: ' + JSON.stringify(prep));
const matchId = prep && prep.matchId;
if (!matchId) { t('SEG-0', '建局', false, JSON.stringify(prep).slice(0, 200)); save(); process.exit(1); }

await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + matchId });
await sleep(1900);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/match?match=' + matchId }); await sleep(2400); }

/* ---------- 等我回合 ---------- */
let st = null;
for (let i = 0; i < 90; i++) {
  st = await c.ev(STATE);
  if (st && !st.__err && st.matchId === matchId && st.waiting) break;
  await sleep(400);
}
R.waitTurn = st && { waiting: st.waiting, step: null, buttons: st.buttons };
t('SEG-1', '轮到我时「结束发言」可用、「发送」也可用', !!(st && st.waiting) && st.buttons.some((b) => b.text === '结束发言' && !b.disabled) === false /* 空内容时应禁用 */, JSON.stringify(st && st.buttons));

/* ---------- 发送第一段 ---------- */
async function setDraft(text) {
  await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input', { bubbles: true })); return ta.value.length; })()`);
  await sleep(250);
}
async function clickBtn(label) {
  return await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return 'no-btn'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
}
await setDraft('第一段：我方判断是平台先把推荐口径公开，才谈得上问责。');
const s1before = await c.ev(STATE);
const c1 = await clickBtn('发送');
await sleep(400);
const s1 = await c.ev(STATE);
R.seg1 = { clicked: c1, beforeLen: s1before.draftLen, afterLen: s1.draftLen, segCount: s1.segCount, segs: s1.segs };
t('SEG-2', '发送后输入框立刻清空', s1.draftLen === 0, 'draftLen=' + s1.draftLen);
t('SEG-3', '发送后出现 1 个分段', s1.segCount === 1 && String(s1.segs[0] || '').startsWith('第一段'), JSON.stringify(s1.segs).slice(0, 120));

/* ---------- 发送第二段 ---------- */
await setDraft('第二段：如果平台不公开口径，用户没有可核查的依据，成本仍然落在用户身上。');
await clickBtn('发送');
await sleep(400);
const s2 = await c.ev(STATE);
R.seg2 = { draftLen: s2.draftLen, segCount: s2.segCount, segs: s2.segs.map((x) => x.slice(0, 12)) };
t('SEG-4', '第二段也攒进去（2 段）且输入框清空', s2.segCount === 2 && s2.draftLen === 0, JSON.stringify(s2.segs.map((x) => x.slice(0, 10))));
await c.shot('seg-two.png');

/* ---------- 结束发言 ---------- */
const turnsBefore = s2.turnsN;
const c3 = await clickBtn('结束发言');
await sleep(1800);
const s3 = await c.ev(STATE);
const turnsAfter = await c.ev(`(async () => {
  const r = await fetch('/api/matches/${matchId}', { headers: { Authorization: 'Bearer ' + localStorage.getItem('sy_jwt') } });
  const d = await r.json();
  return { n: (d.turns || []).length, last: ((d.turns || []).slice(-1)[0] || {}).content || '' };
})()`, 9000);
R.end = { clicked: c3, segCount: s3.segCount, draftLen: s3.draftLen, turnsBefore, turnsAfter: turnsAfter && turnsAfter.n, lastContent: (turnsAfter && turnsAfter.last || '').slice(0, 80) };
t('SEG-5', '结束发言后分段消失', s3.segCount === 0, 'segs=' + s3.segCount);
t('SEG-6', '结束发言后输入框清空', s3.draftLen === 0, 'draftLen=' + s3.draftLen);
t('SEG-7', '服务端 turns +1', !!(turnsAfter && turnsAfter.n > turnsBefore), turnsBefore + ' -> ' + (turnsAfter && turnsAfter.n));
t('SEG-8', '提交内容 = 两段按空行拼接', !!(turnsAfter && /第一段[\s\S]*\n\n[\s\S]*第二段/.test(turnsAfter.last)), JSON.stringify(((turnsAfter && turnsAfter.last) || '').slice(0, 60)));
await c.shot('seg-after-end.png');

/* ---------- 单人页：进行中的对局 ---------- */
await c.ev(`(() => { location.hash = '#/solo'; return 1; })()`);
await sleep(2200);
const solo = await c.ev(STATE);
R.solo = { myRows: solo.myRows, url: solo.url };
t('SEG-9', '单人页出现「进行中的对局」列表', (solo.myRows || []).length > 0, JSON.stringify(solo.myRows).slice(0, 160));
const mineApi = await c.ev(`(async () => {
  const r = await fetch('/api/matches/mine', { headers: { Authorization: 'Bearer ' + localStorage.getItem('sy_jwt') } });
  const d = await r.json();
  return { status: r.status, keys: d && !Array.isArray(d) ? Object.keys(d) : null, n: Array.isArray(d) ? d.length : (d && (d.items || d.matches || []).length) };
})()`, 9000);
R.mineApi = mineApi;
t('SEG-10', 'GET /api/matches/mine 可用', mineApi && mineApi.status === 200, JSON.stringify(mineApi));
await c.shot('solo-my-matches.png');

/* ---------- 删除 ---------- */
await c.ev(`(() => { window.confirm = () => true; return 1; })()`);
const delClicked = await c.ev(`(() => {
  const rows = [...document.querySelectorAll('.myrow')];
  const row = rows.find((r) => (r.querySelector('.mytt') || {}).textContent) || rows[0];
  if (!row) return 'no-row';
  const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === '删除');
  if (!b) return 'no-del';
  b.click();
  return 'clicked';
})()`);
await sleep(1800);
const afterDel = await c.ev(STATE);
const listAfter = await c.ev(`(async () => {
  const r = await fetch('/api/matches/mine', { headers: { Authorization: 'Bearer ' + localStorage.getItem('sy_jwt') } });
  const d = await r.json();
  const list = Array.isArray(d) ? d : (d && (d.items || d.matches || [])) || [];
  return { n: list.length, ids: list.map((x) => x.id || x.matchId) };
})()`, 9000);
R.del = { clicked: delClicked, rowsAfter: afterDel.myRows.length, apiAfter: listAfter };
t('SEG-11', '删除后列表里消失', afterDel.myRows.length < (solo.myRows || []).length, 'rows ' + (solo.myRows || []).length + ' -> ' + afterDel.myRows.length + ' api=' + JSON.stringify(listAfter));
await c.shot('solo-after-delete.png');

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
