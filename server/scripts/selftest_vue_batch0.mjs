// Vue 迁移 · 批 0 自检：外壳 / 路由 / 登录注册 / 我的 / LegacyRedirect / 角标 / 旧页不受影响
//
// 用法：node server/scripts/selftest_vue_batch0.mjs [cdpPort] [baseUrl]
//   baseUrl 是后端根地址（如 http://localhost:8080），脚本内部拼 /v2/index.html#/
//
// 前提：后端在跑；若要验「通知角标」，需要 Redis（没有 Redis 时该用例会跳过并标注）。
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
  if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 240));
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
const ACC_A = 'va' + stamp;
const ACC_B = 'vb' + stamp;
const PWD = 'abc12345';
const NAME_A = '甲同学' + stamp;

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

/** 直接打接口造账号（省掉 UI 输入，用例本身仍在验 UI 登录） */
const apiPost = async (path, body, token) =>
  ev(`(async()=>{
    const h = {'Content-Type':'application/json'};
    ${token ? `h.Authorization = 'Bearer ' + ${JSON.stringify(token)};` : ''}
    const r = await fetch(${JSON.stringify(BASE + path)}, {method:'POST', headers:h, body: JSON.stringify(${JSON.stringify(body)})});
    const t = await r.text();
    return {status:r.status, body: t ? JSON.parse(t) : null};
  })()`);

/** 打开新前端某个 hash 路由（整页导航，等价用户手动输入地址） */
async function openV2(hash) {
  // 带变化的 query 做整页重载：只改 hash 时文档不重载，应用会带着上一个用例的内存状态（登录态）继续跑
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1600);
  await waitFor(`!!document.querySelector('.app') || !!document.querySelector('.auth-card')`, '页面渲染', 15000);
}

await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){};true`);

// ==================== 用例 ====================

await check('B0-1 打开 #/login：外壳 15 项导航 + 登录表单，零 JS 异常', async () => {
  await openV2('login');
  const st = await ev(`({
    navItems: document.querySelectorAll('.nav a').length,
    groups: document.querySelectorAll('.nav .g').length,
    hasForm: !!document.querySelector('#authAccount') && !!document.querySelector('#authPassword'),
    tabs: [...document.querySelectorAll('.auth-tabs a')].map(a=>a.textContent.trim()),
    logo: (document.querySelector('.logo b')||{}).textContent,
    meBox: (document.querySelector('.sb .me')||{}).innerText
  })`);
  // 旧 NAV 是 10 个可点链接 + 5 个分组标题（共 15 项）——这里逐项对齐，不是"15 个链接"
  if (st.navItems !== 10) throw new Error('导航链接应为 10，实际 ' + st.navItems);
  if (st.groups !== 5) throw new Error('分组标题应为 5，实际 ' + st.groups);
  if (!st.hasForm) throw new Error('登录表单没渲染');
  if (st.tabs.join('/') !== '登录/注册') throw new Error('Tab 文案不对：' + st.tabs.join('/'));
  return `${st.navItems} 项 / ${st.groups} 组 / logo=${st.logo}`;
});

await check('B0-2 未迁移页面回落旧前端（#/community → 旧页 ?v=community）', async () => {
  await ev(`[...document.querySelectorAll('.nav a')].find(a=>a.textContent.includes('讨论社区')).click()`);
  await sleep(2500);
  const href = await ev(`location.pathname + location.search`);
  if (href.indexOf('v=community') < 0) throw new Error('没跳到旧页：' + href);
  // 顺带确认旧页真的渲染出来了（不是白屏）
  await waitFor(`!!document.querySelector('#nav a')`, '旧页外壳', 15000);
  const oldNav = await ev(`document.querySelectorAll('#nav a').length`);
  if (oldNav < 10) throw new Error('旧页导航没渲染：' + oldNav);
  return href + ' 旧页导航 ' + oldNav + ' 项';
});

await check('B0-3 注册新账号 → 落到 #/me，侧栏显示账号', async () => {
  await openV2('login');
  await ev(`localStorage.removeItem('sy_jwt'); true`);
  await openV2('login');
  await ev(`(()=>{document.querySelectorAll('.auth-tabs a')[1].click(); return true})()`);
  await sleep(300);
  await ev(`(()=>{
    const set=(sel,v)=>{const el=document.querySelector(sel); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));};
    set('#authAccount', ${JSON.stringify(ACC_A)}); set('#authPassword', ${JSON.stringify(PWD)}); return true;})()`);
  await ev(`document.querySelector('.auth-actions button').click()`);
  await waitFor(`location.hash.indexOf('me') >= 0`, '注册后应到 #/me', 20000);
  await waitFor(`!!document.querySelector('#authName')`, '我的面板', 15000);
  const st = await ev(`({hash:location.hash, acc:(document.querySelector('.auth-account')||{}).textContent,
                        meBox:(document.querySelector('.sb .me')||{}).innerText, token: !!localStorage.getItem('sy_jwt')})`);
  if (st.acc !== ACC_A) throw new Error('账号显示不对：' + st.acc);
  if (!st.token) throw new Error('sy_jwt 没写入（与旧页共用同一个 key）');
  return 'hash=' + st.hash + ' 账号=' + st.acc;
});

await check('B0-4 改昵称 → 立刻生效（输入框 + 侧栏）', async () => {
  await ev(`(()=>{const el=document.querySelector('#authName'); el.value=${JSON.stringify(NAME_A)};
                   el.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`[...document.querySelectorAll('.auth-actions button')].find(b=>b.textContent.includes('保存昵称')).click()`);
  await sleep(1200);
  const st = await ev(`({name:(document.querySelector('#authName')||{}).value,
                        meBox:(document.querySelector('.sb .me')||{}).innerText})`);
  if (st.name !== NAME_A) throw new Error('输入框没更新：' + st.name);
  if (st.meBox.indexOf(NAME_A) < 0) throw new Error('侧栏没更新：' + st.meBox);
  return NAME_A;
});

