import { phoneFor } from './_phone.mjs';
// 管理台告警自检（A4 · 必跑）
//
// 覆盖总控要求的那条链路：
//   手动扫描（阈值 3 造数据）→ 红点出现 → 点已处理 → 红点归零
//   → 同对象不再重复 → 另一个对象仍能触发 → 静音后不再产生 → 全部视图能看到已处理
//
// 用法：node server/scripts/selftest_vue_alerts.mjs [cdpPort] [baseUrl]
import crypto from 'crypto';

const PORT = process.argv[2] || '9482';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 阈值（与后端 AlertRule.REPORT_THRESHOLD 保持一致：验证期 3，所以 4 条举报才触发）
const THRESHOLD = 3;
const BURST = THRESHOLD + 1;

const call = async (method, path, body, token) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt.slice(0, 160) }; }
  return { status: r.status, body: j };
};

const out = [];
const ok = (c, l, e = '') => out.push(`${c ? 'PASS' : 'FAIL'} ${l}${e ? '  [' + e + ']' : ''}`);
const check = async (n, f) => {
  try {
    const v = await f();
    out.push('PASS  ' + n + (v ? '  [' + v + ']' : ''));
  } catch (e) {
    out.push('FAIL  ' + n + '  -> ' + e.message);
  }
};

// ---------- 造数：两条帖子各被 4 个人举报（> 阈值 3）----------
const stamp = Date.now().toString().slice(-6);

async function makeReviewer(n) {
  const acc = 'rv' + stamp + n;
  await call('POST', '/api/auth/register', { account: acc, password: 'abc12345', phone: phoneFor(acc) });
  const t = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
  return { acc, token: t };
}

const reporters = [];
for (let i = 1; i <= BURST; i++) reporters.push(await makeReviewer(i));

async function makePost(tag) {
  const acc = 'ap' + stamp + tag;
  await call('POST', '/api/auth/register', { account: acc, password: 'abc12345', phone: phoneFor(acc) });
  const t = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
  const me = (await call('GET', '/api/auth/me', undefined, t)).body;
  const p = await call('POST', '/api/community/posts',
    { type: 'CHAT', title: `告警自检 ${tag} ${stamp}`, body: '这条用来触发举报激增告警。' }, t);
  return { postId: p.body.postId, authorId: me.id, author: acc };
}

async function reportAll(target, count = BURST) {
  for (let i = 0; i < count; i++) {
    await call('POST', '/api/community/reports',
      { targetType: 'POST', targetId: target.postId, reason: 'SPAM', detail: '告警自检' },
      reporters[i].token);
  }
}

const postA = await makePost('A');
const postB = await makePost('B');
await reportAll(postA);

const adminTok = (await call('POST', '/api/admin/auth/login', { account: 'admin', password: 'admin123' })).body.token;

// ---------- CDP ----------
async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target on ' + PORT);
}
const ws = new WebSocket(await getWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { resolve, reject } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pend.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result.value;
};
const waitFor = async (expr, label, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await sleep(150);
  }
  throw new Error('timeout:' + label);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/** 以超管身份进管理台某页（清掉上次会话的"只弹一次"标记，保证每次都能看到红点流程） */
