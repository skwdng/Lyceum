/**
 * room-probe.mjs -- 多人房前端验收：选座加入 / 分享短链 / 复制邀请 / 抢座 409
 *
 *   node scripts/audit/room-probe.mjs
 *
 * 后端现状（本脚本会如实记录）：
 *   · GET /api/rooms/{code}        可用
 *   · POST .../join {seat}         目前**忽略 seat**（要 B2 却坐到 B1/A2），也没有 409
 *   · POST /api/shortlinks         404
 * 所以「选座成功」和「抢座 409」用页面内 fetch 拦截模拟后端，其余走真后端。
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:18091';
const CDP = 9341;
const OUT = 'D:/siyige/target/audit-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const checks = [];
const R = {};
const t = (id, label, ok, detail) => {
  checks.push({ id, label, ok: !!ok, detail });
  log((ok ? 'PASS  ' : 'FAIL  ') + id + ' ' + label + (detail ? ' | ' + String(detail).slice(0, 220) : ''));
};
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-room.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
setTimeout(() => { log('[watchdog] timeout'); save(); process.exit(2); }, 220000);

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
  const send = (method, params = {}, ms = 8000) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return Promise.race([new Promise((r) => pend.set(mid, r)), sleep(ms).then(() => ({ __timeout: method }))]);
  };
  const ev = async (expr, ms = 9000) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms);
    if (!r || r.__timeout) return { __err: 'timeout' };
    if (r.exceptionDetails) return { __err: String(((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '')).split('\n')[0] };
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name, ms = 14000) => {
    const s = await send('Page.captureScreenshot', { format: 'png' }, ms);
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot: ' + name); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, ev, shot, errs, close: () => ws.close() };
}

const STATE = `(() => {
  const txt = (sel) => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\\s+/g, ' ').trim() : ''; };
  const seatCards = [...document.querySelectorAll('.seatcard')].map((b) => ({ k: (b.querySelector('.sk') || {}).textContent, so: (b.querySelector('.so') || {}).textContent, disabled: b.disabled }));
  const strip = [...document.querySelectorAll('.strip .sp')].map((s) => ({
    nm: (s.querySelector('.nm') || {}).textContent || '', me: s.className.indexOf('me') >= 0
  }));
  return {
    hash: location.hash,
    roomCode: (document.querySelector('.mono') || {}).textContent || '',
    inRoom: !!document.querySelector('.strip .sp'),
    peek: !!document.querySelector('.peek'),
    seatCards,
    peekMine: txt('.peek-mine'),
    joinInput: (document.querySelector('input[placeholder="SY-XXXX"]') || {}).value || '',
    share: {
      open: !!document.querySelector('.sh-box'),
      text: txt('.sh-box'),
      rows: [...document.querySelectorAll('.sh-row .sh-v')].map((x) => x.textContent.trim())
    },
    mySeat: (() => {
      const me = [...document.querySelectorAll('.strip .sp')].find((s) => s.className.indexOf('me') >= 0);
      return me ? ((me.querySelector('.nm') || {}).textContent || '') + '|' + ((me.querySelector('.rl') || {}).textContent || '') : '';
    })(),
    toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim())
  };
})()`;

const HOOK = `(() => {
  if (window.__roomHook) return 'already';
  window.__roomHook = { joinMode: null, lastDetail: null, fakeDetail: null };
  const of = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (window.__roomHook.joinMode && /\\/api\\/rooms\\/[^/]+\\/join$/.test(url)) {
      const mode = window.__roomHook.joinMode;
      if (mode === '409') {
        return new Response(JSON.stringify({ code: 'SEAT_TAKEN', message: '座位已被占' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      const base = window.__roomHook.lastDetail || { room: {}, seats: [] };
      let seat = '';
      try { seat = JSON.parse((init && init.body) || '{}').seat || ''; } catch (e) {}
      const seats = (base.seats || []).map((s) => (s.seat_key === seat ? { ...s, occupant: 'USER', user_id: 'u_B', user_name: '测试B', ready: false } : s));
      const body = { ...base, seats, mySeat: seat, isHost: false };
      window.__roomHook.fakeDetail = body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const res = await of(input, init);
    if (window.__roomHook.fakeDetail && /\\/api\\/rooms\\/[^/?#]+$/.test(url) && (!init || !init.method || String(init.method).toUpperCase() === 'GET')) {
      return new Response(JSON.stringify(window.__roomHook.fakeDetail), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\\/api\\/rooms\\/[^/?#]+$/.test(url) && (!init || !init.method || String(init.method).toUpperCase() === 'GET')) {
      try { window.__roomHook.lastDetail = await res.clone().json(); } catch (e) {}
    }
    return res;
  };
  return 'hooked';
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

/* ---------- 账号 A：建房 + 分享 ---------- */
const accA = 'ra_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1500);
const prepA = await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${accA}', password: 'Test123456' }) });
  const d = await r.json();
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 900 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
  return { account: '${accA}' };
})()`, 20000);
R.prepA = prepA;

await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/room' });
await sleep(2000);
if ((await c.ev('1+1')) !== 2) { await sleep(1200); }
const createClick = await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /建房/.test(x.textContent || '')); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(1800);
let st = await c.ev(STATE);
for (let i = 0; i < 10 && (!st || !st.inRoom); i++) { await sleep(500); st = await c.ev(STATE); }
R.roomA = { createClick, inRoom: st && st.inRoom, mySeat: st && st.mySeat, code: st && st.roomCode };
t('RM-1', '建房后进入房间视图', !!(st && st.inRoom), JSON.stringify(R.roomA));
const code = (st && st.roomCode || '').match(/SY-[A-Z0-9]+/);
const roomCode = code ? code[0] : '';
R.roomCode = roomCode;
log('roomCode:', roomCode);

/* 分享邀请：后端 404 → 回退长链接 */
const shareClick = await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '分享邀请'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(1600);
const stShare = await c.ev(STATE);
R.shareOpen = { clicked: shareClick, open: stShare && stShare.share.open, rows: stShare && stShare.share.rows, text: stShare && stShare.share.text };
t('RM-2', '「分享邀请」弹出分享层', !!(stShare && stShare.share.open), JSON.stringify(R.shareOpen.rows));
const hasLong = !!(stShare && stShare.share.rows || []).some((x) => /#\/room\?join=SY-/.test(x));
t('RM-3', '短链接口不可用/失败 → 回退显示完整长链接', hasLong, JSON.stringify(stShare && stShare.share.rows));
// 复制按钮
/* 复制按钮：先把 clipboard 打桩（无头浏览器默认拒绝剪贴板），验证「已复制」+ 复制内容正确 */
await c.ev(`(() => {
  window.__copied = [];
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } }
    });
  } catch (e) {}
  return 1;
})()`);
const copyClick = await c.ev(`(() => { const box = document.querySelector('.sh-box'); if (!box) return 'no-box'; const b = [...box.querySelectorAll('button')].find((x) => x.textContent.trim() === '复制'); if (!b) return 'no-copy'; b.click(); return 'clicked'; })()`);
await sleep(700);
const stCopy = await c.ev(STATE);
const copied = await c.ev('window.__copied');
R.copy = { clicked: copyClick, toast: stCopy && stCopy.toast, copied };
t('RM-4', '点「复制」有反馈且复制到正确链接', !!(stCopy && (stCopy.toast || []).some((x) => /已复制/.test(x)) && (copied || []).some((x) => /#\/room\?join=/.test(x))), JSON.stringify(R.copy));
await c.shot('room-share.png');
await c.ev(`(() => { const b = [...document.querySelectorAll('.sh-box button')].find((x) => x.textContent.trim() === '关闭'); if (b) b.click(); return 1; })()`);
await sleep(400);

/* 顶部「复制邀请链接」 */
const topCopy = await c.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '复制邀请链接'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(1500);
const stTop = await c.ev(STATE);
R.topCopy = { clicked: topCopy, open: stTop && stTop.share.open, toast: stTop && stTop.toast };
t('RM-5', '顶部「复制邀请链接」走短链流程并复制', !!(topCopy === 'clicked' && stTop && stTop.share.open && (stTop.toast || []).some((x) => /复制/.test(x))), JSON.stringify(R.topCopy));
await c.ev(`(() => { const b = [...document.querySelectorAll('.sh-box button')].find((x) => x.textContent.trim() === '关闭'); if (b) b.click(); return 1; })()`);

/* ---------- 账号 B：分享链接进来 → 不自动加入，先看空位 ---------- */
const accB = 'rb_' + Math.floor(Math.random() * 900000 + 10000);
await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${accB}', password: 'Test123456' }) });
  const d = await r.json();
  localStorage.setItem('sy_jwt', d.token);
  localStorage.removeItem('sy_match');
  return !!d.token;
})()`, 20000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/room?join=' + encodeURIComponent(roomCode) });
await sleep(2000);
if ((await c.ev('1+1')) !== 2) { await sleep(1200); }
await c.ev(HOOK);
const stPeek = await c.ev(STATE);
R.peek = { inRoom: stPeek && stPeek.inRoom, peek: stPeek && stPeek.peek, input: stPeek && stPeek.joinInput, cards: stPeek && (stPeek.seatCards || []).length };
t('RM-6', '分享链接进入**不自动占座**，只预填房间号并打开空位面板', !!(stPeek && !stPeek.inRoom && stPeek.peek && stPeek.joinInput === roomCode), JSON.stringify({ inRoom: stPeek && stPeek.inRoom, input: stPeek && stPeek.joinInput }));
t('RM-7', '空位面板渲染 8 个座位卡（空位/已占）', !!(stPeek && (stPeek.seatCards || []).length === 8), JSON.stringify(stPeek && stPeek.seatCards));
await c.shot('room-seats.png');

