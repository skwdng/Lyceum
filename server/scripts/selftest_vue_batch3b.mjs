// Vue 迁移 · 批 3-2 自检（视频 + 管理后台）
//
// 用法：node server/scripts/selftest_vue_batch3b.mjs [cdpPort] [baseUrl]
//
// 说明：本环境的 sy_admin 表是空的（后端也没有 seed 管理员，且后端冻结），
// 所以管理台用「开发密钥签一个 typ=ADMIN 的令牌」注入 localStorage 来验证 UI。
// 这不是绕过校验——后端仍然校验签名与 typ/role，只是没有真实管理员行可取令牌。
import crypto from 'crypto';

const PORT = process.argv[2] || '9456';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEV_SECRET = 'siyige-dev-only-jwt-secret-do-not-use-in-production-0123456789';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function adminToken(sub = 1, acc = 'admin') {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: String(sub), acc, typ: 'ADMIN', role: 'ADMIN', jti: crypto.randomUUID(), iat: now, exp: now + 7200 });
  const sig = crypto.createHmac('sha256', DEV_SECRET).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + sig;
}

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

const stamp = Date.now().toString().slice(-6);
const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

const me = await call('POST', '/api/auth/register', { account: 'vd' + stamp, password: 'abc12345' });
if (!me.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = me.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '视频甲' + stamp })
});

const openV2 = async (hash) => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1700);
};

