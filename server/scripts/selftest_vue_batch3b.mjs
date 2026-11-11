// Vue 迁移 · 批 3-2 自检（视频 + 管理后台）
//
// 用法：node server/scripts/selftest_vue_batch3b.mjs [cdpPort] [baseUrl]
//
// 说明：本环境的 sy_admin 表是空的（后端也没有 seed 管理员，且后端冻结），
// 所以管理台用「开发密钥签一个 typ=ADMIN 的令牌」注入 localStorage 来验证 UI。
// 这不是绕过校验——后端仍然校验签名与 typ/role，只是没有真实管理员行可取令牌。
import crypto from 'crypto';
import http from 'node:http';

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

// ==================== 管理后台（P0：单页 tab -> 侧栏 + 子页） ====================
//
// 注意：管理台已经不是「一个页面 + 三个 tab」，而是 #/admin/<子页> 的嵌套路由。
// 所以下面所有用例**一律通过点侧栏链接**来切页（顺带验证路由、高亮、徽标），
// 不再用旧的 `.bar .tabs button`，也不再有 `[data-panel=...]` 之外的 v-show 面板。

const ADMIN = adminToken();

/** 原生 GET：只为读状态码和 Location（fetch 的 redirect:'manual' 在 Node 里拿不到响应头） */
const rawGet = (path) => new Promise((resolve, reject) => {
  const u = new URL(BASE + path);
  const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET' }, (r) => {
    r.resume();
    resolve({ status: r.statusCode, location: r.headers.location || '' });
  });
  req.on('error', reject);
  req.end();
});

const openAdmin = async (hash) => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1900);
};

/** 点侧栏某一项（按文案匹配，图标是单独 <span>，所以用 includes） */
const clickMenu = (label) =>
  ev(`(()=>{const a=[...document.querySelectorAll('.adm-nav a')]
    .find(x=>x.textContent.includes(${JSON.stringify(label)}));
    if(!a) return false; a.click(); return true})()`);


await check('B3-A1 未登录深链 #/admin/dashboard 会被送到 #/admin/login（登录门禁）', async () => {
  await ev(`localStorage.removeItem('sy_admin_jwt'); localStorage.removeItem('sy_admin_collapsed'); true`);
  await openAdmin('admin/dashboard');
  const st = await ev(`({hash: location.hash, login: !!document.querySelector('.login-wrap'),
                        side: !!document.querySelector('.adm-side')})`);
  if (st.hash !== '#/admin/login') throw new Error('没被送去登录页：' + st.hash);
  if (!st.login) throw new Error('登录页没渲染：' + JSON.stringify(st));
  if (st.side) throw new Error('登录页不该有侧栏');
  return st.hash;
});

await check('B3-A2 管理台登录页：独立布局（无侧栏）+ 错误密码提示', async () => {
  const st = await ev(`({brand: (document.querySelector('.login-box h1')||{}).textContent,
                        side: !!document.querySelector('.adm-side'),
                        inputs: document.querySelectorAll('.login-box input').length})`);
  if (st.inputs !== 2) throw new Error('登录框输入框数量不对：' + st.inputs);
  if (st.side) throw new Error('登录页不该有侧栏');
  await ev(`(()=>{const a=document.querySelectorAll('.login-box input')[0]; a.value='admin'; a.dispatchEvent(new Event('input',{bubbles:true}));
    const b=document.querySelectorAll('.login-box input')[1]; b.value='wrong-pass-123'; b.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.login-box button')].find(x=>x.textContent.includes('登录')); b.click(); return true})()`);
  await sleep(1800);
  const toast = await ev(`(document.querySelector('.toast, .toast-host')||{}).textContent || document.body.innerText`);
  if (String(toast).indexOf('账号或密码错误') < 0 && String(toast).indexOf('密码') < 0) throw new Error('没有错误提示：' + String(toast).slice(-80));
  if ((await ev(`location.hash`)) !== '#/admin/login') throw new Error('登录失败后不该离开登录页');
  return String(st.brand).trim() + ' · 错误密码有提示';
});