await check('B0-5 刷新页面后仍是登录态（token 恢复）', async () => {
  await send('Page.navigate', { url: V2 + 'me' });
  await sleep(1600);
  await waitFor(`!!document.querySelector('#authName')`, '恢复登录态', 15000);
  const st = await ev(`({acc:(document.querySelector('.auth-account')||{}).textContent,
                        meBox:(document.querySelector('.sb .me')||{}).innerText})`);
  if (st.acc !== ACC_A) throw new Error('刷新后登录态丢了：' + JSON.stringify(st));
  return '恢复成功';
});

await check('B0-6 未登录访问需要登录的页 → 登录引导卡（不白屏）', async () => {
  await ev(`localStorage.removeItem('sy_jwt'); true`);
  // 用仍未迁移的页面（单人辩论）：批 1 之后 records/diag 已经是真页面，原先的断言过期了
  await openV2('solo');
  await sleep(1200);
  const st = await ev(`({text:document.querySelector('#main').innerText, loginBtn:!!document.querySelector('#main .btn.primary')})`);
  if (st.text.indexOf('登录后可见') < 0) throw new Error('引导卡没出现：' + st.text.slice(0, 80));
  if (!st.loginBtn) throw new Error('引导卡没有登录按钮');
  return '引导卡正常';
});

await check('B0-7 引导卡点「去登录」→ 登录后回到原页面（#/solo → 旧页 solo）', async () => {
  await ev(`document.querySelector('#main .btn.primary').click()`);
  await sleep(1200);
  await waitFor(`!!document.querySelector('#authAccount')`, '登录表单', 15000);
  const hasNext = await ev(`location.hash.indexOf('next') >= 0`);
  await ev(`(()=>{
    const set=(sel,v)=>{const el=document.querySelector(sel); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));};
    set('#authAccount', ${JSON.stringify(ACC_A)}); set('#authPassword', ${JSON.stringify(PWD)}); return true;})()`);
  await ev(`document.querySelector('.auth-actions button').click()`);
  // solo 还没迁移 → 登录后回到 #/solo，再被 LegacyRedirect 送到旧页 ?v=solo
  await sleep(3000);
  const where = await ev(`location.pathname + location.search + location.hash`);
  if (where.indexOf('v=solo') < 0) throw new Error('没回到目标页（旧页 solo）：' + where + ' next=' + hasNext);
  return where;
});

