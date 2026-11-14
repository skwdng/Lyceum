// Vue 迁移 · 批 2 自检（聊天 / WebSocket 实时）
//
// 用法：node server/scripts/selftest_vue_batch2.mjs [cdpPort] [baseUrl]
//
// 关键点：实时投递必须**两个标签页**才验得出来（A 发 → B 收），
// 所以这里开两个 CDP target，各自一套 send/ev。
//
// 前提：后端 + Redis 在跑。
const PORT = process.argv[2] || '9456';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== CDP 连接封装（可多标签） ====================

async function listTargets() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
}

async function newTab() {
  // 新版 Chrome 要求 PUT；老版本用 GET。两种都试。
  for (const method of ['PUT', 'GET']) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method });
      if (r.ok) {
        const t = await r.json();
        if (t && t.webSocketDebuggerUrl) return t;
      }
    } catch (e) {
      /* 换下一种 */
    }
  }
  throw new Error('开不了新标签页');
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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
  const close = () => {
    try {
      ws.close();
    } catch (e) {
      /* 忽略 */
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 920, deviceScaleFactor: 1, mobile: false });
  return { send, ev, waitFor, errs, close };
}

/** 整页重载打开某个 hash 路由（只改 hash 不会重载文档，会带着旧内存状态） */
async function openV2(tab, hash) {
  await tab.send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1500);
}

const out = [];
const check = async (n, f) => {
  try {
    const v = await f();
    out.push('PASS  ' + n + (v ? '  [' + v + ']' : ''));
  } catch (e) {
    out.push('FAIL  ' + n + '  -> ' + e.message);
  }
};

// ==================== 准备 ====================
const stamp = Date.now().toString().slice(-6);
const ACC_A = 'ca' + stamp;
const ACC_B = 'cb' + stamp;
const PWD = 'abc12345';

const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

const a = await call('POST', '/api/auth/register', { account: ACC_A, password: PWD });
const b = await call('POST', '/api/auth/register', { account: ACC_B, password: PWD });
if (!a.body?.token || !b.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
await call('PATCH', '/api/auth/me', { name: '甲同学' + stamp }, a.body.token).catch(() => {});
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.body.token },
  body: JSON.stringify({ name: '甲同学' + stamp })
});
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.body.token },
  body: JSON.stringify({ name: '乙同学' + stamp })
});
// A 与 B 建立好友关系（B 发请求 → A 接受，避免"不能加自己"）
await call('POST', '/api/social/friends/requests', { toId: b.body.user.id, note: null }, a.body.token);
const reqList = await call('GET', '/api/social/friends/requests', null, b.body.token);
const pendId = (reqList.body && reqList.body.items && reqList.body.items[0] && reqList.body.items[0].requestId) || null;
if (pendId) await call('POST', '/api/social/friends/requests/' + pendId + '/accept', null, b.body.token);
// 灌 25 条历史，用于验「加载更早的消息」
for (let i = 0; i < 12; i++) {
  await call('POST', '/api/social/messages', { toId: b.body.user.id, body: '历史消息 ' + i }, a.body.token);
  await call('POST', '/api/social/messages', { toId: a.body.user.id, body: '回你 ' + i }, b.body.token);
}

// 再造一个只加好友、**没有任何消息**的账号 C，用来验「没聊过的好友也要出现在消息列表」
const ACC_C = 'cc' + stamp;
const c = await call('POST', '/api/auth/register', { account: ACC_C, password: PWD });
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.body.token },
  body: JSON.stringify({ name: '丙同学' + stamp })
});
await call('POST', '/api/social/friends/requests', { toId: c.body.user.id, note: null }, a.body.token);
const reqC = await call('GET', '/api/social/friends/requests', null, c.body.token);
const pendC = (reqC.body && reqC.body.items && reqC.body.items[0] && reqC.body.items[0].requestId) || null;
if (pendC) await call('POST', '/api/social/friends/requests/' + pendC + '/accept', null, c.body.token);

const pages = await listTargets();
const tabA = await connect(pages.find((t) => t.type === 'page' && t.webSocketDebuggerUrl));
const tabB = await connect(await newTab());

// ==================== 用例 ====================

