// Vue 迁移 · 批 5 自检③：离开对局可继续 + 聊天滚动不被抢
//
// 用法：node server/scripts/selftest_vue_resume.mjs [cdpPort] [baseUrl]
//
// 关键：**导航必须走应用内路由（点侧栏）**，不能用 Page.navigate ——
// 后者是整页重载，会把 pinia 里的对局状态冲掉，那样测的就不是"离开视图"而是"刷新页面"。
//
// 覆盖：
//   R1 点侧栏离开对局 → 回单人页出现「有一场还没打完」（辩题 + 席位 + 继续/放弃）
//   R2 点「继续这一场」→ 回到同一场，已记录的发言还在
//   R3 手动往上翻不被拽回底部，并出现「↓ 回到底部」
//   R4 滚轮立刻解除跟随并记下 lastUserScroll（打字机靠它判断要不要滚）
//   R5 点「↓ 回到底部」→ 重新贴底、提示消失
//   R6 应用内切走再回来：滚动位置保留（不跳顶也不跳底）
//   R7 全程零 JS 异常
const PORT = process.argv[2] || '9456';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
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
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
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
const out = [];
const check = async (n, f) => {
  try {
    const v = await f();
    out.push('PASS  ' + n + (v ? '  [' + v + ']' : ''));
  } catch (e) {
    out.push('FAIL  ' + n + '  -> ' + e.message);
  }
};
const store = () =>
  ev(`(()=>{const app=document.querySelector('#app') && document.querySelector('#app').__vue_app__;
    const s=(app && app.config.globalProperties.$pinia.state.value.debate) || {};
    return {matchId:s.matchId, turns:(s.turns||[]).length, stickBottom:s.stickBottom,
            lastUserScroll:s.lastUserScroll||0, status:(s.match&&s.match.status)||''}})()`);
/** 应用内点侧栏（不重载页面） */
const nav = async (label) => {
  const ok = await ev(`(()=>{const a=[...document.querySelectorAll('#nav a')].find(x=>x.textContent.indexOf(${JSON.stringify(label)})>=0);
    if(!a) return false; a.click(); return true})()`);
  if (!ok) throw new Error('侧栏找不到「' + label + '」');
  await sleep(1400);
};
const tipVisible = () =>
  ev(`(()=>{const t=[...document.querySelectorAll('button')].find(x=>x.textContent.indexOf('回到底部')>=0);
    return !!t && t.offsetParent !== null})()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 620, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + '/v2/index.html' });
await sleep(1200);
await ev(`localStorage.clear(); true`);
await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
await sleep(1500);
await waitFor(`!!document.querySelector('#app') && !!document.querySelector('.nav, #authAccount')`, '应用挂载', 20000);

const stamp = Date.now().toString().slice(-6);
const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const reg = await call('POST', '/api/auth/register', { account: 'rs' + stamp, password: 'abc12345' });
const TOKEN = reg.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '续局甲' + stamp })
});
const pay = await call('POST', '/api/pay/orders', { amountCents: 5000 }, TOKEN);
if (pay.body?.orderId) {
  await call('POST', '/api/pay/callback', {
    orderId: pay.body.orderId, amountCents: 5000, sign: pay.body.sign, tradeNo: 'MOCK-' + Date.now()
  }, TOKEN);
}
const topics = await call('GET', '/api/topics', null, TOKEN);
const ALL_SEATS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
const mk = await call('POST', '/api/matches', {
  topicId: topics.body[0].id, seats: ALL_SEATS, mode: 'FULL', pace: 'normal', difficulty: 'pro', tier: 'PRO'
}, TOKEN);
const MID = mk.body && mk.body.matchId;
if (!MID) {
  console.log('开局失败：' + JSON.stringify(mk).slice(0, 160));
  process.exit(1);
}
for (let i = 0; i < 12; i++) {
  const d = await call('GET', '/api/matches/' + MID, null, TOKEN);
  if (!d.body?.match || d.body.match.status !== 'RUNNING') break;
  if (d.body.waitingForMe) {
    await call('POST', '/api/matches/' + MID + '/turns', {
      content:
        '我方认为判准要先立住：只有先说明「什么算论证成立」，后面的数据与案例才有意义，否则双方各说各话，' +
        '观众也无法核验结论。第二点，效率问题是在判准之下的次级问题，不能反过来取代判准。',
      inputType: 'kb'
    }, TOKEN);
  }
  await sleep(200);
}

await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
// 关键：这一场是接口建的 8 席（全是我），但前端 store 的「我的席位」读的是 localStorage，
// 不写进去的话它以为我只坐 A1，其余 11 条会被当成「别人的发言、还没打字」而不渲染。
await ev(`localStorage.setItem('sy_seats', ${JSON.stringify(JSON.stringify(ALL_SEATS))});
  localStorage.setItem('sy_mode', 'FULL'); true`);

await check('R1 点侧栏离开对局 → 回单人页出现「有一场还没打完」', async () => {
  // 用深链进入这一场（整页加载也支持，批 5 加的）
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/match?match=' + MID });
  await sleep(2200);
  await waitFor(`!!document.querySelector('.chat')`, '对局聊天区', 25000);
  const s0 = await store();
  if (String(s0.matchId) !== String(MID)) throw new Error('对局没加载：' + s0.matchId);

  await nav('讨论社区');            // 应用内离开对局
  await nav('单人辩论');
  await waitFor(`document.body.innerText.indexOf('有一场还没打完') >= 0`, '未完成对局卡片', 15000);
  const card = await ev(`(()=>{const c=[...document.querySelectorAll('.card')].find(x=>x.innerText.indexOf('有一场还没打完')>=0);
    return {text: c?c.innerText.replace(/\\s+/g,' ').trim():'', btns: c?[...c.querySelectorAll('button')].map(b=>b.textContent.trim()):[]}})()`);
  if (!card.btns.includes('继续这一场')) throw new Error('卡片没有「继续这一场」：' + JSON.stringify(card.btns));
  if (!card.btns.includes('放弃')) throw new Error('卡片没有「放弃」');
  return `${card.text.slice(0, 44)}…（离开前 ${s0.turns} 条发言）`;
});

await check('R2 点「继续这一场」回到同一场，发言还在', async () => {
  const errsBefore = errs.length;
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('继续这一场')); b.click(); return true})()`);
  await waitFor(`location.hash.indexOf('/match') >= 0`, '没回到对局页', 20000);
  await sleep(1800);
  const s1 = await store();
  if (String(s1.matchId) !== String(MID)) throw new Error('回来的不是同一场：' + s1.matchId);
  if (s1.turns < 1) throw new Error('发言没了：' + s1.turns);
  await waitFor(`document.querySelectorAll('.msg').length > 0`, '消息气泡', 20000);
  const bubbles = await ev(`document.querySelectorAll('.msg').length`);
  if (errs.length > errsBefore) throw new Error('回来的过程里有 JS 异常：' + errs[errs.length - 1]);
  return `matchId=${s1.matchId} · ${s1.turns} 条发言 / ${bubbles} 个气泡`;
});