await check('B0-8 退出登录：清 token、回社区（旧页）', async () => {
  await openV2('me');
  await waitFor(`!!document.querySelector('#authName')`, '我的面板', 15000);
  await ev(`[...document.querySelectorAll('.auth-actions button')].find(b=>b.textContent.includes('退出登录')).click()`);
  await sleep(2500);
  const st = await ev(`({token: !!localStorage.getItem('sy_jwt'), where: location.pathname + location.search})`);
  if (st.token) throw new Error('退出后 sy_jwt 还在');
  if (st.where.indexOf('v=community') < 0) throw new Error('退出后没回社区：' + st.where);
  return '已清 token，回到 ' + st.where;
});

await check('B0-9 通知角标：有未读时侧栏「通知」出现红点', async () => {
  // B 给 A 发好友请求 → A 收到一条 FRIEND_REQUEST 通知
  const b = await apiPost('/api/auth/register', { account: ACC_B, password: PWD });
  if (!b.body || !b.body.token) throw new Error('造 B 账号失败：' + JSON.stringify(b));
  await apiPost('/api/social/friends/requests', { toId: ACC_A, note: '批0自检' }, b.body.token);

  await openV2('login');
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));};
                   set('#authAccount', ${JSON.stringify(ACC_A)}); set('#authPassword', ${JSON.stringify(PWD)}); return true;})()`);
  await ev(`document.querySelector('.auth-actions button').click()`);
  await sleep(2500);
  await waitFor(`[...document.querySelectorAll('.nav a')].some(a=>{const b=a.querySelector('.nav-badge'); return b && b.textContent.trim()==='1';})`,
    '通知角标没出现', 20000);
  const badge = await ev(`(()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('通知'));
    const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():null;})()`);
  if (badge !== '1') throw new Error('角标数值不对：' + badge);
  return '通知角标=' + badge;
});

await check('B0-10 旧页完全不受影响（旧入口仍可用、仍是旧实现）', async () => {
  await send('Page.navigate', { url: BASE + '/?v=community' });
  await sleep(2200);
  await waitFor(`!!document.querySelector('#nav a')`, '旧页外壳', 15000);
  const st = await ev(`({nav:document.querySelectorAll('#nav a').length,
                        v2Entry: !!document.querySelector('.v2-entry'),
                        v2Href: (document.querySelector('.v2-entry')||{}).getAttribute('href'),
                        hasMain: !!document.querySelector('#main')})`);
  if (!st.hasMain) throw new Error('旧页 #main 丢了');
  if (!st.v2Entry) throw new Error('旧页侧栏没有「试用新版」入口');
  if (!st.v2Href || st.v2Href.indexOf('v2/index.html') < 0) throw new Error('「试用新版」链接不对：' + st.v2Href);
  return `旧页导航 ${st.nav} 项，新版入口 ${st.v2Href}`;
});

await check('B0-12 未登录访问 #/me → 自动去登录页（不停在"恢复中"）', async () => {
  await ev(`localStorage.removeItem('sy_jwt'); true`);
  await openV2('me');
  await sleep(1500);
  await waitFor(`location.hash.indexOf('login') >= 0`, '#/me 没跳登录页', 15000);
  const st = await ev(`({hash:location.hash, hasForm:!!document.querySelector('#authAccount')})`);
  if (!st.hasForm) throw new Error('登录表单没出现：' + JSON.stringify(st));
  return st.hash;
});
await check('B0-11 全程零 JS 异常（新前端）', async () => {
  const meaningful = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (meaningful.length) throw new Error(meaningful.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
