// Vue 迁移 · 批 1 自检：通知 / 好友 / 热辩榜 / 记录 / 诊断 / 钱包（含换账号不串状态）
//
// 用法：node server/scripts/selftest_vue_batch1.mjs [cdpPort] [baseUrl]
//   baseUrl = 后端根地址（http://localhost:8080）或线上形态（http://localhost:8787/siyige）
//
// 前提：后端在跑 + Redis 在跑（通知未读计数用 Redis）。两个账号由脚本自己注册。
const PORT = process.argv[2] || '9456';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const V2 = BASE + '/v2/index.html#/';
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
const send = (m, p = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pend.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result.value;
};
const waitFor = async (x, l, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(x)) return true;
    await sleep(150);
  }
  throw new Error('timeout:' + l);
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

const stamp = Date.now().toString().slice(-6);
const ACC_A = 'wa' + stamp;
const ACC_B = 'wb' + stamp;
const PWD = 'abc12345';

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/** 直接打接口造数据（账号 / 好友请求），用例本身验的是 UI。
 *
 * ⚠️ 用 **Node 侧** fetch，不在页面里发：走 8787 代理时页面源与接口不同源，
 * 页面内 fetch 会被 CORS 拦掉（Failed to fetch），看起来像后端坏了。
 */
const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

/** 打开新前端某个 hash 路由。
 *
 * ⚠️ 必须带一个变化的 query 做**整页重载**：只改 hash 时浏览器不会重新加载文档，
 * Vue 应用会带着上一个用例的内存状态继续跑（登录态 / store 都不会重置），
 * 于是"清了 localStorage 却还是登录态"这种假失败就会出现。
 */
async function openV2(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1500);
}

async function fill(sel, v) {
  await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
    el.value=${JSON.stringify(v)}; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
}

