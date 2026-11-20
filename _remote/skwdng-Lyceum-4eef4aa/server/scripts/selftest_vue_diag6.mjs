// Vue 迁移 · 批 5 自检①：能力分析（六维雷达 / 最近 N 场 / 空状态 / 动画）
//
// 用法：node server/scripts/selftest_vue_diag6.mjs [cdpPort] [baseUrl]
//
// 开头先清 localStorage 并等应用挂载完成再断言（否则会吃到上一个脚本留下的登录态，跑出假失败）。
//
// 覆盖：
//   D6-1 侧栏与页面标题都是「能力分析」（旧叫「能力诊断」）
//   D6-2 一场没打：空状态（不画雷达、不显示假维度）
//   D6-3 打 4 场后：雷达有 6 条轴且含「协同」，每个轴都有数值
//   D6-4 单人局的「协同」按中性 60 记（后端只在有真人队友时才计分）
//   D6-5 「最近 3 场」→ 副标题与 window 跟着变；「全部」→ 回到总场次
//   D6-6 条形图数字有 0→目标值的滚动（加载后最终等于维度值）
//   D6-7 全程零 JS 异常
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

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

// ---------- 清 localStorage（连同旧的登录态）----------
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

// ---------- 造数据：新账号 + 打 4 场（满座都属于我，快速打完）----------
const reg = await call('POST', '/api/auth/register', { account: 'dg' + stamp, password: 'abc12345' });
if (!reg.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = reg.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '六维甲' + stamp })
});
const order = await call('POST', '/api/pay/orders', { amountCents: 5000 }, TOKEN);
if (order.body?.orderId) {
  await call('POST', '/api/pay/callback', {
    orderId: order.body.orderId,
    amountCents: 5000,
    sign: order.body.sign,
    tradeNo: 'MOCK-' + Date.now()
  }, TOKEN);
}

const topics = await call('GET', '/api/topics', null, TOKEN);
const ALL_SEATS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];

/** 打一场：SPRINT + 8 席全是我 → 每一步都轮到我，提交到结束 */
async function playOne(i) {
  const mk = await call('POST', '/api/matches', {
    topicId: topics.body[i % topics.body.length].id,
    seats: ALL_SEATS,
    mode: 'SPRINT',
    pace: 'tight',
    difficulty: 'novice',
    tier: 'PRO'
  }, TOKEN);
  if (!mk.body?.matchId) return null;
  const mid = mk.body.matchId;
  for (let k = 0; k < 40; k++) {
    const d = await call('GET', '/api/matches/' + mid, null, TOKEN);
    if (!d.body?.match) return mid;
    if (d.body.match.status !== 'RUNNING') return mid;
    if (d.body.waitingForMe) {
      await call('POST', '/api/matches/' + mid + '/turns', {
        content: '我方认为应先立住判准，再谈效率，否则结论无法核验。',
        inputType: 'kb'
      }, TOKEN);
    }
    await sleep(120);
  }
  return mid;
}

let played = 0;
for (let i = 0; i < 4; i++) {
  const mid = await playOne(i);
  if (mid) played++;
  await sleep(200);
}
const diagAll = await call('GET', '/api/diag', null, TOKEN);

// 登录进界面
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);

await check('D6-1 侧栏与页面标题都是「能力分析」', async () => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/diag' });
  await sleep(1600);
  await waitFor(`!!document.querySelector('.pg')`, '页面挂载', 20000);
  const st = await ev(`({title: (document.querySelector('.pg')||{}).textContent.trim(),
                        nav: [...document.querySelectorAll('.nav a')].map(a=>a.textContent.trim()).join('|'),
                        hasOld: document.body.innerText.indexOf('能力诊断') >= 0})`);
  if (st.title !== '能力分析') throw new Error('页面标题不对：' + st.title);
  if (st.nav.indexOf('能力分析') < 0) throw new Error('侧栏没有「能力分析」：' + st.nav);
  if (st.hasOld) throw new Error('页面上还有「能力诊断」字样');
  return st.title;
});

await check('D6-2 空状态：新账号不打图、不显示假维度', async () => {
  // 换一个一场没打的新账号
  const fresh = await call('POST', '/api/auth/register', { account: 'dg0' + stamp, password: 'abc12345' });
  const T0 = fresh.body.token;
  await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(T0)}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/diag' });
  await sleep(1800);
  await waitFor(`!!document.querySelector('.pg')`, '页面挂载', 20000);
  await sleep(600);
  const st = await ev(`({empty: document.body.innerText.indexOf('还没有数据') >= 0,
                        radar: !!document.querySelector('svg .radar-grow'),
                        goBtn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('去打第一场')),
                        nums: document.querySelectorAll('.dim-num').length})`);
  if (!st.empty) throw new Error('没有空状态文案');
  if (!st.goBtn) throw new Error('没有「去打第一场」按钮');
  if (st.radar || st.nums) throw new Error('空状态却画了图（radar=' + st.radar + ', nums=' + st.nums + '）');
  return '空状态正常，未渲染雷达';
});

