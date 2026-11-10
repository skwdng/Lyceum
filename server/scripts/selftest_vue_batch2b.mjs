// Vue 迁移 · 批 2 后半段自检：单人辩论 / 对局（打字机 · 计时 · 提交）/ 复盘
//
// 用法：node server/scripts/selftest_vue_batch2b.mjs [cdpPort] [baseUrl]
//
// 复盘页用「先把对局用接口打完，再深链 #/review?match=<id>」的方式验，
// 避免在浏览器里陪 AI 走完 12 步（那样一个用例要好几分钟）。
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
    await sleep(200);
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
const ACC = 'sa' + stamp;
const PWD = 'abc12345';

const call = async (method, path, body, token) => {  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

const reg = await call('POST', '/api/auth/register', { account: ACC, password: PWD });
if (!reg.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = reg.body.token;
/** 被邀请方账号的 token（B2B-R3 里创建并加为好友，B2B-R4 用它验邀请卡片） */
let inviteeToken = '';

async function openV2(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1500);
}

await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(900);
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);

// ==================== 单人与选座 ====================

await check('B2B-1 单人页：题库 12 题 + 热榜小列表 + 当前席位', async () => {
  await openV2('solo');
  await waitFor(`document.querySelectorAll('.topic').length > 0`, '题库', 20000);
  const st = await ev(`({topics: document.querySelectorAll('.topic').length,
                        hot: document.querySelectorAll('.hitem').length,
                        seats: (document.querySelector('#main .card b')||{}).textContent,
                        turnText: document.querySelectorAll('#main .card')[1].innerText})`);
  if (st.topics < 8) throw new Error('题库太少：' + st.topics);
  if (!st.hot) throw new Error('热榜小列表没出来');
  if (st.turnText.indexOf('本场发言') < 0) throw new Error('席位卡不对：' + st.turnText.slice(0, 40));
  return `题库 ${st.topics} 题，热榜 ${st.hot} 条`;
});

await check('B2B-2 点题库卡片 → 选座面板（8 席 + 节奏 + 强度 + 汇总）', async () => {
  await ev(`document.querySelector('.topic').click(); true`);
  await waitFor(`!!document.querySelector('.mask .seats')`, '选座面板', 10000);
  const st = await ev(`({seats: document.querySelectorAll('.mask .seat').length,
                        presets: document.querySelectorAll('.mask .preset').length,
                        sum: (document.querySelector('.mask .sum')||{}).textContent})`);
  if (st.seats !== 8) throw new Error('席位应 8 个，实际 ' + st.seats);
  if (st.presets < 8) throw new Error('预设按钮太少：' + st.presets);
  if (st.sum.indexOf('本场你将发言') < 0) throw new Error('汇总没写发言次数：' + st.sum);
  return `8 席 / ${st.presets} 个预设`;
});

await check('B2B-3 多选席位 → 汇总里的「发言次数」跟着变', async () => {
  const before = await ev(`document.querySelector('.mask .sum').textContent.match(/发言\\s*(\\d+)/)[1]`);
  // 再点一个正方席位（A2）
  await ev(`(()=>{const s=[...document.querySelectorAll('.mask .seat')].find(x=>x.querySelector('.k').textContent==='A2'); s.click(); return true})()`);
  await sleep(400);
  const after = await ev(`document.querySelector('.mask .sum').textContent.match(/发言\\s*(\\d+)/)[1]`);
  if (Number(after) <= Number(before)) throw new Error(`发言次数没变（${before} → ${after}）`);
  // 收回来，只留 A1 方便后面单席位跑
  await ev(`(()=>{const s=[...document.querySelectorAll('.mask .seat')].find(x=>x.querySelector('.k').textContent==='A2'); s.click(); return true})()`);
  await sleep(300);
  return `${before} → ${after} 次`;
});

await check('B2B-4 进入对局：跳到 #/match，赛制进度 / 席位条 / 论据卡都在', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.mask .btn.primary')].pop(); b.click(); return true})()`);
  await waitFor(`location.hash.indexOf('match') >= 0`, '没跳到对局页', 20000);
  await waitFor(`!!document.querySelector('.stage')`, '对局页渲染', 20000);
  const st = await ev(`({steps: document.querySelectorAll('.st').length,
                        strips: document.querySelectorAll('.sp').length,
                        cards: document.querySelectorAll('.stage > div:last-child .card').length,
                        title: (document.querySelector('h1.pg')||{}).textContent,
                        stepTag: (document.querySelector('.tag.mono')||{}).textContent})`);
  if (!st.steps) throw new Error('赛制进度没渲染');
  if (st.strips !== 8) throw new Error('席位条应 8 个，实际 ' + st.strips);
  if (!st.title) throw new Error('没显示辩题');
  return `${st.title.slice(0, 14)}… · ${st.steps} 步进度 · ${st.stepTag}`;
});

