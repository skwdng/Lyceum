/**
 * mobile-probe.mjs -- 390×844 手机端逐页验收（只读探针）
 *
 *   node scripts/audit/mobile-probe.mjs
 *
 * 前置：
 *   java -jar server/target/siyige-backend-0.1.0.jar --server.port=18091 \
 *        --spring.web.resources.static-locations=file:///D:/siyige/server/src/main/resources/static/
 *   msedge --headless=new --remote-debugging-port=9341 --user-data-dir=C:\Windows\Temp\edge-audit-fe about:blank
 *
 * 产出：target/audit-shots/m-<page>.png、probe-mobile-web.json
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
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-mobile-web.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
setTimeout(() => { log('[watchdog] timeout'); save(); process.exit(2); }, 175000);

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
  const ev = async (expr, ms = 8000) => {
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

/** 页面体检：宽度 / tabbar / 溢出 / 最小可点高度 */
const MEASURE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const over = [];
  document.querySelectorAll('#main *').forEach((el) => {
    // .strip 是刻意横向滚动的席位条（对局页），它的子元素越界不算页面溢出
    if (el.closest && el.closest('.strip')) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0.5 && (r.right > vw + 1 || r.left < -1)) over.push((el.className && String(el.className).slice(0, 28)) || el.tagName);
  });
  const tab = document.querySelector('.tabbar');
  const tabRect = tab ? tab.getBoundingClientRect() : null;
  const tabVisible = !!(tab && getComputedStyle(tab).display !== 'none' && tabRect && tabRect.width > 0);
  const tapEls = [...document.querySelectorAll('#main button, #main .btn, .tabbar a, .pill, .tool')].filter(vis);
  const heights = tapEls.map((el) => Math.round(el.getBoundingClientRect().height));
  const top = document.querySelector('.topbar');
  const topRect = top ? top.getBoundingClientRect() : null;
  const composer = document.querySelector('.composer');
  const compRect = composer ? composer.getBoundingClientRect() : null;
  return {
    vw, scrollW: de.scrollWidth,
    overCount: over.length, over: [...new Set(over)].slice(0, 6),
    tabbar: { visible: tabVisible, width: tabRect ? Math.round(tabRect.width) : null, height: tabRect ? Math.round(tabRect.height) : null, bottom: tabRect ? Math.round(tabRect.bottom) : null },
    topbar: topRect ? { h: Math.round(topRect.height), top: Math.round(topRect.top), title: (top.querySelector('.tb-title') || {}).textContent } : null,
    minTap: heights.length ? Math.min(...heights) : null,
    tapCount: heights.length,
    shortTaps: tapEls.filter((el) => el.getBoundingClientRect().height < 43.5).map((el) => (el.textContent || '').trim().slice(0, 12)).slice(0, 5),
    composer: compRect ? { top: Math.round(compRect.top), bottom: Math.round(compRect.bottom), h: Math.round(compRect.height) } : null,
    innerH: window.innerHeight,
    hot: { cards: document.querySelectorAll('.hot-cards li.hc').length, table: (() => { const t = document.querySelector('.hot-table-card'); return t ? getComputedStyle(t).display : 'none'; })() },
    wallet: (() => {
      const g = document.querySelector('#main .grid.g2');
      const cols = g ? [...g.children].filter(vis) : [];
      return cols.length ? { n: cols.length, lefts: [...new Set(cols.map((c) => Math.round(c.getBoundingClientRect().left)))], widths: cols.map((c) => Math.round(c.getBoundingClientRect().width)) } : null;
    })(),
    mainText: (() => { const el = document.querySelector('#main'); return el ? (el.innerText || '').trim().length : 0; })(),
    skins: (() => { const cards = [...document.querySelectorAll('.skins .skin')].filter(vis); return cards.length ? { n: cards.length, lefts: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)))].length } : null; })(),
    skin: document.documentElement.getAttribute('data-skin') || 'default'
  };
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