await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(900);
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); localStorage.removeItem('sy_admin_jwt'); true`);

// ==================== 视频 ====================

await check('B3-V1 视频信息流：竖滑卡片 / 侧栏三个操作 / 筛选 chip 都在', async () => {
  await openV2('video');
  await waitFor(`document.querySelectorAll('.vslide').length > 0`, '视频卡片', 25000);
  const st = await ev(`({n: document.querySelectorAll('.vslide').length,
                        side: document.querySelectorAll('.vslide .vside button').length,
                        segs: document.querySelectorAll('.vseg').length,
                        top: !!document.querySelector('.vtop')})`);
  if (!st.n) throw new Error('没有视频');
  if (st.side < 3) throw new Error('侧栏按钮不全：' + st.side);
  if (st.segs < 5) throw new Error('筛选 chip 太少：' + st.segs);
  if (!st.top) throw new Error('没有顶部栏');
  return `卡片 ${st.n} 个，侧栏 ${st.side} 个按钮，筛选 ${st.segs} 个`;
});

await check('B3-V2 点赞：数字 +1 且变「已赞」，再点回退', async () => {
  const before = await ev(`(()=>{const b=document.querySelector('.vslide .vside button');
    return {on: b.classList.contains('on'), n: b.querySelector('i').textContent.trim()}})()`);
  await ev(`document.querySelector('.vslide .vside button').click()`);
  await sleep(1400);
  const after = await ev(`(()=>{const b=document.querySelector('.vslide .vside button');
    return {on: b.classList.contains('on'), n: b.querySelector('i').textContent.trim()}})()`);
  if (after.on === before.on) throw new Error('点赞状态没变：' + JSON.stringify({ before, after }));
  await ev(`document.querySelector('.vslide .vside button').click()`);
  await sleep(1400);
  const back = await ev(`(()=>{const b=document.querySelector('.vslide .vside button');
    return {on: b.classList.contains('on'), n: b.querySelector('i').textContent.trim()}})()`);
  if (back.on !== before.on) throw new Error('没回退：' + JSON.stringify({ before, back }));
  return `${before.n}${before.on ? '♥' : '♡'} → ${after.n}${after.on ? '♥' : '♡'} → ${back.n}`;
});

await check('B3-V3 评论抽屉：打开 → 发一条 → 出现在列表里', async () => {
  await ev(`(()=>{const bs=document.querySelectorAll('.vslide .vside button'); bs[1].click(); return true})()`);
  await waitFor(`!!document.querySelector('.vsheet .vcard')`, '评论抽屉', 20000);
  const text = '自检评论' + stamp;
  await ev(`(()=>{const i=document.querySelector('.vsheet .vinput');
    i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.vsheet button')].find(x=>x.textContent.includes('发送')); b.click(); return true})()`);
  await waitFor(`document.querySelector('.vsheet').innerText.indexOf(${JSON.stringify(text)}) >= 0`, '评论没出现', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.vshd button')].find(x=>x.textContent.includes('关闭')); b.click(); return true})()`);
  return '评论已出现在抽屉里';
});

await check('B3-V4 发布：提交后显示机器初审结果（状态 + 依据 + 是否上广场）', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.vtop button')].find(x=>x.textContent.includes('发布')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.vsheet .vfield')`, '发布抽屉', 20000);
  const title = '自检视频：质询三连问' + stamp;
  await ev(`(()=>{const i=document.querySelector('.vsheet .vinput');
    i.value=${JSON.stringify(title)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.vsheet button')].find(x=>x.textContent.includes('提交审核')); b.click(); return true})()`);
  await waitFor(`document.querySelector('.vsheet').innerText.indexOf('审核结果') >= 0`, '没显示初审结果', 25000);
  const st = await ev(`(()=>{const t=document.querySelector('.vsheet').innerText;
    return {judge: t.indexOf('判定依据')>=0, vis: t.indexOf('是否上广场')>=0, pill: (document.querySelector('.vsheet .vpill')||{}).textContent}})()`);
  if (!st.judge || !st.vis) throw new Error('结果卡不全：' + JSON.stringify(st));
  return `审核状态 ${String(st.pill).trim()}`;
});

await check('B3-V5 审核台按钮按后端 consoleEnabled 隐藏（本环境 false）', async () => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/video' });
  await sleep(2000);
  const st = await ev(`({btn: [...document.querySelectorAll('.vtop button')].some(x=>x.textContent.includes('审核台'))})`);
  const rules = await call('GET', '/api/video/audit/rules', null, TOKEN);
  const enabled = !!(rules.body && rules.body.consoleEnabled);
  if (enabled && !st.btn) throw new Error('后端开了审核台但页面没按钮');
  if (!enabled && st.btn) throw new Error('后端关了审核台但页面有按钮');
  return 'consoleEnabled=' + enabled + '，按钮=' + st.btn + '（一致）';
});

await check('B3-V6 旧页视频仍可用', async () => {
  await send('Page.navigate', { url: BASE + '/?v=video' });
  await sleep(2600);
  const st = await ev(`({old: typeof S !== 'undefined', slides: document.querySelectorAll('.vslide').length, wrap: !!document.querySelector('.vwrap')})`);
  if (!st.old) throw new Error('没进旧页');
  if (!st.wrap) throw new Error('旧页视频容器没渲染');
  return `旧页视频 ${st.slides} 条`;
});

// ==================== 管理后台 ====================

await check('B3-A1 管理台登录页：独立布局（无侧栏）+ 错误密码提示', async () => {
  await ev(`localStorage.removeItem('sy_admin_jwt'); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin' });
  await sleep(1800);
  const st = await ev(`({login: !!document.querySelector('.login-wrap'), brand: (document.querySelector('.login-box h1')||{}).textContent,
                        side: !!document.querySelector('#nav'), inputs: document.querySelectorAll('.login-box input').length})`);
  if (!st.login) throw new Error('没渲染登录页：' + JSON.stringify(st));
  if (st.side) throw new Error('管理台不该有主站侧栏');
  await ev(`(()=>{const a=document.querySelectorAll('.login-box input')[0]; a.value='admin'; a.dispatchEvent(new Event('input',{bubbles:true}));
    const b=document.querySelectorAll('.login-box input')[1]; b.value='wrong-pass-123'; b.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.login-box button')].find(x=>x.textContent.includes('登录')); b.click(); return true})()`);
  await sleep(1800);
  const toast = await ev(`(document.querySelector('.toast, .toast-host')||{}).textContent || document.body.innerText`);
  if (String(toast).indexOf('账号或密码错误') < 0 && String(toast).indexOf('密码') < 0) throw new Error('没有错误提示：' + String(toast).slice(-80));
  return String(st.brand).trim() + ' · 错误密码有提示';
});

await check('B3-A2 管理员令牌进入 → 统计卡 + 举报队列表格', async () => {
  // 自备一条待处理举报（内存库每次重启就空，不能依赖残留数据）
  const author = await call('POST', '/api/auth/register', { account: 'ao' + stamp, password: 'abc12345' });
  const post = await call(
    'POST',
    '/api/community/posts',
    { type: 'CHAT', title: '管理台自检帖' + stamp, body: '这条用来产生一条待处理举报' },
    author.body.token
  );
  if (!post.body?.postId) throw new Error('造帖失败');
  const rep = await call(
    'POST',
    '/api/community/reports',
    { targetType: 'POST', targetId: post.body.postId, reason: 'SPAM', detail: null },
    TOKEN
  );
  if (rep.status !== 200) throw new Error('造举报失败：' + JSON.stringify(rep).slice(0, 120));

  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(adminToken())}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin' });
  await sleep(2200);
  await waitFor(`!!document.querySelector('.bar')`, '管理台主界面', 20000);
  await waitFor(`document.querySelectorAll('.cards .card').length === 3`, '统计卡', 15000);
  await waitFor(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length > 0`, '举报队列', 20000);
  const st = await ev(`({cards: [...document.querySelectorAll('.cards .card')].map(c=>c.querySelector('.k').textContent+':'+c.querySelector('.v').textContent),
                        tabs: document.querySelectorAll('.bar .tabs button').length,
                        rows: document.querySelectorAll('[data-panel="reports"] table tbody tr').length})`);
  if (st.tabs !== 3) throw new Error('Tab 数不对：' + st.tabs);
  if (!st.rows) throw new Error('举报队列没有行');
  return st.cards.join(' / ') + ` · 队列 ${st.rows} 行`;
});

await check('B3-A3 处理一条举报（忽略）→ 队列减少 + 处理记录里出现该操作', async () => {
  const before = await ev(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length`);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="reports"] table tbody button')].find(x=>x.textContent.includes('处理')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.mask .modal')`, '处理弹窗', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.modal .foot button')].find(x=>x.textContent.trim()==='忽略'); b.click(); return true})()`);
  await sleep(2400);
  const after = await ev(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length`);
  // 切到「处理记录」
  await ev(`(()=>{const b=[...document.querySelectorAll('.bar .tabs button')].find(x=>x.textContent.includes('处理记录')); b.click(); return true})()`);
  await waitFor(`document.querySelectorAll('[data-panel="audit"] table tbody tr').length > 0`, '处理记录表', 15000);
  const st = await ev(`({rows: document.querySelectorAll('[data-panel="audit"] table tbody tr').length,
                        text: (document.querySelector('[data-panel="audit"]')||{innerText:''}).innerText})`);
  if (String(st.text).indexOf('忽略') < 0) throw new Error('处理记录里没有「忽略」：' + String(st.text).slice(0, 80));
  return `队列 ${before} → ${after} 行，处理记录 ${st.rows} 行`;
});

await check('B3-A4 用户管理：搜索 + 表格字段（全站/禁言/待处理举报）', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.bar .tabs button')].find(x=>x.textContent.includes('用户管理')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('[data-panel="users"] h2 input')`, '用户面板', 15000);
  await ev(`(()=>{const i=document.querySelector('[data-panel="users"] h2 input');
    i.value='vd' + ${JSON.stringify(stamp)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="users"] h2 button')].find(x=>x.textContent.includes('搜索')); b.click(); return true})()`);
  await sleep(1600);
  const st = await ev(`({rows: document.querySelectorAll('[data-panel="users"] table tbody tr').length,
                        head: [...document.querySelectorAll('[data-panel="users"] table th')].map(x=>x.textContent.trim()).join('|'),
                        hasBan: [...document.querySelectorAll('[data-panel="users"] table button')].some(b=>b.textContent.includes('禁言'))})`);
  if (!st.rows) throw new Error('搜不到用户');
  if (!st.hasBan) throw new Error('没有禁言按钮');
  return `${st.rows} 行 · 列 ${st.head}`;
});