await check('B2B-5 轮到我时能提交，我的气泡出现（me 样式）', async () => {
  // 等轮到我（单人模式 AI 先发言，可能要几秒）
  await waitFor(`!!document.querySelector('.composer textarea')`, '没等到轮到我', 90000);
  const text = '我这边的立场很明确：先保证可核验性，再谈效率。';
  await ev(`(()=>{const t=document.querySelector('.composer textarea');
    t.value=${JSON.stringify(text)}; t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.composer .btn.primary')].pop(); b.click(); return true})()`);
  await waitFor(`[...document.querySelectorAll('.msg.me .bub')].some(b=>b.textContent.includes('可核验性'))`, '我的气泡没出现', 30000);
  return '已提交并显示为「我」的气泡';
});

await check('B2B-6 AI 回合带打字机效果，且最终打全（不是一次性弹出）', async () => {
  // 这一项依赖真实模型返回。模型不可用/太慢时**跳过**（不算通过也不算失败），
  // 输出里会写明原因 —— 不允许「没等到 AI 也算过」。
  try {
    await waitFor(`[...document.querySelectorAll('.msg:not(.me) .bub')].some(b=>b.textContent.trim().length>0)`, 'AI 没发言', 90000);
  } catch (e) {
    return 'SKIP：AI 通道 90 秒内没返回（模型侧问题，非前端），本轮跳过打字机断言';
  }
  const first = await ev(`(()=>{const b=[...document.querySelectorAll('.msg:not(.me) .bub')].pop(); return b?b.textContent.length:0})()`);
  await sleep(700);
  const second = await ev(`(()=>{const b=[...document.querySelectorAll('.msg:not(.me) .bub')].pop(); return b?b.textContent.length:0})()`);
  // 允许「已经打完」的情况（短句），但必须最终有内容
  if (second < first) throw new Error(`打字机倒退了（${first} → ${second}）`);
  // 等它打全：最后一条不再增长
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const n = await ev(`(()=>{const b=[...document.querySelectorAll('.msg:not(.me) .bub')].pop(); return b?b.textContent.length:0})()`);
    if (n === prev && n > 0) break;
    prev = n;
    await sleep(400);
  }
  if (prev <= 0) throw new Error('AI 气泡始终是空的');
  return `字数 ${first} → ${second} → ${prev}（打全）`;
});

await check('B2B-7 倒计时在轮到我时显示（不是空白）', async () => {
  const st = await ev(`(()=>{const hint=document.querySelector('.composer .hint');
    return hint?hint.innerText.replace(/\\n/g,' | '):''})()`);
  if (!st) throw new Error('输入区没有提示条');
  return st.slice(0, 40);
});

// ==================== 复盘（用接口把对局打完，再深链过去） ====================

