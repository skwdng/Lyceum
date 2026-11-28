/**
 * speech-probe.mjs -- 验收「发言审核官」+「催一下/显示全文 合并」
 *
 *   node scripts/audit/speech-probe.mjs
 *
 * 后端 /speech-check 与 aiState 还没上线时，用页面内 fetch 拦截把这两种情况模拟出来
 * （同时单独验证「真实 404 → 降级直接提交」这条路径）。
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
const save = () => { try { fs.writeFileSync(path.join(OUT, 'probe-speech.json'), JSON.stringify({ checks, R }, null, 2), 'utf8'); } catch (e) {} };
setTimeout(() => { log('[watchdog] timeout'); save(); process.exit(2); }, 270000);

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
  const el = document.querySelector('#app');
  const pinia = el && el.__vue_app__ && el.__vue_app__.config.globalProperties.$pinia;
  const s = pinia && pinia._s.get('debate');
  const panel = document.querySelector('.check-panel');
  const btns = [...document.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), d: b.disabled,
    vis: !!(b.getBoundingClientRect().width > 0) }));
  const ta = document.querySelector('.composer textarea');
  return {
    waiting: s ? s.waiting : null,
    turns: s ? s.turns.length : null,
    aiState: s ? s.aiState : null,
    hasTyping: s ? s.hasTyping() : null,
    canSkip: s ? s.canSkip() : null,
    panel: !!panel,
    panelText: panel ? panel.innerText.replace(/\\s+/g, ' ').slice(0, 160) : '',
    thinking: !!document.querySelector('.thinking-wait'),
    thinkingText: (document.querySelector('.thinking-wait') || {}).textContent || '',
    expandBtn: btns.some((b) => /直接显示全文/.test(b.t) && b.vis),
    nudgeBtn: btns.some((b) => /^催一下$/.test(b.t) && b.vis && !b.d),
    nudgeAny: btns.some((b) => /^催一下$/.test(b.t) && b.vis),
    checking: btns.some((b) => /审核中/.test(b.t) && b.vis),
    draft: ta ? ta.value : null,
    focused: ta ? document.activeElement === ta : null
  };
})()`;

const c = await connect();
await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });

/* ---------- 准备 ---------- */
const acc = 'sp_' + Math.floor(Math.random() * 900000 + 10000);
await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(1600);
const prep = await c.ev(`(async () => {
  const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
  const d = await r.json();
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token };
  localStorage.setItem('sy_jwt', d.token);
  localStorage.setItem('sy_seats', JSON.stringify(['A1']));
  localStorage.setItem('sy_tier', 'BASIC');
  localStorage.removeItem('sy_match');
  const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: H, body: JSON.stringify({ amountCents: 900 }) })).json();
  if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: H, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
  const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: 't3', seats: ['A1'], mode: 'FULL', pace: 'loose', difficulty: 'pro', tier: 'BASIC' }) })).json();
  return { matchId: m.matchId || (m.match && m.match.id) || null };
})()`, 30000);
R.prep = prep;
const mid = prep && prep.matchId;
if (!mid) { t('S-0', '建局', false, JSON.stringify(prep).slice(0, 160)); save(); process.exit(1); }

await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + mid });
await sleep(1800);
if ((await c.ev('1+1')) !== 2) { await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + (Date.now() + 1) + '#/match?match=' + mid }); await sleep(2400); }

/* ---------- 装拦截器：可控 speech-check + 可注入 aiState ---------- */
const hook = await c.ev(`(() => {
  if (window.__speechHooked) return 'already';
  window.__force = { check: null, aiState: null, slowMs: 0 };
  const of = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (url.indexOf('/speech-check') >= 0 && window.__force.check) {
      if (window.__force.slowMs) await new Promise((r) => setTimeout(r, window.__force.slowMs));
      const body = window.__force.check === 'fail'
        ? { ok: false, issues: [{ code: 'INCOMPLETE_REASON', message: '这句以「因为」结尾，理由没说完。', fix: '把因果补完整：因为……所以……' }], tips: '先把判断说完，再给一条可核查的依据。' }
        : { ok: true, issues: [], tips: '' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const res = await of(input, init);
    const isMatchGet = /\\/api\\/matches\\/[^/?#]+$/.test(url) && (!init || !init.method || String(init.method).toUpperCase() === 'GET');
    if (window.__force.aiState && isMatchGet) {
      try {
        const d = await res.clone().json();
        d.aiState = window.__force.aiState;
        return new Response(JSON.stringify(d), { status: res.status, headers: { 'Content-Type': 'application/json' } });
      } catch (e) { return res; }
    }
    return res;
  };
  window.__speechHooked = true;
  return 'hooked';
})()`);
log('hook:', hook);

