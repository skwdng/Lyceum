/**
 * solo-probe.mjs -- 验收：单人页只剩「开新局」；对局板块保留两个 tab
 *
 *   node scripts/audit/solo-probe.mjs
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
  log((ok ? 'PASS  ' : 'FAIL  ') + id + ' ' + label + (detail ? ' | ' + String(detail).slice(0, 200) : ''));
};
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-solo.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };

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

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

const acc = 'sl_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1500);
await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['A1']));
  localStorage.setItem('sy_tier', 'BASIC');
  return !!d.token;
})()`, 20000);

/* ---------- #/solo ---------- */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/solo' });
await sleep(2200);
if ((await c.ev('1+1')) !== 2) { await sleep(1400); }
const solo = await c.ev(`(() => {
  const txt = document.body.innerText || '';
  const q = (s) => !!document.querySelector(s);
  return {
    hash: location.hash,
    myRows: document.querySelectorAll('.myrow').length,
    seeAll: q('.see-all'),
    hasYiJinXing: /进行中的对局|最近对局|查看全部|继续这一场|有一场还没打完/.test(txt),
    hasJixu: /\\b继续\\b/.test(txt),
    topics: document.querySelectorAll('.topic').length,
    hasSeat: /当前席位/.test(txt),
    hasStart: /用这个题开练|开练 →|＋ 建房|开练/.test(txt),
    firstCard: (document.querySelector('#main .card') || {}).innerText ? document.querySelector('#main .card').innerText.replace(/\\s+/g, ' ').slice(0, 80) : '',
    tapMin: (() => { const bs = [...document.querySelectorAll('#main button')].filter((b) => b.getBoundingClientRect().height > 0); return bs.length ? Math.min(...bs.map((b) => Math.round(b.getBoundingClientRect().height))) : null; })()
  };
})()`);
R.solo = solo;
t('SL-1', '单人页没有任何「进行中的对局」列表', !!(solo && solo.myRows === 0 && !solo.seeAll && !solo.hasYiJinXing), JSON.stringify({ myRows: solo && solo.myRows, seeAll: solo && solo.seeAll, text: solo && solo.hasYiJinXing }));
t('SL-2', '首屏直接是选题 / 席位 / 开练入口', !!(solo && solo.topics > 0 && solo.hasSeat && solo.hasStart), JSON.stringify({ topics: solo && solo.topics, hasSeat: solo && solo.hasSeat }));
t('SL-3', '没有「继续这一场 / 继续」入口', !!(solo && !solo.hasJixu), 'hasJixu=' + (solo && solo.hasJixu));
await c.shot('solo-clean.png');

/* ---------- #/matches ---------- */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/matches' });
await sleep(2200);
const matches = await c.ev(`(() => ({
  hash: location.hash,
  tabs: [...document.querySelectorAll('.mv-tab')].map((b) => b.textContent.trim()),
  active: (document.querySelector('.mv-tab.on') || {}).textContent || ''
}))()`);
R.matches = matches;
t('SL-4', '#/matches 仍有「进行中 / 已结束」两个 tab', !!(matches && matches.tabs.length === 2 && /进行中/.test(matches.tabs[0]) && /已结束/.test(matches.tabs[1])), JSON.stringify(matches));
await c.shot('matches-tabs.png');

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