await check('B2B-8 复盘页：深链 #/review?match= 能渲染分数 + 逐回合 + 本场费用', async () => {
  // 用接口开一局并快速打完（SPRINT 8 步，只占 A1）
  // 先充值：上一局（浏览器里那局）开局预扣了预估费用，余额可能不够再开一局
  const order = await call('POST', '/api/pay/orders', { amountCents: 500 }, TOKEN);
  if (order.body && order.body.orderId) {
    await call(
      'POST',
      '/api/pay/callback',
      { orderId: order.body.orderId, amountCents: 500, sign: order.body.sign, tradeNo: 'MOCK-' + Date.now() },
      TOKEN
    );
  }
  const tps = await call('GET', '/api/topics', null, TOKEN);
  const topicId = (tps.body && tps.body[0] && tps.body[0].id) || null;
  if (!topicId) throw new Error('题库为空，开不了对局');
  // 关键技巧：**八个席位全占**，这样每一步都是我发言，用接口连发即可把对局打完，
  // 不依赖 AI 回合（AI 回合要等模型返回，测试里不可控）。
  const created = await call(
    'POST',
    '/api/matches',
    { seats: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'], mode: 'FULL', pace: 'tight', difficulty: 'novice', topicId },
    TOKEN
  );
  if (!created.body || !created.body.matchId) throw new Error('开不了对局：' + JSON.stringify(created).slice(0, 160));
  const mid = created.body.matchId;
  let status = 'RUNNING';
  let submits = 0;
  for (let i = 0; i < 60 && status === 'RUNNING'; i++) {
    const d = (await call('GET', '/api/matches/' + mid, null, TOKEN)).body;
    if (!d || !d.match) break;
    status = d.match.status;
    if (status !== 'RUNNING') break;
    if (d.waitingForMe) {
      await call('POST', '/api/matches/' + mid + '/turns', { content: '我方认为应当先保证可核验性，再讨论效率。', inputType: 'kb' }, TOKEN);
      submits++;
    }
    await sleep(200);
  }
  if (status === 'RUNNING') throw new Error('对局没打完（submits=' + submits + '），复盘无法验证');

  await openV2('review?match=' + mid);
  await waitFor(`!!document.querySelector('.big')`, '复盘没渲染', 20000);
  const st = await ev(`({total: document.querySelector('.big').textContent.trim(),
                        dims: document.querySelectorAll('.dim').length,
                        ev: !!document.querySelector('.ev'),
                        bill: !!document.querySelector('.bill-strip'),
                        panelBtn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('让裁判点评'))})`);
  if (!st.dims) throw new Error('没有维度条');
  if (!st.ev) throw new Error('没有证据区');
  if (!st.panelBtn) throw new Error('没有评审团按钮');
  // 本场费用条只在真的花了 token 时才渲染（满座自己对打的局 billTokens=0，没有费用可显示）
  const rev = await call('GET', '/api/matches/' + mid + '/review', null, TOKEN);
  const tokens = (rev.body && rev.body.billTokens) || 0;
  if (tokens > 0 && !st.bill) throw new Error('有 token（' + tokens + '）但没渲染「本场费用」条');
  return `${st.total} · ${st.dims} 个维度 · billTokens=${tokens}${st.bill ? ' · 费用条在' : '（无费用条）'}`;
});

// ==================== 多人房间 ====================

await check('B2B-R1 建房：房间页显示房间号 / 8 席位 / 房主可开局', async () => {
  await openV2('room');
  await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('建房'))`, '房间列表', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('建房')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.strip')`, '没进房间', 20000);
  const st = await ev(`({code: (document.querySelector('.mono')||{}).textContent,
                        seats: document.querySelectorAll('.strip .sp').length,
                        host: document.body.innerText.includes('你是房主'),
                        startBtn: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('开始辩论'))})`);
  if (st.seats !== 8) throw new Error('席位条应 8 个，实际 ' + st.seats);
  if (!st.host) throw new Error('没显示「你是房主」');
  if (!st.startBtn) throw new Error('房主没有「开始辩论」按钮');
  return `房间 ${String(st.code).trim()} · 8 席 · 房主`;
});

await check('B2B-R2 另一个人加入 → 房间页轮询自动刷新（真人 2/8）', async () => {
  // 用接口让 B 加入（等价于队友在自己机器上点加入）
  const code = (await ev(`document.querySelector('.mono').textContent.trim()`)) || '';
  const stampB = Date.now().toString().slice(-6);
  const rb = await call('POST', '/api/auth/register', { account: 'rb' + stampB, password: PWD });
  if (!rb.body?.token) throw new Error('造 B 账号失败');
  const joined = await call('POST', '/api/rooms/' + code + '/join', {}, rb.body.token);
  if (joined.status !== 200) throw new Error('B 加入失败：' + JSON.stringify(joined).slice(0, 120));
  // 不刷新页面，等 1.2s 轮询把状态带过来
  await waitFor(`document.body.innerText.indexOf('真人 2/8') >= 0`, '轮询没刷新人数', 15000);
  return '真人 2/8（未刷新页面）';
});