async function fill(text) {
  await c.ev(`(() => { const ta = document.querySelector('.composer textarea'); if (!ta) return 0; ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input', { bubbles: true })); return ta.value.length; })()`);
  await sleep(250);
}
async function clickEnd() {
  return await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => /结束发言/.test(x.textContent)); if (!b) return 'no-btn'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
}
async function waitMyTurn(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await c.ev(STATE);
    if (s && s.waiting) return s;
    await sleep(600);
  }
  return await c.ev(STATE);
}

/* ---------- ① 第一回合：先测审核不通过（此时 AI 还没开始跑，最稳） ---------- */
let st = await waitMyTurn();
R.myTurn = { waiting: st && st.waiting, turns: st && st.turns };
await c.ev(`(() => { window.__force.check = 'fail'; window.__force.slowMs = 900; return 1; })()`);
await fill('我方认为推荐算法需要公开口径，因为');
const beforeFail = (await c.ev(STATE)).turns;
const clicked = await clickEnd();
await sleep(300);
const during = await c.ev(STATE);          // 审核中：按钮应为「审核中…」且禁用
await sleep(1800);
const stFail = await c.ev(STATE);
R.checking = { clicked, checking: during && during.checking };
R.fail = { before: beforeFail, after: stFail && stFail.turns, panel: stFail && stFail.panel, text: stFail && stFail.panelText, draft: stFail && stFail.draft };
t('S-2', '审核中按钮显示「审核中…」并禁用', !!(during && during.checking), JSON.stringify(R.checking));

t('S-3', '审核不通过 → 弹审核官面板（审核官 · AI）', !!(stFail && stFail.panel && /审核官 · AI/.test(stFail.panelText)), JSON.stringify(stFail && stFail.panelText));
t('S-4', '面板逐条给出 message + fix', !!(stFail && /理由没说完/.test(stFail.panelText) && /改成/.test(stFail.panelText)), JSON.stringify(stFail && stFail.panelText));
t('S-5', '审核不通过 → 不提交（turns 不变）', !!(stFail && stFail.turns === beforeFail), beforeFail + ' -> ' + (stFail && stFail.turns));
t('S-6', '内容保留在输入框', !!(stFail && /公开口径，因为/.test(stFail.draft || '')), JSON.stringify(stFail && stFail.draft));
await c.shot('speech-panel.png');