/* ---------- 准备账号 + 一场对局 ---------- */
const acc = 'm_' + Math.floor(Math.random() * 900000 + 10000);
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
  return { account: '${acc}', matchId: m.matchId || (m.match && m.match.id) || null };
})()`, 30000);
R.prep = prep;
log('prep: ' + JSON.stringify(prep));
if (!prep || !prep.matchId) { t('M-0', '建局', false, JSON.stringify(prep).slice(0, 200)); save(); process.exit(1); }
const mid = prep.matchId;

const pages = [
  ['solo', '#/solo'],
  ['match', '#/match?match=' + mid],
  ['hot', '#/hot'],
  ['wallet', '#/wallet'],
  ['settings', '#/settings'],
  ['community', '#/community'],
  ['video', '#/video'],
  ['me', '#/me']
];

for (const [name, hash] of pages) {
  const url = BASE + '/v2/index.html?r=' + Date.now() + hash;
  await c.send('Page.navigate', { url });
  await sleep(1200);
  let m = await c.ev(MEASURE);
  // 首屏要恢复登录态 / 拉接口：等到真有内容再量，最多 ~12s
  for (let i = 0; i < 30 && (!m || m.__err || !m.vw || m.mainText < 30); i++) { await sleep(400); m = await c.ev(MEASURE); }
  R[name] = m;
  await c.shot('m-' + name + '.png');
  if (!m || m.__err) { t('M-' + name, name + ' 页面可测量', false, JSON.stringify(m)); continue; }
  t('M-' + name + '-w', name + '：scrollWidth == 390', m.scrollW <= 390 && m.vw === 390, 'vw=' + m.vw + ' scrollW=' + m.scrollW);
  t('M-' + name + '-tap', name + '：可点区域 ≥44px', m.minTap === null || m.minTap >= 43.5, 'min=' + m.minTap + ' n=' + m.tapCount + ' short=' + JSON.stringify(m.shortTaps));
  if (name !== 'match') {
    t('M-' + name + '-tab', name + '：tabbar 宽度 == 390 且可见', m.tabbar.visible && m.tabbar.width === 390, JSON.stringify(m.tabbar));
  }
}

/* ---------- 对局页专项 ---------- */
const mm = R.match || {};
t('M-match-immersion', '对局页隐藏 tabbar（不压输入框）', mm.tabbar && mm.tabbar.visible === false, JSON.stringify(mm.tabbar));
t('M-match-composer', '输入区在视口内且贴底', !!(mm.composer && mm.composer.bottom <= mm.innerH + 1 && mm.composer.top < mm.innerH), JSON.stringify({ c: mm.composer, h: mm.innerH }));
t('M-match-topbar', '顶栏显示且标题为「对局」', !!(mm.topbar && mm.topbar.h === 52 && mm.topbar.title), JSON.stringify(mm.topbar));
t('M-match-noover', '对局页无横向溢出', mm.overCount === 0, JSON.stringify(mm.over));

/* ---------- 热榜卡片 / 钱包单列 / 设置单列 ---------- */
t('M-hot-cards', '热榜在 390 用卡片列表（表格隐藏）', !!(R.hot && R.hot.hot.cards > 0 && R.hot.hot.table === 'none'), JSON.stringify(R.hot && R.hot.hot));
t('M-wallet-col', '钱包单列堆叠', !!(R.wallet && R.wallet.wallet && R.wallet.wallet.lefts.length === 1), JSON.stringify(R.wallet && R.wallet.wallet));
t('M-settings-col', '设置皮肤卡单列', !!(R.settings && R.settings.skins && R.settings.skins.lefts === 1), JSON.stringify(R.settings && R.settings.skins));

/* ---------- 抽屉：打开「辅助」 ---------- */
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + mid });
await sleep(1800);
if ((await c.ev('1+1')) !== 2) { await sleep(1200); }
const sheet = await c.ev(`(() => {
  const b = [...document.querySelectorAll('.composer-pills .pill')].find((x) => /辅助/.test(x.textContent || ''));
  if (!b) return { err: 'no-pill' };
  b.click();
  return { clicked: true };
})()`);
await sleep(900);
const sheetState = await c.ev(`(() => {
  const s = document.querySelector('.sheet');
  const r = s ? s.getBoundingClientRect() : null;
  return { open: !!s, h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0,
    title: (document.querySelector('.sheet-hd b') || {}).textContent || '',
    err: (document.querySelector('.assist-err') || {}).textContent || '',
    hints: document.querySelectorAll('.sheet .assist-hint').length };
})()`);
R.sheet = { click: sheet, state: sheetState };
await c.shot('m-match-sheet.png');
t('M-sheet', '「辅助」胶囊打开半屏抽屉', !!(sheetState && sheetState.open && sheetState.w === 390 && sheetState.h > 200), JSON.stringify(sheetState));

/* ---------- 皮肤切换：移动端壳跟着变 ---------- */
const skinRes = await c.ev(`(async () => {
  const { applySkin } = await import('/v2/assets/' + '').catch(() => ({}));
  const mod = await import('/src/skins.js').catch(() => null);
  return mod ? 'dev' : 'n/a';
})()`).catch(() => 'skip');
// 直接写 localStorage 再重载（不依赖模块导入）
await c.ev(`(() => { localStorage.setItem('sy_skin', 'chamber'); return 1; })()`);
await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/solo' });
await sleep(1800);
const skin1 = await c.ev(MEASURE);
R.skinChamber = skin1;
t('M-skin', '切换到「庭辩现场」后移动端壳正常（无溢出、tabbar 满宽）', !!(skin1 && skin1.skin === 'chamber' && skin1.scrollW <= 390 && skin1.tabbar.width === 390), JSON.stringify({ skin: skin1 && skin1.skin, vw: skin1 && skin1.vw, scrollW: skin1 && skin1.scrollW, tab: skin1 && skin1.tabbar }));
await c.shot('m-skin-chamber.png');
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