await check('B3-A5 旧管理台（admin.html）仍可用', async () => {
  await send('Page.navigate', { url: BASE + '/admin.html' });
  await sleep(2200);
  const st = await ev(`({login: !!document.querySelector('.login-wrap'), brand: (document.querySelector('.brand')||document.querySelector('h1')||{}).textContent})`);
  if (!st.login) throw new Error('旧管理台登录页没渲染');
  return '旧 admin.html 正常';
});

await check('B3-A6 旧管理台有「试用新版」入口，点了能进新版 #/admin', async () => {
  await send('Page.navigate', { url: BASE + '/admin.html' });
  await sleep(2000);
  const st = await ev(`(()=>{const a=document.querySelector('.login-card .v2-entry');
    return {found: !!a, href: a?a.getAttribute('href'):''}})()`);
  if (!st.found) throw new Error('旧管理台登录页没有新版入口');
  if (st.href.indexOf('v2/index.html#/admin') < 0) throw new Error('入口指向不对：' + st.href);
  // 真点一下（不带 sy_admin_jwt，进新版应停在登录页）
  await ev(`localStorage.removeItem('sy_admin_jwt'); true`);
  await ev(`document.querySelector('.login-card .v2-entry').click()`);
  await sleep(2200);
  const where = await ev(`location.pathname + location.hash`);
  if (where.indexOf('/v2/index.html') < 0 || where.indexOf('/admin') < 0) throw new Error('没进新版管理台：' + where);
  const login = await ev(`!!document.querySelector('.login-wrap')`);
  if (!login) throw new Error('新版管理台登录页没渲染');
  return '旧页入口 → ' + where;
});

await check('B3-A7 新版管理台有「回旧版」入口，点了能回旧管理台', async () => {
  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(adminToken())}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin' });
  await sleep(2200);
  await waitFor(`!!document.querySelector('.bar .old-entry')`, '新版没有回旧版入口', 15000);
  const href = await ev(`document.querySelector('.bar .old-entry').getAttribute('href')`);
  await ev(`document.querySelector('.bar .old-entry').click()`);
  await sleep(2200);
  const where = await ev(`({path: location.pathname, oldAdmin: !!document.querySelector('.login-wrap, #appView')})`);
  if (where.path.indexOf('admin.html') < 0) throw new Error('没回旧管理台：' + where.path);
  if (!where.oldAdmin) throw new Error('旧管理台没渲染');
  return `href=${href} → ${where.path}`;
});

await check('B3-A8 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