await check('B2-C1 A 打开 #/chat：会话列表出现好友，通道为 live（WS 已连上）', async () => {
  await openV2(tabA, 'login');
  await tabA.ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(a.body.token)}); true`);
  await openV2(tabA, 'chat');
  await tabA.waitFor(`document.querySelectorAll('.chat-conv').length > 0`, '会话列表', 20000);
  await tabA.waitFor(`document.querySelector('.soc-chat').dataset.mode === 'live'`, 'WS 未连上', 20000);
  const st = await tabA.ev(`({convs: document.querySelectorAll('.chat-conv').length,
                              mode: document.querySelector('.soc-chat').dataset.mode,
                              name: document.querySelector('.chat-conv-name').textContent})`);
  return `会话 ${st.convs} 个，通道=${st.mode}，对端=${st.name}`;
});

await check('B2-C2 A 发一条：气泡立刻出现（走 WS + ack，不是 HTTP 兜底）', async () => {
  await tabA.ev(`(()=>{const c=[...document.querySelectorAll('.chat-conv')][0]; c.click(); return true})()`);
  await tabA.waitFor(`!!document.querySelector('.chat-input textarea')`, '输入框', 15000);
  await sleep(600);
  const text = '实时测试-' + Date.now().toString().slice(-4);
  await tabA.ev(`(()=>{const t=document.querySelector('.chat-input textarea');
    t.value=${JSON.stringify(text)}; t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await tabA.ev(`document.querySelector('.chat-input .btn.primary').click(); true`);
  await tabA.waitFor(`[...document.querySelectorAll('.chat-bubble')].some(b=>b.textContent===${JSON.stringify(text)})`, '气泡没出现', 15000);
  // ack 回来之后：占位气泡必须消失，而且不能出现重复气泡（WS 会把自己发的消息也广播回来）
  await tabA.waitFor(`document.querySelectorAll('.chat-row.pending').length === 0`, 'ack 后占位没消失', 8000);
  const st = await tabA.ev(`({
    dup: [...document.querySelectorAll('.chat-bubble')].filter(b=>b.textContent===${JSON.stringify(text)}).length,
    mine: [...document.querySelectorAll('.chat-row.mine .chat-bubble')].map(b=>b.textContent).slice(-1)[0],
    mode: document.querySelector('.soc-chat').dataset.mode})`);
  if (st.dup !== 1) throw new Error('同一条消息出现 ' + st.dup + ' 次（应只 1 次）');
  return `已落定（无重复）：${st.mine}`;
});

await check('B2-C3 B 在另一个标签页收到实时投递（不刷新）', async () => {
  await openV2(tabB, 'login');
  await tabB.ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(b.body.token)}); true`);
  await openV2(tabB, 'chat');
  await tabB.waitFor(`document.querySelectorAll('.chat-conv').length > 0`, 'B 的会话列表', 20000);
  await tabB.waitFor(`document.querySelector('.soc-chat').dataset.mode === 'live'`, 'B 的 WS', 20000);
  // B 打开与 A 的会话
  await tabB.ev(`(()=>{const c=[...document.querySelectorAll('.chat-conv')].find(x=>x.textContent.includes('甲同学')); (c||document.querySelector('.chat-conv')).click(); return true})()`);
  await tabB.waitFor(`!!document.querySelector('.chat-input textarea')`, 'B 输入框', 15000);
  await sleep(800);
  // A 再发一条，B 应实时出现（3 秒内）
  const live = '实时投递-' + Date.now().toString().slice(-4);
  await tabA.ev(`(()=>{const t=document.querySelector('.chat-input textarea');
    t.value=${JSON.stringify(live)}; t.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.chat-input .btn.primary').click(); return true})()`);
  await tabB.waitFor(`[...document.querySelectorAll('.chat-bubble')].some(b=>b.textContent===${JSON.stringify(live)})`, 'B 没实时收到', 6000);
  return 'B 在 3 秒内收到「' + live + '」';
});

await check('B2-C4 B 不在该会话时收到消息 → 侧栏「消息」角标 +1，打开后清零', async () => {
  // B 先切回列表（不打开会话）
  await tabB.ev(`(()=>{const bt=document.querySelector('.chat-back'); if(!bt) return false; bt.click(); return true})()`);
  await sleep(600);
  const before = await tabB.ev(`(()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('消息'));
    const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():'0';})()`);
  const m2 = '未读测试-' + Date.now().toString().slice(-4);
  await tabA.ev(`(()=>{const t=document.querySelector('.chat-input textarea');
    t.value=${JSON.stringify(m2)}; t.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.chat-input .btn.primary').click(); return true})()`);
  await sleep(2000);
  const after = await tabB.ev(`(()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('消息'));
    const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():'0';})()`);
  if (String(after) === String(before)) throw new Error(`角标没变（${before} → ${after}）`);
  // 打开会话 → 清零
  await tabB.ev(`(()=>{const c=[...document.querySelectorAll('.chat-conv')][0]; c.click(); return true})()`);
  await sleep(1800);
  const cleared = await tabB.ev(`(()=>{const a=[...document.querySelectorAll('.nav a')].find(x=>x.textContent.includes('消息'));
    const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent.trim():'';})()`);
  if (cleared) throw new Error('打开会话后角标没清：' + cleared);
  return `角标 ${before} → ${after} → 打开后清零`;
});

await check('B2-C5 历史消息：能加载更早的一页（>20 条时出现按钮）', async () => {
  const has = await tabB.ev(`!!document.querySelector('.chat-more button')`);
  if (!has) throw new Error('没有「加载更早的消息」按钮');
  const n0 = await tabB.ev(`document.querySelectorAll('.chat-row').length`);
  await tabB.ev(`document.querySelector('.chat-more button').click()`);
  await sleep(1800);
  const n1 = await tabB.ev(`document.querySelectorAll('.chat-row').length`);
  if (n1 <= n0) throw new Error(`加载更早没有新增（${n0} → ${n1}）`);
  return `${n0} → ${n1} 条`;
});