async function openAdmin(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/login' });
  await sleep(900);
  await ev(`localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('sy_admin_jwt', ${JSON.stringify(adminTok)});
    localStorage.setItem('sy_admin_collapsed','0'); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(2400);
}

const bellCount = () => ev(`(()=>{const b=document.querySelector('[data-panel="alert-bell"] .bell-n');
  return b ? b.textContent.trim() : '0';})()`);
/** 行里是否提到某篇帖子：按 `POST#<id>` 精确匹配，不能用 includes(id)（"1" 会误命中 "12" 或数字列） */
const mentions = (text, id) => new RegExp('POST#' + id + '(?!\\d)').test(text);
const alertRows = () => ev(`[...document.querySelectorAll('[data-panel="alerts"] tbody tr[data-alert-id]')]
  .map(r=>({id:Number(r.dataset.alertId), rule:r.dataset.rule, text:r.innerText.replace(/\\s+/g,' ').trim()}))`);

// ==================== 1. 先把手动扫描做出来，红点应出现 ====================
await check('1 造 4 条举报 → 手动扫描 → 顶栏红点出现（数字=未处理数）', async () => {
  const scan = await call('POST', '/api/admin/alerts/scan', {}, adminTok);
  if (scan.status !== 200) throw new Error('扫描失败 ' + scan.status);
  const unread = (await call('GET', '/api/admin/alerts/unread', undefined, adminTok)).body.unread;
  if (unread <= 0) throw new Error('扫描后未处理数仍为 0：' + JSON.stringify(scan.body));

  await openAdmin('/admin/dashboard');
  await waitFor(`!!document.querySelector('[data-panel="alert-bell"]')`, '顶栏铃铛', 20000);
  const n = await bellCount();
  if (n === '0') throw new Error('铃铛上没有红点数字');
  return 'raised=' + scan.body.raised + ' · 红点=' + n + ' · 库内未处理=' + unread;
});

// ==================== 2. 点铃铛 → 告警页列出该对象 ====================
await check('2 点铃铛进告警页：列表里有「内容被举报激增」这条', async () => {
  await ev(`document.querySelector('[data-panel="alert-bell"]').click(); true`);
  await waitFor(`location.hash.includes('/admin/alerts')`, '进告警页');
  await waitFor(`!!document.querySelector('[data-panel="alerts"]')`, '告警页渲染');
  await waitFor(`document.querySelectorAll('[data-panel="alerts"] tbody tr[data-alert-id]').length > 0`, '有告警行');
  const rows = await alertRows();
  const hit = rows.find((r) => r.rule === 'POST_REPORT_BURST' && mentions(r.text, postA.postId));
  if (!hit) throw new Error('列表里没有 POST#' + postA.postId + '：' + JSON.stringify(rows.map((r) => r.text)));
  return rows.length + ' 行 · 命中 ' + hit.text.slice(0, 34);
});

// ==================== 3. 点「已处理」→ 红点归零/减少，默认视图消失 ====================
await check('3 点「已处理」填备注 → ACKED，红点减少，未处理视图里消失', async () => {
  const before = Number(await bellCount() || 0);
  const rows = await alertRows();
  const target = rows.find((r) => r.rule === 'POST_REPORT_BURST' && mentions(r.text, postA.postId));
  await ev(`(()=>{const tr=document.querySelector('[data-alert-id="${target.id}"]');
    [...tr.querySelectorAll('button')].find(b=>b.textContent.trim()==='已处理').click(); return true;})()`);
  await waitFor(`!!document.querySelector('[data-panel="alert-ack"]')`, '已处理弹窗');
  await ev(`(()=>{const i=document.querySelector('[data-ack-note]');
    i.value='自检：已联系当事人'; i.dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('[data-panel="alert-ack"] .foot button')]
      .find(b=>b.textContent.includes('标记已处理')).click(); return true;})()`);
  await sleep(1600);

  const after = Number(await bellCount() || 0);
  const stillThere = (await alertRows()).some((r) => r.id === target.id);
  if (stillThere) throw new Error('未处理视图里还留着这条');
  if (!(after < before)) throw new Error('红点没减少：' + before + ' -> ' + after);
  return before + ' → ' + after;
});

// ==================== 4. 同对象不再重复 ====================
await check('4 同一对象再扫描：不新增、不翻回未处理', async () => {
  const scan = await call('POST', '/api/admin/alerts/scan', {}, adminTok);
  const all = await call('GET', '/api/admin/alerts?status=ALL&size=100', undefined, adminTok);
  const same = (all.body.items || []).filter((a) => a.ruleKey === 'POST_REPORT_BURST'
    && String(a.targetId) === String(postA.postId));
  if (same.length !== 1) throw new Error('同一对象出现 ' + same.length + ' 条');
  if (same[0].status !== 'ACKED') throw new Error('状态被翻回了 ' + same[0].status);
  return 'raised=' + scan.body.raised + ' · 仍是 1 条 ACKED';
});

// ==================== 5. 另一个对象仍能触发 ====================
await check('5 另一个对象（第二篇帖子）刷够举报 → 照常产出新告警', async () => {
  await reportAll(postB);
  const scan = await call('POST', '/api/admin/alerts/scan', {}, adminTok);
  if (scan.body.raised < 1) throw new Error('没有新增：' + JSON.stringify(scan.body));
  await ev(`document.querySelector('[data-panel="alerts"]').scrollIntoView(); true`);
  await ev(`(()=>{[...document.querySelectorAll('.al-tabs button')].find(b=>b.textContent.includes('只看未处理')).click(); return true;})()`);
  await sleep(1200);
  const rows = await alertRows();
  const hit = rows.find((r) => r.rule === 'POST_REPORT_BURST' && mentions(r.text, postB.postId));
  if (!hit) throw new Error('新对象的告警没出现在未处理视图：' + JSON.stringify(rows.map((r) => r.text)));
  return 'raised=' + scan.body.raised + ' · POST#' + postB.postId + ' 已列出';
});

// ==================== 6. 静音后不再产生 ====================
await check('6 静音「内容被举报激增」→ 新对象不再产生该规则告警', async () => {
  const until = Date.now() + 3600_000;
  const mute = await call('POST', '/api/admin/alerts/mute', { ruleKey: 'POST_REPORT_BURST', until }, adminTok);
  if (mute.status !== 200) throw new Error('静音失败 ' + mute.status);

  // 第三个对象刷够举报：内容规则被静音，应该一条都不产出
  const postC = await makePost('C');
  await reportAll(postC);
  const scan = await call('POST', '/api/admin/alerts/scan', {}, adminTok);
  if (!(scan.body.skippedRules || []).includes('POST_REPORT_BURST')) {
    throw new Error('扫描没跳过被静音的规则：' + JSON.stringify(scan.body.skippedRules));
  }
  const all = await call('GET', '/api/admin/alerts?status=ALL&size=200', undefined, adminTok);
  const hit = (all.body.items || []).some((a) => a.ruleKey === 'POST_REPORT_BURST'
    && String(a.targetId) === String(postC.postId));
  if (hit) throw new Error('静音期间还是给 POST#' + postC.postId + ' 生了告警');

  // 解除静音复位，别把环境留给下一次
  await call('POST', '/api/admin/alerts/mute/POST_REPORT_BURST/off', {}, adminTok);
  return 'skippedRules=' + JSON.stringify(scan.body.skippedRules);
});

// ==================== 7. 全部视图能看到已处理 ====================
await check('7 切「全部」：能看到刚处理的那条（带处理人与备注）', async () => {
  await ev(`(()=>{[...document.querySelectorAll('.al-tabs button')].find(b=>b.textContent.includes('全部')).click(); return true;})()`);
  await sleep(1400);
  await waitFor(`document.querySelectorAll('[data-panel="alerts"] tbody tr[data-alert-id]').length > 0`, '全部视图有行');
  const rows = await alertRows();
  const hit = rows.find((r) => r.rule === 'POST_REPORT_BURST' && mentions(r.text, postA.postId));
  if (!hit) throw new Error('全部视图里找不到已处理的那条');
  if (!hit.text.includes('已处理')) throw new Error('状态没显示已处理：' + hit.text);
  if (!hit.text.includes('admin')) throw new Error('没显示处理人：' + hit.text);
  if (!hit.text.includes('自检：已联系当事人')) throw new Error('没显示备注：' + hit.text);
  return hit.text.slice(0, 60);
});

await check('8 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
