// Vue 迁移 · 批 4 自检：入口切换 + 侧栏 15 项逐个点（含旧链接兜底 / 旧资源 404）
//
// 用法：node server/scripts/selftest_vue_entry.mjs [cdpPort] [baseUrl]
//
// 这一套验的是「批 4 之后用户真正看到的东西」：
//   1. 访问 / 会落到新版（旧 index.html 只剩跳转）；
//   2. 侧栏 10 个入口 + 底部「我的」逐个点得开，且每一屏都有实质内容（不是空白/不是报错）；
//   3. 老链接 /?v=xxx 落到新版，不再 404 或停在旧页；
//   4. 旧静态资源（js/**、css/app.css、admin.html）确实已删除；
//   5. 全程零 JS 异常。
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
  if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 180));
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

const stamp = Date.now().toString().slice(-6);
const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const me = await call('POST', '/api/auth/register', { account: 'en' + stamp, password: 'abc12345' });
if (!me.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = me.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '入口甲' + stamp })
});
// 充点钱，免得进单人/房间时提示余额不足
const order = await call('POST', '/api/pay/orders', { amountCents: 1000 }, TOKEN);
if (order.body?.orderId) {
  await call('POST', '/api/pay/callback', {
    orderId: order.body.orderId,
    amountCents: 1000,
    sign: order.body.sign,
    tradeNo: 'MOCK-' + Date.now()
  }, TOKEN);
}

await check('B4-1 访问 / → 落到新版（旧 index.html 只剩跳转）', async () => {
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);
  const st = await ev(`({path: location.pathname, hash: location.hash,
                        oldPage: typeof S !== 'undefined',
                        app: !!document.querySelector('#app'),
                        navCount: document.querySelectorAll('#nav a').length})`);
  if (st.oldPage) throw new Error('还在旧页');
  if (st.path.indexOf('/v2/index.html') < 0) throw new Error('没落到新版：' + st.path);
  if (!st.app) throw new Error('新版没渲染');
  return st.path + st.hash + ' · 侧栏 ' + st.navCount + ' 项';
});

// 登录（拿令牌写 localStorage，模拟已登录用户）
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);

const ITEMS = [
  ['单人辩论', 'solo'],
  ['多人辩论', 'room'],
  ['热辩榜', 'hot'],
  ['能力分析', 'diag'],   // 批 5 改名：能力诊断 → 能力分析
  ['辩论记录', 'records'],
  ['讨论社区', 'community'],
  ['视频', 'video'],
  ['消息', 'chat'],
  ['好友', 'friends'],
  ['通知', 'notify']
];

/**
 * 登录态自愈：写 token → 重新开页面 → 等「我的」真的渲染出昵称。
 *
 * 不能只 sleep 一下就开始点：后端刚重启时 /api/auth/me 的第一跳可能还在冷启动，
 * app 会在恢复失败时清掉 token，于是后面的点击全被守卫弹回登录页（实测踩过）。
 */
async function ensureLoggedIn() {
  for (let i = 0; i < 3; i++) {
    await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/me' });
    await sleep(1200);
    await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
    try {
      await waitFor(`!document.querySelector('#authAccount') && !!document.querySelector('.me')`, '登录态', 10000);
      return true;
    } catch (e) {
      /* 再来一次 */
    }
  }
  throw new Error('登录态恢复不了（三种重试都失败）');
}