/* ---------- ③ 继续修改 ---------- */
const cont = await c.ev(`(() => { const b = [...document.querySelectorAll('.check-panel button')].find((x) => x.textContent.trim() === '继续修改'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
await sleep(500);
const stCont = await c.ev(STATE);
R.continue = { clicked: cont, panel: stCont && stCont.panel, focused: stCont && stCont.focused, draft: stCont && stCont.draft };
t('S-7', '「继续修改」关面板、聚焦输入框、内容还在', !!(cont === 'clicked' && !stCont.panel && stCont.focused && /因为/.test(stCont.draft || '')), JSON.stringify(R.continue));

/* ---------- ④ 通过后正常提交 ---------- */
await c.ev(`(() => { window.__force.check = 'ok'; window.__force.slowMs = 0; return 1; })()`);
await fill('我方认为推荐算法必须公开推荐口径，否则用户无法核查成本由谁承担。');
const beforeOk = (await c.ev(STATE)).turns;
await clickEnd();
await sleep(2200);
const stOk = await c.ev(STATE);
R.ok = { before: beforeOk, after: stOk && stOk.turns, draft: stOk && stOk.draft };
t('S-8', '审核通过 → 正常提交（turns+1、输入框清空）', !!(stOk && stOk.turns === beforeOk + 1 && !stOk.draft), JSON.stringify(R.ok));

/* ---------- ⑤ aiState：生成中不出现可点的「催一下」 ---------- */
await c.ev(`(async () => { window.__force.aiState = 'generating'; const el = document.querySelector('#app'); const p = el.__vue_app__.config.globalProperties.$pinia; await p._s.get('debate').load(false); return 1; })()`);
await sleep(1200);
const stGen = await c.ev(STATE);
R.generating = { aiState: stGen && stGen.aiState, thinking: stGen && stGen.thinking, text: stGen && stGen.thinkingText, nudgeAny: stGen && stGen.nudgeAny, expand: stGen && stGen.expandBtn };
t('S-9', 'aiState=generating → 无可点「催一下」，只有灰文案', !!(stGen && stGen.aiState === 'generating' && !stGen.nudgeAny && stGen.thinking && /组织语言/.test(stGen.thinkingText)), JSON.stringify(R.generating));
await c.shot('speech-ai-generating.png');

/* ---------- ⑥ aiState=ready → 出现可点「催一下」 ---------- */
await c.ev(`(async () => { window.__force.aiState = 'ready'; const el = document.querySelector('#app'); const p = el.__vue_app__.config.globalProperties.$pinia; await p._s.get('debate').load(false); return 1; })()`);
await sleep(1200);
const stReady = await c.ev(STATE);
R.ready = { aiState: stReady && stReady.aiState, nudgeBtn: stReady && stReady.nudgeBtn, thinking: stReady && stReady.thinking };
t('S-10', 'aiState=ready → 出现可点的「催一下」', !!(stReady && stReady.nudgeBtn && !stReady.thinking), JSON.stringify(R.ready));

/* ---------- ⑦ 打字中 → 只有「直接显示全文」 ---------- */
await c.ev(`(async () => { window.__force.aiState = null; return 1; })()`);
let stType = null;
for (let i = 0; i < 60; i++) {
  stType = await c.ev(STATE);
  if (stType && stType.hasTyping) break;
  await sleep(400);
}
R.typing = { hasTyping: stType && stType.hasTyping, expand: stType && stType.expandBtn, nudgeBtn: stType && stType.nudgeBtn, thinking: stType && stType.thinking };
t('S-11', '打字机在跑时只有「直接显示全文」，且没有「催一下」', !!(stType && stType.hasTyping && stType.expandBtn && !stType.nudgeBtn && !stType.thinking), JSON.stringify(R.typing));
await c.shot('speech-typing-expand.png');

/* ---------- ⑧ 再轮到我说时：真实 404 → 降级直接提交 ---------- */
await c.ev(`(() => { window.__force.aiState = null; window.__force.check = null; return 1; })()`);
const stMine2 = await waitMyTurn(95000);
if (stMine2 && stMine2.waiting) {
  await fill('第二回合：我方补充一条可核查的依据，成本由推荐收益承担。');
  const before404 = stMine2.turns;
  await clickEnd();
  await sleep(2600);
  const st404 = await c.ev(STATE);
  R.fallback404 = { before: before404, after: st404 && st404.turns, panel: st404 && st404.panel };
  t('S-1', '审核接口不可用(404/网络) → 降级直接提交', !!(st404 && st404.turns === before404 + 1 && !st404.panel), JSON.stringify(R.fallback404));
} else {
  // 这一场没这么快轮到我：另开一场（第一回合就是我说），专门验 404 降级
  const m2 = await c.ev(`(async () => {
    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('sy_jwt') };
    const m = await (await fetch('/api/matches', { method: 'POST', headers: H, body: JSON.stringify({ topicId: 't3', seats: ['A1'], mode: 'SPRINT', pace: 'tight', difficulty: 'pro', tier: 'BASIC' }) })).json();
    return m.matchId || (m.match && m.match.id) || null;
  })()`, 20000);
  await c.send('Page.navigate', { url: BASE + '/v2/index.html?r=' + Date.now() + '#/match?match=' + m2 });
  await sleep(2200);
  const st2b = await waitMyTurn(30000);
  await fill('这一回合只测降级：我方主张公开推荐口径，因为');
  const before404 = st2b && st2b.turns;
  await clickEnd();
  await sleep(2600);
  const st404 = await c.ev(STATE);
  R.fallback404 = { match: m2, before: before404, after: st404 && st404.turns, panel: st404 && st404.panel };
  t('S-1', '审核接口不可用(404/网络) → 降级直接提交', !!(st404 && st404.turns === before404 + 1 && !st404.panel), JSON.stringify(R.fallback404));
}

R.consoleErrs = c.errs.slice(0, 8);
save();
const failed = checks.filter((x) => !x.ok);
log('');
log('==== ' + (checks.length - failed.length) + '/' + checks.length + ' PASS ====');
if (failed.length) log('FAILED: ' + failed.map((f) => f.id).join(', '));
log('console errors: ' + (R.consoleErrs.length ? JSON.stringify(R.consoleErrs) : 'none'));
c.close();
process.exit(failed.length ? 1 : 0);