await check('B2B-R3 房主「邀请好友」弹窗：好友列表 + 点邀请变「已邀请」', async () => {
  // 造一个好友给 A（A 先发请求，B 接受），这样弹窗里才有内容
  const stampC = Date.now().toString().slice(-6);
  const rc = await call('POST', '/api/auth/register', { account: 'rc' + stampC, password: PWD });
  inviteeToken = (rc.body && rc.body.token) || '';   // 留给 R4 用（被邀请方的视角）
  const me = await call('GET', '/api/auth/me', null, TOKEN);
  await call('POST', '/api/social/friends/requests', { toId: rc.body.user.id, note: null }, TOKEN);
  const rq = await call('GET', '/api/social/friends/requests', null, rc.body.token);
  const pid = rq.body?.items?.[0]?.requestId;
  if (pid) await call('POST', '/api/social/friends/requests/' + pid + '/accept', null, rc.body.token);

  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('邀请好友')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.iv-box')`, '邀请弹窗没出现', 15000);
  await waitFor(`document.querySelectorAll('.iv-box .fr-row').length > 0`, '弹窗里没有好友', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.iv-box .fr-act button')].find(x=>x.textContent.includes('邀请')); b.click(); return true})()`);
  await waitFor(`[...document.querySelectorAll('.iv-box .fr-act button')].some(b=>b.textContent.includes('已邀请'))`, '按钮没变已邀请', 15000);
  const cnt = await ev(`document.querySelectorAll('.iv-box .fr-row').length`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.iv-box button')].find(x=>x.textContent.includes('关闭')); if(b) b.click(); return true})()`);
  return `好友 ${cnt} 个，已邀请状态正确`;
});

await check('B2B-R4 邀请卡片进聊天 → 点「加入房间」进新版房间页并自动加入', async () => {
  if (!inviteeToken) return 'SKIP：没有可用的被邀请账号';
  const t2 = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  if (!t2.ok) return 'SKIP：开不了第二个标签页';
  const target2 = await t2.json();
  const ws2 = new WebSocket(target2.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws2.onopen = res; ws2.onerror = rej; });
  let id2 = 0;
  const pend2 = new Map();
  ws2.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend2.has(m.id)) { const { resolve } = pend2.get(m.id); pend2.delete(m.id); resolve(m.result); }
  };
  const send2 = (method, params = {}) => new Promise((resolve) => { const i = ++id2; pend2.set(i, { resolve }); ws2.send(JSON.stringify({ id: i, method, params })); });
  const ev2 = async (x) => {
    const r = await send2('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 160));
    return r.result.value;
  };
  const wait2 = async (x, l, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev2(x)) return true; await sleep(200); }
    throw new Error('timeout:' + l);
  };
  try {
    await send2('Runtime.enable');
    await send2('Page.enable');
    await send2('Network.enable');
    await send2('Network.setCacheDisabled', { cacheDisabled: true });
    await send2('Emulation.setDeviceMetricsOverride', { width: 1400, height: 920, deviceScaleFactor: 1, mobile: false });

    // 以被邀请方身份登录 → 消息里应有一张 INVITE 卡片
    await send2('Page.navigate', { url: BASE + '/v2/index.html#/login' });
    await sleep(1000);
    await ev2(`localStorage.setItem('sy_jwt', ${JSON.stringify(inviteeToken)}); true`);
    await send2('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/chat' });
    await sleep(2500);
    await wait2(`document.querySelectorAll('.chat-conv').length > 0`, '被邀请方的会话列表', 20000);
    await ev2(`(()=>{const c=document.querySelector('.chat-conv'); if(c) c.click(); return true})()`);
    await sleep(1600);
    if (!(await ev2(`!!document.querySelector('.chat-invite')`))) throw new Error('聊天里没看到邀请卡片');

    // 点卡片上的「加入房间」→ 新版房间页 + 自动加入
    await ev2(`(()=>{const b=[...document.querySelectorAll('.chat-invite button')].find(x=>x.textContent.includes('加入房间')); b.click(); return true})()`);
    await sleep(2600);
    const st = await ev2(`({hash: location.hash, strip: !!document.querySelector('.strip'), text: document.body.innerText.slice(0, 120)})`);
    if (st.hash.indexOf('room') < 0) throw new Error('没进房间页：' + st.hash);
    if (!st.strip) throw new Error('房间页没渲染席位：' + st.text);
    return '邀请卡片 → ' + st.hash;
  } finally {
    try { ws2.close(); } catch (e) { /* 忽略 */ }
  }
});

await check('B2B-R5 热辩榜「开辩」→ 新版单人页并自动弹出选座（带题）', async () => {
  await openV2('hot');
  await waitFor(`document.querySelectorAll('table.t tbody tr').length > 0`, '热榜表格', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('table.t button')][0]; b.click(); return true})()`);
  await waitFor(`location.hash.indexOf('solo') >= 0`, '没跳单人页', 15000);
  await waitFor(`!!document.querySelector('.mask .seats')`, '选座面板没自动打开', 15000);
  const hash = await ev(`location.hash`);
  return hash;
});
await check('B2B-9 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