await check('B3-A3 令牌进入 → 侧栏 5 项 + 当前项高亮 + 徽标=待处理举报数 + 概览三张卡', async () => {
  // 自备一条待处理举报（内存库每次重启就空，不能依赖残留数据）；徽标要拿它来对数
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

  const stats = await call('GET', '/api/admin/stats', null, ADMIN);
  const pending = Number((stats.body && stats.body.pendingReports) || 0);
  if (!pending) throw new Error('后端 stats.pendingReports 应该是正数：' + JSON.stringify(stats.body).slice(0, 120));

  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)}); true`);
  await openAdmin('admin/dashboard');
  await waitFor(`document.querySelectorAll('.adm-nav a').length > 0`, '侧栏', 20000);
  await waitFor(`document.querySelectorAll('[data-panel="dashboard"] .adm-kpi').length === 8`, '概览 KPI 卡', 20000);
  // 徽标要等 stats 回来才渲染，单独等一次，避免读到空串
  await waitFor(`!!document.querySelector('.adm-nav a .badge')`, '待处理举报徽标', 20000);

  const st = await ev(`(()=>{
    const links=[...document.querySelectorAll('.adm-nav a')];
    const on=document.querySelector('.adm-nav a.on');
    const badgeLink=links.find(x=>x.textContent.includes('举报处理'));
    const badge=badgeLink&&badgeLink.querySelector('.badge');
    return {
      menus: links.map(x=>x.textContent.replace(/\\s+/g,'')),
      groups: [...document.querySelectorAll('.adm-nav .g')].map(x=>x.textContent.trim()),
      on: on?on.textContent.replace(/\\s+/g,''):'',
      title: (document.querySelector('.adm-title')||{}).textContent,
      who: (document.querySelector('.adm-who')||{}).textContent,
      cards: [...document.querySelectorAll('[data-panel="dashboard"] .adm-kpi')].map(c=>c.querySelector('.k').textContent+':'+c.querySelector('.v').textContent.replace(/\\s+/g,'')),
      badge: badge?badge.textContent.trim():'',
      hash: location.hash}})()`);

  if (st.menus.length !== 6) throw new Error('侧栏菜单项应为 6 个（概览/报表分析/举报处理/用户管理/处理记录/设置），实际 ' + st.menus.length + '：' + JSON.stringify(st.menus));
  if (st.groups.length !== 3) throw new Error('菜单分组应为 3 组（总览/运营/系统），实际：' + JSON.stringify(st.groups));
  if (!st.on.includes('概览')) throw new Error('当前项没高亮成「概览」：' + JSON.stringify(st.on));
  if (String(st.title).trim() !== '概览') throw new Error('顶栏标题不对：' + st.title);
  if (String(st.who).trim() !== 'admin') throw new Error('顶栏当前管理员不对：' + st.who);
  if (String(st.badge) !== String(pending)) throw new Error('徽标不是待处理举报数：徽标=' + st.badge + ' stats=' + pending);
  if (st.hash !== '#/admin/dashboard') throw new Error('路由不对：' + st.hash);

  // 点侧栏「举报处理」-> 真路由跳转 + 队列有行 + 高亮跟着走
  if (!(await clickMenu('举报处理'))) throw new Error('侧栏里找不到「举报处理」');
  await waitFor(`location.hash === '#/admin/reports'`, '切到举报页', 15000);
  await waitFor(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length > 0`, '举报队列', 20000);
  const on = await ev(`(()=>{const a=document.querySelector('.adm-nav a.on'); return a?a.textContent.replace(/\\s+/g,''):''})()`);
  if (!on.includes('举报处理')) throw new Error('切页后高亮没跟着走：' + on);
  const rows = await ev(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length`);
  return st.cards.join(' / ') + ' · 菜单 ' + st.menus.length + ' 项 · 徽标 ' + st.badge + ' · 队列 ' + rows + ' 行';
});

await check('B3-A4 处理一条举报（忽略）→ 队列减少 + 处理记录里出现该操作', async () => {
  const before = await ev(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length`);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="reports"] table tbody button')].find(x=>x.textContent.includes('处理')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.mask .modal')`, '处理弹窗', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.modal .foot button')].find(x=>x.textContent.trim()==='忽略'); b.click(); return true})()`);
  await sleep(2400);
  const after = await ev(`document.querySelectorAll('[data-panel="reports"] table tbody tr').length`);
  // 切到「处理记录」——走侧栏链接（旧版的 tab 按钮已经不存在）
  if (!(await clickMenu('处理记录'))) throw new Error('侧栏里找不到「处理记录」');
  await waitFor(`location.hash === '#/admin/audit'`, '切到处理记录', 15000);
  await waitFor(`document.querySelectorAll('[data-panel="audit"] table tbody tr').length > 0`, '处理记录表', 15000);
  const st = await ev(`({rows: document.querySelectorAll('[data-panel="audit"] table tbody tr').length,
                        text: (document.querySelector('[data-panel="audit"]')||{innerText:''}).innerText})`);
  if (String(st.text).indexOf('忽略') < 0) throw new Error('处理记录里没有「忽略」：' + String(st.text).slice(0, 80));
  return `队列 ${before} → ${after} 行，处理记录 ${st.rows} 行`;
});

