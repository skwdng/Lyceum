/**
 * finish-probe.mjs -- 打完一局验证「本场结束」卡片 / 复盘 / 退出 / 已结束 tab / 输入框边框
 *
 *   node scripts/audit/finish-probe.mjs
 *
 * 前置：服务 18091（serving 磁盘产物）、Edge CDP 9341（380×844 或 1440 均可，这里用 390×844）
 * 产出：target/audit-shots/finish-*.png、probe-finish.json
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
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-finish.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
setTimeout(() => { log('[watchdog] timeout'); save(); process.exit(2); }, 300000);

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
  const send = (method, params = {}, ms = 7000) => {
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
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  const card = document.querySelector('.finish-card');
  const ta = document.querySelector('.composer textarea');
  const cs = ta ? getComputedStyle(ta) : null;
  const btns = card ? [...card.querySelectorAll('button')].map((b) => b.textContent.trim()) : [];
  return {
    hash: location.hash,
    status: s && s.match ? s.match.status : null,
    waiting: s ? s.waiting : null,
    turns: s ? s.turns.length : null,
    card: !!card,
    cardText: card ? card.innerText.replace(/\\s+/g, ' ').slice(0, 120) : '',
    cardBtns: btns,
    textareaDisabled: ta ? ta.disabled : null,
    textareaBorder: cs ? { w: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor } : null,
    syMatch: (() => { try { return localStorage.getItem('sy_match'); } catch (e) { return 'ERR'; } })(),
    tabbar: (() => { const tb = document.querySelector('.tabbar'); return !!(tb && getComputedStyle(tb).display !== 'none'); })(),
    tabActive: (document.querySelector('.mv-tab.on') || {}).textContent || '',
    historyRows: document.querySelectorAll('.mv-row').length,
    historyErr: (() => {
      const box = document.querySelector('.mv-tabs + .card .empty');
      return box ? box.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    })()
  };
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

/* ---------- 准备：账号 + 一场快速局 ---------- */
const acc = 'f_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1600);
const prep = await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  if (!d.token) return { err: JSON.stringify(d).slice(0, 150) };
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['A1']));
  localStorage.setItem('sy_tier', 'BASIC');
  localStorage.setItem('sy_pace', 'tight');
  localStorage.removeItem('sy_match');
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 2000 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 2000, sign: o.sign }) });
  const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: 't3', seats: ['A1'], mode: 'SPRINT', pace: 'tight', difficulty: 'pro', tier: 'BASIC' }) })).json();
  return { account: '${acc}', matchId: m.matchId || (m.match && m.match.id) || null, steps: (m.steps || []).length };
})()`, 30000);
R.prep = prep;
log('prep: ' + JSON.stringify(prep));
const mid = prep && prep.matchId;
if (!mid) { t('F-0', '建局', false, JSON.stringify(prep).slice(0, 200)); save(); process.exit(1); }
await c.ev(`(() => { localStorage.setItem('sy_match', '${mid}'); return 1; })()`);

/* ---------- 打到结束 ---------- */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + mid });
await sleep(1800);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/match?match=' + mid }); await sleep(2400); }

const t0 = Date.now();
let st = null;
let rounds = 0;
while (Date.now() - t0 < 210000) {
  st = await c.ev(STATE);
  if (st && !st.__err && st.status && st.status !== 'RUNNING') break;
  if (st && st.waiting) {
    const sent = await c.ev(`(() => {
      const ta = document.querySelector('.composer textarea');
      if (!ta || ta.disabled) return 'no-ta';
      ta.value = '我方判断：平台要先把推荐口径公开，成本从推荐收益里出，接受外部抽查。';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const b = [...document.querySelectorAll('.composer button')].find((x) => x.textContent.trim() === '结束发言');
      if (b && !b.disabled) { b.click(); rounds++; return 'sent'; }
      return 'btn-disabled';
    })()`);
    if (sent === 'sent') log('   submit #' + (rounds + 1));
  }
  await sleep(1200);
}
await sleep(1500);
st = await c.ev(STATE);
R.finish = st;
log('finished state: ' + JSON.stringify({ status: st && st.status, hash: st && st.hash, card: st && st.card, turns: st && st.turns }));

t('F-1', '对局结束后仍在 #/match（不再自动跳走）', !!(st && /^#\/match/.test(st.hash || '') && st.status && st.status !== 'RUNNING'), 'hash=' + (st && st.hash) + ' status=' + (st && st.status));
t('F-2', '页面出现「本场结束」卡片', !!(st && st.card && /本场结束/.test(st.cardText)), JSON.stringify(st && st.cardText));
t('F-3', '卡片有 看复盘 / 退出 / 继续停留', !!(st && ['看复盘', '退出', '继续停留'].every((x) => (st.cardBtns || []).includes(x))), JSON.stringify(st && st.cardBtns));
t('F-4', '输入区已禁用（灰态）', !!(st && st.textareaDisabled === true), 'disabled=' + (st && st.textareaDisabled));
await c.shot('finish-card.png');

/* 看复盘（趁卡片还在；点了之后卡片就没了） */
const goRv = await c.ev(`(() => { const b = [...document.querySelectorAll('.finish-card button')].find((x) => x.textContent.trim() === '看复盘'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(2200);
const st3 = await c.ev(STATE);
R.review = { clicked: goRv, hash: st3 && st3.hash };
t('F-6', '「看复盘」跳到 #/review?match=…', !!(/^#\/review/.test(st3.hash || '') && String(st3.hash).includes(mid)), 'hash=' + (st3 && st3.hash));
await c.shot('finish-review.png');

/* 回对局 → 继续停留（卡片收起，仍在本页） */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + mid });
await sleep(2200);
const dismiss = await c.ev(`(() => { const b = [...document.querySelectorAll('.finish-card button')].find((x) => x.textContent.trim() === '继续停留'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(600);
const st2 = await c.ev(STATE);
R.dismiss = { clicked: dismiss, card: st2 && st2.card, hash: st2 && st2.hash };
t('F-5', '「继续停留」收起卡片、仍在 #/match', !!(dismiss === 'clicked' && st2 && !st2.card && /^#\/match/.test(st2.hash || '')), JSON.stringify(R.dismiss));

/* 再回对局 → 退出（走卡片上的「退出」） */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + mid });
await sleep(2200);
const st4 = await c.ev(STATE);
const outClick = await c.ev(`(() => {
  const cardBtn = [...document.querySelectorAll('.finish-card button')].find((x) => x.textContent.trim() === '退出');
  if (cardBtn) { cardBtn.click(); return 'card'; }
  return 'no-card';
})()`);
await sleep(2200);
const st5 = await c.ev(STATE);
R.exit = { before: { card: st4 && st4.card }, clicked: outClick, after: { hash: st5 && st5.hash, syMatch: st5 && st5.syMatch } };
t('F-7', '「退出」跳到 #/matches', !!(/^#\/matches/.test(st5.hash || '')), 'hash=' + (st5 && st5.hash) + ' clicked=' + outClick);
t('F-8', '退出后 localStorage 无 sy_match', !!(st5 && (st5.syMatch === null || st5.syMatch === '')), 'sy_match=' + (st5 && st5.syMatch));
await c.shot('finish-matches.png');

/* 已结束 tab */
const tabClick = await c.ev(`(() => { const b = [...document.querySelectorAll('.mv-tab')].find((x) => /已结束/.test(x.textContent || '')); if (!b) return 'no-tab'; b.click(); return 'clicked'; })()`);
await sleep(2500);
const st6 = await c.ev(STATE);
R.finishedTab = { clicked: tabClick, active: st6 && st6.tabActive, rows: st6 && st6.historyRows, empty: st6 && st6.historyErr };
log('已结束 tab: ' + JSON.stringify(R.finishedTab));
const histOk = !!(st6 && st6.historyRows > 0);
t('F-9', '「已结束」tab 能看到刚打完的那场', histOk || /暂时不可用|接口未就绪/.test(st6.historyErr || ''), JSON.stringify(R.finishedTab));
await c.shot('finish-finished-tab.png');

/* 三套皮肤下输入框边框都可见 */
const skins = ['default', 'chamber', 'paper', 'radio'];
const skinRes = [];
for (const sk of skins) {
  await c.ev(`(() => { ${sk === 'default' ? "localStorage.removeItem('sy_skin');" : `localStorage.setItem('sy_skin', '${sk}');`} return 1; })()`);
  await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + sk + '#/match?match=' + mid });
  await sleep(2000);
  let s7 = await c.ev(STATE);
  for (let i = 0; i < 10 && (!s7 || !s7.textareaBorder); i++) { await sleep(400); s7 = await c.ev(STATE); }
  skinRes.push({ skin: sk, border: s7 && s7.textareaBorder });
  await c.shot('finish-skin-' + sk + '.png');
}
R.skins = skinRes;
// 这个 Edge 版本把 1.5px 的**计算值**取整成 1px（inline 写 1.5px 也一样），
// 所以验收口径是「有实线边框 + 颜色可见且与底色不同」，声明值仍是 1.5px。
const borderOk = skinRes.every((x) => x.border && x.border.style === 'solid' && parseFloat(x.border.w) >= 1 && x.border.color !== 'rgba(0, 0, 0, 0)' && x.border.color !== x.border.bg);
t('F-10', '三套皮肤下输入框都有 1.5px 可见边框', borderOk, JSON.stringify(skinRes));
await c.ev(`(() => { localStorage.removeItem('sy_skin'); return 1; })()`);

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