/* 抢座 409（模拟后端） */
await c.ev(`(() => { window.__roomHook.joinMode = '409'; return 1; })()`);
const click409 = await c.ev(`(() => { const b = [...document.querySelectorAll('.seatcard')].find((x) => !x.disabled && /B2/.test(x.textContent)); if (!b) return 'no-free'; b.click(); return 'clicked'; })()`);
await sleep(1200);
const st409 = await c.ev(STATE);
R.s409 = { clicked: click409, toast: st409 && st409.toast, stillPeek: st409 && st409.peek };
t('RM-8', '座位被抢 → 提示「这个位置刚被占了」并留在空位面板', !!(st409 && (st409.toast || []).some((x) => /刚被占了/.test(x)) && st409.peek), JSON.stringify(R.s409));

/* 选座成功（模拟后端返回 mySeat=B2） */
await c.ev(`(() => { window.__roomHook.joinMode = 'ok'; return 1; })()`);
const pickSeat = await c.ev(`(() => { const b = [...document.querySelectorAll('.seatcard')].find((x) => /B2/.test(x.textContent)); if (!b) return 'no-b2'; b.click(); return 'clicked'; })()`);
await sleep(1500);
const stJoined = await c.ev(STATE);
R.joined = { clicked: pickSeat, inRoom: stJoined && stJoined.inRoom, mySeat: stJoined && stJoined.mySeat };
t('RM-9', '点 B2 → 加入成功并在座位图里显示自己（反方二辩 · 测试B）', !!(pickSeat === 'clicked' && stJoined && stJoined.inRoom && /反方二辩/.test(stJoined.mySeat || '') && /测试B/.test(stJoined.mySeat || '')), JSON.stringify(R.joined));
await c.shot('room-joined.png');

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
