/**
 * ui-probe.mjs —— 对局页 3 项最小实测（只读；不改主代码）
 *
 *   node scripts/audit/ui-probe.mjs             # 全跑，硬超时 180s
 *   node scripts/audit/ui-probe.mjs typing      # 只跑打字机采样
 *
 * 前置：服务 18091（java -jar server/target/siyige-backend-0.1.0.jar --server.port=18091）
 *      无头 Edge 9341（--headless=new --remote-debugging-port=9341 --user-data-dir=C:\Windows\Temp\edge-audit-fe）
 * 产出：target/audit-shots/probe-<part>.json + *.png
 *
 * 每个 CDP 调用都有超时，任何一步拿不到数据都会写「未实测」而不是挂死。
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
const DEADLINE = now() + 180000;
const out = { startedAt: new Date().toISOString() };
const save = (k, v) => { out[k] = v; fs.writeFileSync(path.join(OUT, 'probe-' + k + '.json'), JSON.stringify(v, null, 2), 'utf8'); };

/* ---------- CDP（每个调用 6s 超时，避免挂死） ---------- */
async function connect() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pages.length) { target = pages[0]; break; }
    } catch (e) { /* not up */ }
    await sleep(200);
  }
  if (!target) throw new Error('CDP 无 page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error('ws open timeout')), 5000); });
  let id = 0;
  const pend = new Map();
  const errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errs.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
  };
  const send = (method, params = {}) => {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return Promise.race([
      new Promise((r) => pend.set(mid, r)),
      sleep(6000).then(() => ({ __timeout: method }))
    ]);
  };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (!r || r.__timeout) return { __err: 'timeout' };
    if (r.exceptionDetails) return { __err: ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || '').split('\n')[0] };
    return r.result ? r.result.value : undefined;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) { fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, 'base64')); log('   shot:', name); }
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
    return { head: hd ? hd.textContent.replace(/\\s+/g, ' ').trim() : '', len: bub ? (bub.textContent || '').length : 0 };
  });
  const btns = [...document.querySelectorAll('button')].filter((b) => /催一下|直接显示全文|催中/.test(b.textContent || ''));
  return {
    matchId: s ? s.matchId : null, step: s && s.match ? s.match.step : null,
    waiting: s ? s.waiting : null, phase: s ? s.phase : null,
    skipStep: s ? s.skipStep : null, skipBusy: s ? s.skipBusy : null,
    canSkip: s ? s.canSkip() : null, hasTyping: s ? s.hasTyping() : null,
    turnsN: s ? s.turns.length : 0,
    view: s ? s.turnsView.map((t) => ({ k: t.key, step: t.step, seat: t.seat, len: (t.text || '').length, shown: t.shown, typing: t.typing })) : [],
    dom, btns: btns.map((b) => ({ text: b.textContent.trim().slice(0, 10), disabled: b.disabled })),
    net: (window.__net || []).slice(-6), toast: [...document.querySelectorAll('.tst')].map((x) => x.textContent.trim())
  };
})()`;

const okv = (v) => v && !v.__err;

async function main() {
  const part = process.argv[2] || 'all';
  const c = await connect();
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  /* ---------- 开局：注册 → 充值 → /solo 选座开局 ---------- */
  const acc = 'ui_' + Math.floor(Math.random() * 900000 + 10000);
  await c.send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
  await sleep(1500);
  const reg = await c.ev(`(async () => {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: '${acc}', password: 'Test123456' }) });
    const d = await r.json();
    if (!d.token) return { err: d };
    localStorage.setItem('sy_jwt', d.token);
    localStorage.setItem('sy_seats', JSON.stringify(['B2']));
    localStorage.setItem('sy_mode', 'STANDARD');
    localStorage.setItem('sy_pace', 'normal');
    localStorage.setItem('sy_tier', 'BASIC');
    const o = await (await fetch('/api/pay/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ amountCents: 900 }) })).json();
    if (o && o.orderId) await fetch('/api/pay/callback', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ orderId: o.orderId, amountCents: 900, sign: o.sign }) });
    return { account: '${acc}', token: !!d.token };
  })()`);
  log('register:', JSON.stringify(reg));
  await c.send('Page.navigate', { url: BASE + '/v2/index.html#/solo' });
  await sleep(1500);
  await c.ev(`(() => { if (!window.__netPatched) { window.__net = []; const of = window.fetch.bind(window); window.fetch = (...a) => { try { window.__net.push(String((a[0] && a[0].url) || a[0])); } catch (e) {} return of(...a); }; window.__netPatched = true; } return true; })()`);
  for (let i = 0; i < 40; i++) { if ((await c.ev(`!!document.querySelector('.topic')`)) === true) break; await sleep(200); }
  await c.ev(`(() => { const t = document.querySelector('.topic'); if (t) t.click(); return !!t; })()`);
  let started = null;
  for (let i = 0; i < 30; i++) {
    started = await c.ev(`(() => { const b = [...document.querySelectorAll('.mask button')].find((x) => /进入对局/.test(x.textContent || '')); if (!b) return null; b.click(); return b.textContent.trim(); })()`);
    if (started) break;
    await sleep(200);
  }
  log('进入对局:', started);
  let s = null;
  for (let i = 0; i < 60; i++) { s = await c.ev(SNAP); if (okv(s) && s.matchId) break; await sleep(200); }
  save('boot', { account: acc, started, matchId: s && s.matchId, step: s && s.step });
  log('match:', s && s.matchId, 'step', s && s.step);
  if (!okv(s) || !s.matchId) { save('error', '开局失败，未取到 matchId'); c.close(); return; }

  /* ---------- ① 打字机采样（首条 AI 发言） ---------- */
  if (['all', 'typing'].includes(part)) {
    log('\n=== ① 打字机长度采样 ===');
    const series = [];
    const t0 = now();
    while (now() - t0 < 30000 && now() < DEADLINE) {
      const x = await c.ev(SNAP);
      if (!okv(x)) break;
      series.push({ dt: now() - t0, view: x.view.map((v) => ({ k: v.k, shown: v.shown, len: v.len, typing: v.typing })), domN: x.dom.length, hasTyping: x.hasTyping });
      if (!x.hasTyping && series.length > 3) break;
      await sleep(120);
    }
    const perKey = {};
    for (const sp of series) for (const v of sp.view) {
      perKey[v.k] = perKey[v.k] || { len: v.len, pts: [] };
      perKey[v.k].len = Math.max(perKey[v.k].len, v.len);
      perKey[v.k].pts.push({ dt: sp.dt, shown: v.shown, typing: v.typing });
    }
    const summary = Object.entries(perKey).map(([k, v]) => {
      let regress = 0, prev = null, maxJump = 0;
      for (const p of v.pts) {
        if (prev != null) { if (p.shown < prev) regress++; maxJump = Math.max(maxJump, p.shown - prev); }
        prev = p.shown;
      }
      const a = v.pts[0], z = v.pts[v.pts.length - 1];
      const secs = (z.dt - a.dt) / 1000;
      return { key: k, len: v.len, firstShown: a.shown, lastShown: z.shown, samples: v.pts.length,
        regress, maxJump, charsPerSec: secs > 0.3 ? Math.round(((z.shown - a.shown) / secs) * 10) / 10 : null,
        firstFrameFull: v.len > 0 && a.shown >= v.len };
    });
    const outT = { seriesLen: series.length, summary, seriesHead: series.slice(0, 12).map((x) => x.view.map((v) => v.shown)) };
    save('typing', outT);
    log('  采样点:', series.length);
    for (const r of summary) log('   ', r.key, 'len=' + r.len, 'first=' + r.firstShown, 'last=' + r.lastShown, 'cps=' + r.charsPerSec, 'regress=' + r.regress, 'maxJump=' + r.maxJump, '首帧即全文=' + r.firstFrameFull);
    await c.shot('typewriter.png');
  }

  /* ---------- ② 气泡 (step,seat) 序列 vs 接口 ---------- */
  if (['all', 'order'].includes(part)) {
    log('\n=== ② 气泡序列 vs 接口 turns ===');
    const x = await c.ev(SNAP);
    const api = await c.ev(`(async () => {
      const t = localStorage.getItem('sy_jwt');
      const r = await fetch('/api/matches/${x.matchId}', { headers: { Authorization: 'Bearer ' + t } });
      const d = await r.json();
      return { step: d.match && d.match.step, turns: (d.turns || []).map((y) => ({ step: y.step, seat: y.seat, seg: y.seg, chars: (y.content || '').length })) };
    })()`);
    const apiSeq = (api.turns || []).map((t) => t.step + '|' + t.seat);
    const viewSeq = x.view.map((t) => t.step + '|' + t.seat);
    const dup = (a) => a.filter((k, i) => a.indexOf(k) !== i);
    const res = {
      apiSeq, viewSeq, apiDupe: dup(apiSeq), viewDupe: dup(viewSeq),
      missing: apiSeq.filter((k) => !viewSeq.includes(k)), extra: viewSeq.filter((k) => !apiSeq.includes(k)),
      domHeads: x.dom.map((d) => d.head), apiChars: (api.turns || []).map((t) => t.chars),
      storeStep: x.step, apiStep: api.step
    };
    save('order', res);
    log('  api :', apiSeq.join(' ') || '(空)');
    log('  view:', viewSeq.join(' ') || '(空)');
    log('  重复 api/view:', res.apiDupe.length, res.viewDupe.length, '丢条:', res.missing.length, '多出:', res.extra.length);
  }

  /* ---------- ④ 催一下按钮状态 ---------- */
  if (['all', 'nudge'].includes(part)) {
    log('\n=== ④ 催一下 ===');
    const R = { states: [], clicks: [] };
    // 等「我的回合」
    for (let i = 0; i < 400 && now() < DEADLINE; i++) {
      const x = await c.ev(SNAP);
      if (okv(x) && x.waiting) { R.myTurn = { step: x.step, btns: x.btns, canSkip: x.canSkip }; break; }
      await sleep(250);
    }
    const before = await c.ev(SNAP);
    R.myTurnClicks = await c.ev(`(() => {
      const bs = [...document.querySelectorAll('button')].filter((x) => /催一下/.test(x.textContent || ''));
      return bs.map((b) => { const d = b.disabled; if (!d) b.click(); return { text: b.textContent.trim(), disabled: d, title: b.getAttribute('title') || '' }; });
    })()`);
    // 提交一句 → 立刻采样按钮 + 连点 5 次
    await c.ev(`(() => {
      const ta = document.querySelector('.composer textarea');
      if (!ta) return 'no-ta';
      ta.value = '我方判断：算法推荐的成本由用户承担，平台必须公开推荐口径并接受外部抽查。';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return ta.value.length;
    })()`);
    await sleep(200);
    R.submit = await c.ev(`(() => { const b = [...document.querySelectorAll('.composer button')].find((x) => /发送/.test(x.textContent || '')); if (b && !b.disabled) { b.click(); return true; } return b ? 'disabled' : 'none'; })()`);
    const t0 = now();
    for (let i = 0; i < 12 && now() < DEADLINE; i++) {
      const x = await c.ev(SNAP);
      if (okv(x)) {
        R.states.push({ dt: now() - t0, waiting: x.waiting, step: x.step, btns: x.btns, canSkip: x.canSkip, skipStep: x.skipStep, hasTyping: x.hasTyping, skipCalls: (x.net || []).filter((u) => u.includes('/skip')).length });
        if (x.btns.length && x.btns.some((b) => /催一下|直接显示全文/.test(b.text) && !b.disabled)) {
          R.clicks.push(await c.ev(`(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /催一下|直接显示全文/.test(x.textContent || ''));
            if (!b) return { found: false };
            const before = { text: b.textContent.trim(), disabled: b.disabled };
            b.click();
            return { found: true, before, after: { text: b.textContent.trim(), disabled: b.disabled } };
          })()`));
        }
      }
      await sleep(200);
    }
    R.final = await c.ev(SNAP);
    R.skipCallsTotal = ((R.final.net || []).filter((u) => u.includes('/skip'))).length;
    save('nudge', R);
    log('  我的回合按钮:', JSON.stringify(R.myTurn && R.myTurn.btns));
    log('  思考中按钮状态:', JSON.stringify(R.states.filter((s) => s.btns.length).slice(0, 3)));
    log('  点击次数:', R.clicks.length, '| /skip 请求数:', R.skipCallsTotal, '| toast:', JSON.stringify(R.final.toast));
    await c.shot('nudge.png');
  }

  out.consoleErrs = c.errs.slice(0, 8);
  fs.writeFileSync(path.join(OUT, 'probe-summary.json'), JSON.stringify(out, null, 2), 'utf8');
  log('\nconsole errors:', out.consoleErrs.length ? JSON.stringify(out.consoleErrs) : 'none');
  c.close();
}

await main().catch((e) => { log('ERROR:', (e && e.stack) || e); try { fs.writeFileSync(path.join(OUT, 'probe-summary.json'), JSON.stringify({ error: String(e), out }, null, 2)); } catch (x) {} });
process.exit(0);