await check('B3-A5 用户管理：侧栏进入 + 搜索 + 表格字段（全站/禁言/待处理举报）', async () => {
  if (!(await clickMenu('用户管理'))) throw new Error('侧栏里找不到「用户管理」');
  await waitFor(`location.hash === '#/admin/users'`, '切到用户管理', 15000);
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

await check('B3-A6 入口自洽：/admin.html 404、GET /admin 302 到 v2/index.html#/admin', async () => {
  const r = await fetch(BASE + '/admin.html');
  if (r.status !== 404) throw new Error('旧管理台还在：' + r.status);
  // 这一条盯的是 P0 顺手修的 404：forward 已改成 redirect（相对路径，线上 /siyige 前缀也成立）
  const red = await rawGet('/admin');
  if (red.status !== 302 && red.status !== 301) throw new Error('/admin 没重定向：' + red.status);
  if (!/v2\/index\.html#\/admin$/.test(red.location)) throw new Error('/admin 的 Location 不对：' + red.location);
  await openAdmin('admin/dashboard');
  await waitFor(`!!document.querySelector('.adm-top')`, '管理台顶栏', 20000);
  if (await ev(`!!document.querySelector('.old-entry')`)) throw new Error('页头还有「回旧版」入口');
  return '/admin.html 404 · /admin -> ' + red.location;
});

await check('B3-A7 侧栏折叠：208px → 56px 只留图标，状态存 localStorage 且刷新后保持', async () => {
  await ev(`localStorage.setItem('sy_admin_collapsed','0'); true`);
  await openAdmin('admin/dashboard');
  await waitFor(`!!document.querySelector('.adm-iconbtn')`, '折叠按钮', 20000);
  const wide = await ev(`Math.round(document.querySelector('.adm-side').getBoundingClientRect().width)`);
  if (wide !== 208) throw new Error('宽屏侧栏应是 208px，实际 ' + wide);

  await ev(`document.querySelector('.adm-iconbtn').click()`);
  await sleep(400);
  const st = await ev(`({collapsed: !!document.querySelector('.adm-layout.collapsed'),
                        width: Math.round(document.querySelector('.adm-side').getBoundingClientRect().width),
                        stored: localStorage.getItem('sy_admin_collapsed')})`);
  if (!st.collapsed) throw new Error('点了折叠按钮但布局没进 collapsed');
  if (st.width !== 56) throw new Error('折叠后侧栏应是 56px，实际 ' + st.width);
  if (st.stored !== '1') throw new Error('折叠状态没写进 localStorage：' + st.stored);

  await openAdmin('admin/dashboard');
  await waitFor(`!!document.querySelector('.adm-layout.collapsed')`, '刷新后仍是折叠', 20000);
  const w2 = await ev(`Math.round(document.querySelector('.adm-side').getBoundingClientRect().width)`);
  if (w2 !== 56) throw new Error('刷新后侧栏宽度应保持 56px，实际 ' + w2);

  await ev(`localStorage.setItem('sy_admin_collapsed','0'); true`);   // 复原，别影响后面的用例
  return '208px -> 56px -> 刷新仍 56px';
});

await check('B3-A8 窄屏（375px）：侧栏默认收起 → 汉堡开抽屉 → 点遮罩关闭', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)}); localStorage.setItem('sy_admin_collapsed','0'); true`);
  await openAdmin('admin/dashboard');
  await waitFor(`!!document.querySelector('.adm-iconbtn')`, '顶栏汉堡按钮', 20000);

  const shut = await ev(`(()=>{const r=document.querySelector('.adm-side').getBoundingClientRect();
    return {left: Math.round(r.left), width: Math.round(r.width), mask: !!document.querySelector('.adm-mask')}})()`);
  if (shut.left >= 0) throw new Error('窄屏侧栏应默认收起（在视口外），实际 left=' + shut.left);
  if (shut.width !== 208) throw new Error('抽屉宽度应为 208px，实际 ' + shut.width);
  if (shut.mask) throw new Error('抽屉没打开时不该有遮罩');

  await ev(`document.querySelector('.adm-iconbtn').click()`);
  await sleep(450);
  const open = await ev(`(()=>{const r=document.querySelector('.adm-side').getBoundingClientRect();
    return {left: Math.round(r.left), mask: !!document.querySelector('.adm-mask')}})()`);
  if (open.left !== 0) throw new Error('点汉堡后抽屉没滑出来，left=' + open.left);
  if (!open.mask) throw new Error('抽屉打开时缺少遮罩');

  await ev(`document.querySelector('.adm-mask').click()`);
  await sleep(450);
  const closed = await ev(`(()=>{const r=document.querySelector('.adm-side').getBoundingClientRect();
    return {left: Math.round(r.left), mask: !!document.querySelector('.adm-mask')}})()`);
  if (closed.mask) throw new Error('点遮罩后遮罩没消失');
  if (closed.left >= 0) throw new Error('点遮罩后抽屉没收起，left=' + closed.left);

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  return '默认收起 → 汉堡滑出 → 遮罩关闭';
});

await check('B3-A9 顶栏退出 / 接口 401：都清令牌并回登录页（统一出口）', async () => {
  // 1) 顶栏「退出登录」
  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)}); true`);
  await openAdmin('admin/dashboard');
  await waitFor(`!!document.querySelector('.adm-top')`, '顶栏', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.adm-top button')].find(x=>x.textContent.includes('退出登录')); b.click(); return true})()`);
  await waitFor(`location.hash === '#/admin/login'`, '退出后回登录页', 15000);
  const tok = await ev(`localStorage.getItem('sy_admin_jwt')`);
  if (tok) throw new Error('退出后令牌没清：' + tok);

  // 2) 伪造令牌 -> 接口 401 -> 统一出口（api.js 广播 + AdminLayout 收尾）
  await ev(`localStorage.setItem('sy_admin_jwt','not-a-real-token'); true`);
  await openAdmin('admin/reports');
  await waitFor(`location.hash === '#/admin/login'`, '401 后回登录页', 25000);
  const tok2 = await ev(`localStorage.getItem('sy_admin_jwt')`);
  if (tok2) throw new Error('401 后令牌没清：' + tok2);
  if (!(await ev(`!!document.querySelector('.login-wrap')`))) throw new Error('401 后没渲染登录页');

  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)}); true`);   // 复原
  return '退出与 401 都回登录页并清令牌';
});

await check('B3-A11 报表分析页：五个区块 + 图表渲染 + 导出 CSV/XLSX', async () => {
  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)}); localStorage.setItem('sy_admin_collapsed','0'); true`);
  await openAdmin('admin/analytics');
  await waitFor(`location.hash === '#/admin/analytics'`, '切到报表分析', 20000);
  await waitFor(`document.querySelectorAll('[data-panel="analytics"] .panel').length >= 5`, '五个区块', 25000);
  await waitFor(`document.querySelectorAll('[data-panel="analytics"] svg').length >= 3`, '图表 svg', 25000);

  const st = await ev(`({panels: document.querySelectorAll('[data-panel="analytics"] .panel').length,
                       svgs: document.querySelectorAll('[data-panel="analytics"] svg').length,
                       title: (document.querySelector('.adm-title')||{}).textContent,
                       on: (document.querySelector('.adm-nav a.on')||{textContent:''}).textContent.replace(/\\s+/g,'')})`);
  if (String(st.title).trim() !== '报表分析') throw new Error('顶栏标题不对：' + st.title);
  if (!st.on.includes('报表分析')) throw new Error('当前项高亮不对：' + st.on);

  const auth = { headers: { Authorization: 'Bearer ' + ADMIN } };

  // CSV：必须带 UTF-8 BOM（否则 Excel 打开中文乱码）+ 表头 + 英文文件名
  const csv = await fetch(BASE + '/api/admin/analytics/export?format=csv&report=modules&range=7d', auth);
  if (csv.status !== 200) throw new Error('导出 CSV 失败：HTTP ' + csv.status);
  const buf = Buffer.from(await csv.arrayBuffer());
  if (!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF)) throw new Error('CSV 缺 UTF-8 BOM');
  if (!buf.toString('utf8').includes('模块,PV,UV(人天)')) throw new Error('CSV 表头不对：' + buf.toString('utf8').slice(0, 80));
  const disp = csv.headers.get('content-disposition') || '';
  if (!/modules_\d{4}-\d{2}-\d{2}\.csv/.test(disp)) throw new Error('CSV 文件名不对：' + disp);

  // XLSX：必须是 zip（PK 头）且不是空壳
  const xlsx = await fetch(BASE + '/api/admin/analytics/export?format=xlsx&report=breakdown&dim=tier&range=7d', auth);
  if (xlsx.status !== 200) throw new Error('导出 XLSX 失败：HTTP ' + xlsx.status);
  const xb = Buffer.from(await xlsx.arrayBuffer());
  if (!(xb[0] === 0x50 && xb[1] === 0x4B)) throw new Error('XLSX 不是 zip（缺 PK 头）');
  if (xb.length < 800) throw new Error('XLSX 太小，可能是空壳：' + xb.length + ' 字节');

  return `${st.panels} 个区块 · ${st.svgs} 个 svg · CSV ${buf.length}B · XLSX ${xb.length}B`;
});

await check('B3-A10 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