async function clickText(sel, text) {
  return ev(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.textContent.includes(${JSON.stringify(text)}));
    if(!el) return false; el.click(); return true;})()`);
}

/** 旧页与新页共用同一批 class 名，断言前必须先确认这一屏确实是 Vue 渲染的，否则会假通过 */
async function assertVuePage(label) {
  const ok = await ev(`typeof S === 'undefined' && !!document.querySelector('.sb .logo b')`);
  if (!ok) throw new Error('当前不在 Vue 页面里（' + label + '）：' + (await ev('location.href')));
}

async function loginUi(acc) {
  await openV2('login');
  await ev(`localStorage.removeItem('sy_jwt'); true`);
  await openV2('login');          // 整页重载一次，让应用在没有 token 的状态下启动
  await waitFor(`!!document.querySelector('#authAccount') || !!document.querySelector('.sb .me .av')`, '登录表单或已登录状态');
  // 万一还带着旧登录态（localStorage 有 token），先退出再登
  if (!(await ev(`!!document.querySelector('#authAccount')`))) {
    await ev(`document.querySelector('.sb .me').click()`);
    await sleep(1200);
    await clickText('.auth-actions button', '退出登录');
    await sleep(1800);
  }
  await waitFor(`!!document.querySelector('#authAccount')`, '登录表单');
  await fill('#authAccount', acc);
  await fill('#authPassword', PWD);
  await ev(`document.querySelector('.auth-actions button').click()`);
  await sleep(2200);
}

// ==================== 准备：两个账号 + 一条好友请求 ====================
const a = await call('POST', '/api/auth/register', { account: ACC_A, password: PWD });
const b = await call('POST', '/api/auth/register', { account: ACC_B, password: PWD });
if (!a.body || !a.body.token || !b.body || !b.body.token) {
  console.log('准备账号失败：' + JSON.stringify({ a, b }).slice(0, 300));
  process.exit(1);
}
await call('POST', '/api/social/friends/requests', { toId: ACC_A, note: '批1自检' }, b.body.token);

// ==================== 用例 ====================

await check('B1-1 通知页：列表渲染 + 未读底色 + 拉完角标清零（接口有副作用）', async () => {
  await loginUi(ACC_A);
  await openV2('notify');
  await assertVuePage('#/notify');
  await waitFor(`document.querySelectorAll('.notify-row').length > 0`, '通知列表', 20000);
  const st = await ev(`({rows: document.querySelectorAll('.notify-row').length,
                        unread: document.querySelectorAll('.notify-row.unread').length,
                        badge: (()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('通知'));
                          const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():'';})(),
                        text: document.querySelector('.notify-text').textContent})`);
  if (!st.rows) throw new Error('没有通知行');
  if (st.badge) throw new Error('拉完列表角标没清零：' + st.badge);
  return `行=${st.rows} 未读=${st.unread} 角标已清 文案=${st.text.slice(0, 18)}`;
});

await check('B1-2 通知点击（好友类）→ 跳好友页', async () => {
  await assertVuePage('点击前');
  await ev(`document.querySelector('.notify-row').click()`);
  await waitFor(`location.hash.indexOf('friends') >= 0`, '没跳到好友页', 10000);
  await assertVuePage('点击后');
  const hash = await ev(`location.hash`);
  return hash;
});

await check('B1-3 好友页：待处理请求出现 → 接受 → 进入好友列表', async () => {
  await assertVuePage('#/friends');
  await waitFor(`document.querySelectorAll('.fr-row').length > 0`, '好友页内容', 20000);
  const before = await ev(`({req: [...document.querySelectorAll('.card-h')].filter(h=>h.textContent.includes('待处理')).length,
                             rows: document.querySelectorAll('.fr-row').length})`);
  if (!before.req) throw new Error('没显示待处理请求');
  await clickText('.fr-act button', '接受');
  await sleep(1800);
  const after = await ev(`({pending: [...document.querySelectorAll('.card-h')].filter(h=>h.textContent.includes('待处理')).length,
                           friends: [...document.querySelectorAll('.fr-row')].filter(r=>r.textContent.includes(${JSON.stringify(ACC_B)})).length})`);
  if (after.pending) throw new Error('接受后请求区没消失');
  if (!after.friends) throw new Error('接受后好友列表里没有对方');
  return '已接受并进入好友列表';
});

await check('B1-4 好友搜索：搜对方显示「已是好友」，搜自己显示「这是你自己」', async () => {
  await fill('.inp', ACC_B);
  await clickText('.fr-search button', '搜索');
  await sleep(1200);
  const r1 = await ev(`[...document.querySelectorAll('.fr-act button, .fr-act span')].map(x=>x.textContent.trim()).join('|')`);
  if (r1.indexOf('已是好友') < 0) throw new Error('搜对方没显示已是好友：' + r1);
  await fill('.inp', ACC_A);
  await clickText('.fr-search button', '搜索');
  await sleep(1200);
  const r2 = await ev(`[...document.querySelectorAll('.fr-act button, .fr-act span')].map(x=>x.textContent.trim()).join('|')`);
  if (r2.indexOf('这是你自己') < 0) throw new Error('搜自己没提示：' + r2);
  return '两个按钮态都正确';
});

await check('B1-5 好友「发消息」→ 迁移期回落旧页消息', async () => {
  const clicked = await clickText('.fr-act button', '发消息');
  if (!clicked) throw new Error('没有发消息按钮');
  await sleep(2600);
  const where = await ev(`location.pathname + location.search`);
  if (where.indexOf('v=chat') < 0) throw new Error('没回落旧页聊天：' + where);
  await waitFor(`!!document.querySelector('#nav a')`, '旧页外壳', 15000);
  const isOld = await ev(`typeof S !== 'undefined'`);   // 旧页有全局 S，新页没有
  if (!isOld) throw new Error('还在 Vue 页里，没真回落旧页');
  return where + '（旧页渲染正常）';
});

await check('B1-6 热辩榜：12 条 / 分数降序 / 热度条按比例 / 「开辩」回落旧页单人', async () => {
  await openV2('hot');
  await waitFor(`document.querySelectorAll('table.t tbody tr').length > 0`, '热榜表格', 20000);
  const st = await ev(`(()=>{
    const rows=[...document.querySelectorAll('table.t tbody tr')];
    const scores=rows.map(r=>Number(r.cells[3].textContent.trim()));
    const widths=rows.map(r=>r.querySelector('.heatbar i').style.width);
    return {n:rows.length, sorted: scores.every((v,i)=>i===0||scores[i-1]>=v), w0:widths[0], wLast:widths[widths.length-1]};
  })()`);
  if (st.n < 5) throw new Error('热榜条数太少：' + st.n);
  if (!st.sorted) throw new Error('没有按分数降序');
  if (st.w0 !== '100%') throw new Error('第一名热条不是 100%：' + st.w0);
  const navigated = await ev(`(()=>{const b=[...document.querySelectorAll('table.t button')][0]; if(!b) return false; b.click(); return true;})()`);
  if (!navigated) throw new Error('没有开辩按钮');
  await sleep(2400);
  const where = await ev(`location.pathname + location.search`);
  if (where.indexOf('v=solo') < 0) throw new Error('开辩没回落旧页单人：' + where);
  return `${st.n} 条，降序 OK，首条 ${st.w0}/末条 ${st.wLast}`;
});

await check('B1-7 辩论记录：三张统计卡 + 表格或空态', async () => {
  await openV2('records');
  await sleep(1600);
  const st = await ev(`({cards: document.querySelectorAll('#main .card').length,
                        hasEmpty: !!document.querySelector('.empty'),
                        rows: document.querySelectorAll('table.t tbody tr').length,
                        title: document.querySelector('h1.pg').textContent})`);
  if (st.title !== '辩论记录') throw new Error('标题不对');
  if (st.cards < 4) throw new Error('统计卡不齐：' + st.cards);
  return `卡片 ${st.cards} 个，表格行 ${st.rows} 行${st.hasEmpty ? '（空态）' : ''}`;
});

await check('B1-8 能力诊断：雷达 SVG + 五维条 + 连续天数', async () => {
  await openV2('diag');
  await sleep(1800);
  const st = await ev(`({svg: document.querySelectorAll('#main svg polygon').length,
                        dims: document.querySelectorAll('.dim').length,
                        tag: (document.querySelector('.tag.g')||{}).textContent,
                        title: document.querySelector('h1.pg').textContent})`);
  if (st.title !== '能力诊断') throw new Error('标题不对');
  if (!st.svg) throw new Error('雷达图没画出来');
  return `雷达多边形 ${st.svg} 个，维度条 ${st.dims} 个，${(st.tag || '').trim()}`;
});

await check('B1-9 钱包：充值 ¥1.00 → 页内收银台 → 余额与流水更新', async () => {
  await openV2('wallet');
  await waitFor(`!!document.querySelector('.big')`, '钱包余额', 20000);
  await sleep(800);
  const before = await ev(`document.querySelector('.big').textContent.trim()`);
  const ok = await clickText('.btn.ghost', '充 ¥1.00');
  if (!ok) throw new Error('没找到充值按钮');
  await waitFor(`!!document.querySelector('.mask')`, '收银台弹窗', 15000);
  const modal = await ev(`({title: document.querySelector('.panel h2').textContent,
                            amount: document.querySelector('.big').textContent.trim()})`);
  if (modal.title.indexOf('模拟收银台') < 0) throw new Error('收银台没出现');
  await clickText('.panel button', '确认已付款');
  await sleep(2200);
  const after = await ev(`({bal: document.querySelector('.big').textContent.trim(),
                            mask: !!document.querySelector('.mask'),
                            tx: [...document.querySelectorAll('.kv')].map(x=>x.textContent).join('|')})`);
  if (after.mask) throw new Error('支付后弹窗没关');
  if (after.bal === before) throw new Error(`余额没变（${before} → ${after.bal}）`);
  if (after.tx.indexOf('+1.00') < 0) throw new Error('流水里没有这笔：' + after.tx.slice(0, 60));
  return `${before} → ${after.bal}，流水已记`;
});

await check('B1-10 侧栏余额胶囊：显示余额，点击进钱包页', async () => {
  await openV2('hot');
  await sleep(1500);
  const chip = await ev(`(()=>{const c=document.querySelector('.sb .wchip'); return c?c.textContent.trim():null})()`);
  if (!chip) throw new Error('侧栏没有余额胶囊');
  await ev(`document.querySelector('.sb .wchip').click()`);
  await sleep(1500);
  const hash = await ev(`location.hash`);
  if (hash.indexOf('wallet') < 0) throw new Error('点胶囊没进钱包页：' + hash);
  return `胶囊=${chip}`;
});

await check('B1-11 换账号：余额/角标不串（坑 #6）', async () => {
  await openV2('me');
  await waitFor(`!!document.querySelector('#authName')`, '我的面板', 15000);
  await clickText('.auth-actions button', '退出登录');
  await sleep(2200);
  await loginUi(ACC_B);
  await openV2('wallet');
  await waitFor(`!!document.querySelector('.big')`, '钱包余额', 20000);
  await sleep(1000);
  const st = await ev(`({bal: document.querySelector('.big').textContent.trim(),
                        chip: (document.querySelector('.sb .wchip')||{}).textContent,
                        badge: (()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('通知'));
                          const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():'';})()})`);
  // 新账号自带 ¥1.00 体验金；关键是**不能等于 A 充值后的余额**（¥2.00），否则就是串号
  if (st.bal.indexOf('2.00') >= 0) throw new Error('B 的余额是 A 的（串号了）：' + st.bal);
  if (st.bal.indexOf('1.00') < 0) throw new Error('B 的余额异常：' + st.bal);
  if (st.chip && st.chip.indexOf('2.00') >= 0) throw new Error('侧栏胶囊还是 A 的余额：' + st.chip);
  return `B 余额 ${st.bal}（A 已充到 ¥2.00），胶囊 ${st.chip}，角标「${st.badge || '无'}」`;
});

await check('B1-12 旧页仍可用（通知/好友入口照旧）+ 全程零 JS 异常', async () => {
  await send('Page.navigate', { url: BASE + '/?v=notify' });
  await sleep(2500);
  await waitFor(`!!document.querySelector('#nav a')`, '旧页外壳', 15000);
  const old = await ev(`({nav: document.querySelectorAll('#nav a').length,
                          rows: document.querySelectorAll('.notify-row').length,
                          main: !!document.querySelector('#main')})`);
  if (!old.main || old.nav < 10) throw new Error('旧页没正常渲染：' + JSON.stringify(old));
  const meaningful = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (meaningful.length) throw new Error('有 JS 异常：' + meaningful.slice(0, 2).join(' | '));
  return `旧页导航 ${old.nav} 项，通知行 ${old.rows} 条`;
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