await check('B4-2 侧栏 10 个入口逐个点开，每一屏都有实质内容', async () => {
  await ensureLoggedIn();
  const results = [];
  for (const [label, key] of ITEMS) {
    // 只在第一次进页面时加载，之后靠应用内路由点击切换（真实用户路径，也避免和页面加载赛跑）
    await waitFor(`document.querySelectorAll('#nav a').length >= 10`, '侧栏', 20000);
    const clicked = await ev(`(()=>{const a=[...document.querySelectorAll('#nav a')].find(x=>x.textContent.indexOf(${JSON.stringify(label)})>=0);
      if(!a) return false; a.click(); return true})()`);
    if (!clicked) throw new Error('侧栏找不到「' + label + '」');
    // 精确等 hash 变成目标路由：用 indexOf 会匹配到上一条（踩过）
    await waitFor(`location.hash === ${JSON.stringify('#/' + key)}`, label + ' 路由没切过去（当前 ' + '）', 12000);
    await waitFor(`((document.querySelector('main, .vwrap, #main') || document.body).innerText || '').replace(/\\s+/g,' ').trim().length > 30`,
      label + ' 这一屏几乎空白', 12000);
    const st = await ev(`({hash: location.hash,
                          text: (document.querySelector('main, .vwrap, #main') || document.body).innerText.replace(/\\s+/g,' ').trim(),
                          oldPage: typeof S !== 'undefined'})`);
    if (st.oldPage) throw new Error(label + ' 落到旧页了');
    if (st.hash !== '#/' + key) throw new Error(label + ' 路由不对：' + st.hash);
    results.push(label + '→' + key);
  }
  return results.join(' / ');
});

await check('B4-3 底部「我的」也能进（#/me，昵称/改密/退出都在）', async () => {
  await waitFor(`!!document.querySelector('.me')`, '侧栏底部「我的」', 15000);
  const ok = await ev(`(()=>{const m=document.querySelector('.me'); if(!m) return false; m.click(); return true})()`);
  if (!ok) throw new Error('侧栏底部「我的」没找到');
  await waitFor(`location.hash === '#/me'`, '没进 #/me', 12000);
  await waitFor(`!!document.querySelector('#authName')`, '「我的」面板', 12000);
  const st = await ev(`({hash: location.hash,
                        btns: [...document.querySelectorAll('.auth-actions button')].map(b=>b.textContent.trim()).join('|')})`);
  if (!st.btns) throw new Error('没有操作按钮');
  return st.hash + ' · 按钮 ' + st.btns;
});

await check('B4-4 老链接兜底：/?v=hotb 落到新版（不 404、不停旧页）', async () => {
  await send('Page.navigate', { url: BASE + '/?v=hotb' });
  await sleep(2600);
  const st = await ev(`({path: location.pathname, hash: location.hash, oldPage: typeof S !== 'undefined'})`);
  if (st.oldPage) throw new Error('停在旧页');
  if (st.path.indexOf('/v2/index.html') < 0) throw new Error('没落到新版：' + st.path);
  return st.path + st.hash;
});

await check('B4-5 旧静态资源确实已删除（js / css / admin.html 均 404）', async () => {
  const targets = ['/js/core.js', '/js/views/community.js', '/css/app.css', '/admin.html', '/index.backup.html', '/community.html'];
  const bad = [];
  for (const t of targets) {
    const r = await fetch(BASE + t);
    if (r.status !== 404) bad.push(t + '=' + r.status);
  }
  if (bad.length) throw new Error('这些还在：' + bad.join(', '));
  return targets.length + ' 个旧资源全部 404';
});

await check('B4-6 新版自身的静态资源可访问（index.html / js / css）', async () => {
  const html = await (await fetch(BASE + '/v2/index.html')).text();
  const m = html.match(/assets\/(index-[\w-]+\.js)/);
  if (!m) throw new Error('/v2/index.html 里没找到入口 JS');
  const js = await fetch(BASE + '/v2/assets/' + m[1]);
  if (js.status !== 200) throw new Error('入口 JS 打不开：' + js.status);
  const css = html.match(/assets\/(index-[\w-]+\.css)/);
  if (css) {
    const c = await fetch(BASE + '/v2/assets/' + css[1]);
    if (c.status !== 200) throw new Error('入口 CSS 打不开：' + c.status);
  }
  return m[1] + (css ? ' + ' + css[1] : '');
});

await check('B4-7 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