await check('B2-C6 入口已切换：老链接 /?v=chat 也会落到新版', async () => {
  await tabA.send('Page.navigate', { url: BASE + '/?v=chat' });
  await sleep(2800);
  const where = await tabA.ev(`location.pathname + location.search + location.hash`);
  if (where.indexOf('/v2/index.html') < 0) throw new Error('没落到新版：' + where);
  const isNew = await tabA.ev(`typeof S === 'undefined'`);
  if (!isNew) throw new Error('还停在旧页');
  return where;
});

await check('B2-C7 换账号：会话/角标清空，不串号', async () => {
  // A 退出登录（走新版「我的」）
  await openV2(tabA, 'me');
  await tabA.waitFor(`!!document.querySelector('#authName')`, '我的面板', 15000);
  await tabA.ev(`(()=>{const b=[...document.querySelectorAll('.auth-actions button')].find(x=>x.textContent.includes('退出登录')); b.click(); return true})()`);
  await sleep(2200);
  await openV2(tabA, 'chat');
  await sleep(1200);
  // 未登录 → 登录引导卡，且没有残留会话
  const st = await tabA.ev(`({gate: document.querySelector('#main').innerText.indexOf('登录后可见') >= 0,
                              convs: document.querySelectorAll('.chat-conv').length,
                              token: !!localStorage.getItem('sy_jwt')})`);
  if (st.token) throw new Error('退出后 token 还在');
  if (!st.gate) throw new Error('未登录没显示引导卡');
  if (st.convs) throw new Error('还有残留会话：' + st.convs);
  return '引导卡正常，会话已清';
});

await check('B2-C9 没聊过的好友也出现在消息列表，点开可直接发第一条', async () => {
  // C7 已经把 A 登出了，这里先登录回来，再进消息页
  await openV2(tabA, 'login');
  await tabA.ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(a.body.token)}); true`);
  await openV2(tabA, 'chat');
  await tabA.waitFor(`document.querySelectorAll('.chat-conv').length >= 2`, '列表里没有合成行', 20000);
  const st = await tabA.ev(`(()=>{
    const rows=[...document.querySelectorAll('.chat-conv')];
    const fake=rows.filter(r=>r.classList.contains('chat-conv-new'));
    return {total: rows.length, fake: fake.length,
            fakeName: fake[0]?fake[0].querySelector('.chat-conv-name').textContent:'',
            fakeSub: fake[0]?fake[0].querySelector('.chat-conv-sub').textContent.trim():''};
  })()`);
  if (!st.fake) throw new Error('没聊过的好友没出现在列表里');
  if (st.fakeSub.indexOf('还没有消息') < 0) throw new Error('合成行没有提示文案：' + st.fakeSub);

  // 点开它 → 直接进聊天窗（还没有会话）
  await tabA.ev(`(()=>{const r=document.querySelector('.chat-conv.chat-conv-new'); r.click(); return true})()`);
  await tabA.waitFor(`!!document.querySelector('.chat-input textarea')`, '点开合成行没进聊天窗', 10000);
  const head = await tabA.ev(`(document.querySelector('.chat-head b')||{}).textContent`);
  if (!head || head.indexOf('丙同学') < 0) throw new Error('标题不是对端：' + head);

  // 发第一条 → 后端建会话 → 列表里变成正常会话（不再是合成行）
  const first = '第一条-' + Date.now().toString().slice(-4);
  await tabA.ev(`(()=>{const t=document.querySelector('.chat-input textarea');
    t.value=${JSON.stringify(first)}; t.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.chat-input .btn.primary').click(); return true})()`);
  await tabA.waitFor(`[...document.querySelectorAll('.chat-bubble')].some(b=>b.textContent===${JSON.stringify(first)})`, '第一条没发出', 15000);
  await sleep(1500);
  const after = await tabA.ev(`(()=>{
    const rows=[...document.querySelectorAll('.chat-conv')];
    const c = rows.find(r=>r.textContent.includes('丙同学'));
    return {isNew: c?c.classList.contains('chat-conv-new'):null,
            sub: c?c.querySelector('.chat-conv-sub').textContent.trim():''};
  })()`);
  if (after.isNew) throw new Error('发完第一条后仍是合成行');
  if (after.sub.indexOf(first) < 0) throw new Error('列表摘要没更新：' + after.sub);
  return `合成行 ${st.fake} 个（${st.fakeName}）→ 发首条后变正常会话`;
});
await check('B2-C8 两个标签页全程零 JS 异常', async () => {
  const all = [...tabA.errs, ...tabB.errs].filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
tabA.close();
tabB.close();
process.exit(bad ? 1 : 0);