await check('R3 手动往上翻不被拽回底部，并出现「↓ 回到底部」', async () => {
  await ev(`(()=>{const el=document.querySelector('.chat');
    el.scrollTop = 0; el.dispatchEvent(new Event('scroll',{bubbles:true})); return true})()`);
  await sleep(350);
  const s = await store();
  if (s.stickBottom) throw new Error('滚到顶部了 stickBottom 还是 true');
  if (!(await tipVisible())) throw new Error('没有「回到底部」提示');
  const top1 = await ev(`document.querySelector('.chat').scrollTop`);
  await sleep(1200);   // 期间若有打字机在跑，也不该把我拽回去
  const top2 = await ev(`document.querySelector('.chat').scrollTop`);
  if (top2 > top1 + 30) throw new Error('被拽回底部了：' + top1 + ' → ' + top2);
  return `scrollTop ${top1} → ${top2}（未被拽回）`;
});

await check('R4 滚轮立刻解除跟随并记下 lastUserScroll（打字机靠它判断）', async () => {
  const before = (await store()).lastUserScroll;
  await ev(`(()=>{const el=document.querySelector('.chat');
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-120})); return true})()`);
  await sleep(200);
  const s = await store();
  if (s.stickBottom) throw new Error('滚轮后还在跟随');
  if (!(s.lastUserScroll > before)) throw new Error('lastUserScroll 没更新：' + before + ' → ' + s.lastUserScroll);
  const fresh = Date.now() - s.lastUserScroll;
  if (fresh > 2000) throw new Error('lastUserScroll 不是刚才更新的：' + fresh + 'ms 前');
  return 'lastUserScroll 刚更新（' + fresh + 'ms 前），跟随已解除';
});

await check('R5 点「↓ 回到底部」→ 重新贴底、提示消失', async () => {
  await ev(`(()=>{const t=[...document.querySelectorAll('button')].find(x=>x.textContent.indexOf('回到底部')>=0); t.click(); return true})()`);
  await sleep(400);
  const bottom = await ev(`(()=>{const el=document.querySelector('.chat');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 20})()`);
  const s = await store();
  if (!bottom) throw new Error('没贴到底');
  if (await tipVisible()) throw new Error('提示没消失');
  if (!s.stickBottom) throw new Error('stickBottom 没恢复 true');
  return '已贴底，提示收起，stickBottom=true';
});

await check('R6 应用内切走再回来：滚动位置保留（不跳顶也不跳底）', async () => {
  const target = await ev(`(()=>{const el=document.querySelector('.chat');
    const mid = Math.max(0, Math.round((el.scrollHeight - el.clientHeight) * 0.45));
    el.scrollTop = mid;
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-100}));
    el.dispatchEvent(new Event('scroll',{bubbles:true}));
    return mid})()`);
  await sleep(400);
  await nav('辩论记录');       // 应用内离开
  await nav('单人辩论');
  await waitFor(`document.body.innerText.indexOf('有一场还没打完') >= 0`, '未完成对局卡片', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('继续这一场')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.chat')`, '回到对局', 25000);
  await sleep(800);
  const now = await ev(`document.querySelector('.chat').scrollTop`);
  if (Math.abs(now - target) > 80) throw new Error('滚动位置没保留：期望≈' + target + '，实际 ' + now);
  return `离开时 ${target} → 回来 ${now}`;
});

await check('R7 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

// 跑完把这一套改动过的本地偏好清掉：sy_seats / sy_tier 会被后面的脚本当成默认值，
// 留着会让别的套件（例如「多选席位 → 发言次数」）拿到意外的初始状态，跑出假失败。
await ev(`(function(){ localStorage.removeItem('sy_seats'); localStorage.removeItem('sy_tier');
  localStorage.removeItem('sy_mode'); return true })()`).catch(() => {});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