await check('D6-3 雷达 6 条轴（含协同）且每轴有数值', async () => {
  if (played < 3) throw new Error('只打成了 ' + played + ' 场，数据不够');
  await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/diag' });
  await sleep(1800);
  await waitFor(`!!document.querySelector('svg .radar-grow')`, '雷达图', 25000);
  const st = await ev(`(()=>{
    const texts = [...document.querySelectorAll('svg text')].map(t=>t.textContent.trim());
    const names = texts.filter(t=>['立论','论证','表达','应变','论据','协同'].includes(t));
    const vals = [...document.querySelectorAll('svg text.radar-val')].map(t=>t.textContent.trim());
    return {names, vals, dots: document.querySelectorAll('svg circle').length,
            axes: document.querySelectorAll('svg line').length};
  })()`);
  if (st.names.length !== 6) throw new Error('轴名不是 6 个：' + JSON.stringify(st.names));
  if (st.names.indexOf('协同') < 0) throw new Error('缺「协同」维度');
  if (st.vals.length !== 6) throw new Error('数值不是 6 个：' + JSON.stringify(st.vals));
  if (st.dots !== 6) throw new Error('顶点圆点不是 6 个：' + st.dots);
  return st.names.join('/') + ' · 数值 ' + st.vals.join('/');
});

await check('D6-4 单人局「协同」按中性 60 记（不因 AI 补位失真）', async () => {
  // 轴名与数值是同一 v-for 渲染的，顺序一致，所以按下标配对最稳
  const st = await ev(`(()=>{
    const names = [...document.querySelectorAll('svg text')]
      .map(t=>t.textContent.trim())
      .filter(t=>['立论','论证','表达','应变','论据','协同'].includes(t));
    const vals = [...document.querySelectorAll('svg text.radar-val')].map(t=>t.textContent.trim());
    const i = names.indexOf('协同');
    return { names, vals, idx: i, val: i >= 0 ? vals[i] : null };
  })()`);
  if (st.idx < 0) throw new Error('雷达里没有「协同」：' + JSON.stringify(st.names));
  if (st.val !== '60') throw new Error('协同显示 ' + st.val + '，应为中性 60（全量 ' + JSON.stringify(st.vals) + '）');
  const apiVal = diagAll.body && diagAll.body.dims && diagAll.body.dims['协同'];
  if (Number(apiVal) !== 60) throw new Error('后端协同也不是 60：' + apiVal);
  return '协同 = 60（前端与后端一致；六维 ' + st.vals.join('/') + '）';
});

await check('D6-5 切「最近 3 场 / 全部」：副标题与窗口跟着变', async () => {
  const before = await ev(`(document.querySelector('.sub')||{}).textContent.trim()`);
  const clicked = await ev(`(()=>{const b=[...document.querySelectorAll('.card button')].find(x=>x.textContent.includes('最近 3 场'));
    if(!b) return false; b.click(); return true})()`);
  if (!clicked) throw new Error('找不到「最近 3 场」按钮');
  await sleep(1600);
  const mid = await ev(`(document.querySelector('.sub')||{}).textContent.trim()`);
  if (mid.indexOf('最近 3 场') < 0) throw new Error('切 3 场后副标题没变：' + mid);
  const win3 = await call('GET', '/api/diag?n=3', null, TOKEN);
  if (Number(win3.body?.window) !== 3) throw new Error('接口 window 不是 3：' + win3.body?.window);

  await ev(`(()=>{const b=[...document.querySelectorAll('.card button')].find(x=>x.textContent.trim().startsWith('全部'));
    if(b) b.click(); return true})()`);
  await sleep(1600);
  const after = await ev(`({sub: (document.querySelector('.sub')||{}).textContent.trim(),
                          nums: document.querySelectorAll('.dim-num').length})`);
  if (after.sub.indexOf('全部') < 0) throw new Error('切回全部后副标题不对：' + after.sub);
  if (after.nums !== 6) throw new Error('切窗口后维度条数量变了：' + after.nums);
  return `${before.split('·')[0].trim()} → ${mid.split('·')[0].trim()} → ${after.sub.split('·')[0].trim()}`;
});

await check('D6-6 条形图数字滚到目标值（0→value 动画）', async () => {
  const targets = await ev(`(()=>{
    const dims=[...document.querySelectorAll('svg text.radar-val')].map(t=>t.textContent.trim());
    return dims.map(Number);
  })()`);
  await sleep(1300);   // 等动画结束（900ms）
  const shown = await ev(`[...document.querySelectorAll('.dim-num')].map(el=>Number(el.textContent.trim()))`);
  if (shown.length !== 6) throw new Error('维度条不是 6 个：' + shown.length);
  const bad = shown.filter((v, i) => v !== targets[i]);
  if (bad.length) throw new Error('显示值与目标值不一致：' + JSON.stringify({ shown, targets }));
  return '显示 ' + shown.join('/') + '，与目标一致';
});

await check('D6-7 全程零 JS 异常', async () => {
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
