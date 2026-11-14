// Vue 迁移 · 批 5 自检②：AI 三档（基础版隐藏 / 高级版 / 自带 Key 降级与免费）+ 多人房主付费展示
//
// 用法：node server/scripts/selftest_vue_tier.mjs [cdpPort] [baseUrl]
//
// 开头清 localStorage 并等应用挂载完成再断言（避免吃到上一个脚本的登录态与档位偏好）。
//
// 覆盖：
//   T1 开局面板只有「高级版 / 自带 Key」两档；基础版 unavailable → 整行不渲染
//   T2 选「自带 Key」→ 选中态 + localStorage.sy_tier=BYOK + 汇总行显示档位
//   T3 BYOK 但钱包没配 key → 后端降级 PRO（对局 tier 与页面显示都是高级版）
//   T4 钱包配好 BYOK（baseUrl/apiKey/enabled）→ 开局 tier 真的变成 BYOK
//   T5 BYOK 打完：账单服务费显示「免费」、余额没有被扣服务费
//   T6 多人房：非房主成员看本场，显示「费用 由房主承担」
//   T7 全程零 JS 异常
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

const reg = await call('POST', '/api/auth/register', { account: 'tr' + stamp, password: 'abc12345' });
if (!reg.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = reg.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '档位甲' + stamp })
});
const pay = await call('POST', '/api/pay/orders', { amountCents: 5000 }, TOKEN);
if (pay.body?.orderId) {
  await call('POST', '/api/pay/callback', {
    orderId: pay.body.orderId,
    amountCents: 5000,
    sign: pay.body.sign,
    tradeNo: 'MOCK-' + Date.now()
  }, TOKEN);
}
const tiers = await call('GET', '/api/ai-tiers', null, TOKEN);
const wallet0 = await call('GET', '/api/wallet', null, TOKEN);

/** 8 席全是我 + SPRINT：每一步都轮到我，不需要真实模型就能打完 */
const ALL_SEATS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
async function playToEnd(mid, token) {
  for (let k = 0; k < 60; k++) {
    const d = await call('GET', '/api/matches/' + mid, null, token);
    if (!d.body?.match) return false;
    if (d.body.match.status !== 'RUNNING') return true;
    if (d.body.waitingForMe) {
      await call('POST', '/api/matches/' + mid + '/turns', {
        content: '我方认为应先立住判准，再谈效率，否则结论无法核验。',
        inputType: 'kb'
      }, token);
    }
    await sleep(110);
  }
  return false;
}

async function openSoloPanel() {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/solo' });
  await sleep(1600);
  await waitFor(`document.querySelectorAll('.topic, .mask').length >= 0`, '单人页', 20000);
  await waitFor(`!!document.querySelector('.topic')`, '题库', 20000);
  await ev(`document.querySelector('.topic').click()`);
  await waitFor(`!!document.querySelector('.mask .preset')`, '选座面板', 15000);
  await sleep(600); // 等 ensureAiTiers 回来
}

await check('T1 只渲染两档（基础版 unavailable → 整行不渲染）', async () => {
  if (!tiers.body || !tiers.body.basic) throw new Error('/api/ai-tiers 没返回');
  if (tiers.body.basic.available !== false) throw new Error('本该基础版不可用，实际 available=' + tiers.body.basic.available);
  await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
  await openSoloPanel();
  const st = await ev(`(()=>{
    const labels=[...document.querySelectorAll('.mask .preset')].map(b=>b.textContent.trim());
    const box=[...document.querySelectorAll('.mask div')].find(d=>d.textContent.indexOf('AI 档位')>=0);
    return {labels, hasBasic: labels.some(t=>t==='基础版'), tierBox: !!box};
  })()`);
  if (!st.tierBox) throw new Error('选座面板里没有「AI 档位」块');
  if (st.hasBasic) throw new Error('基础版不可用却渲染出来了：' + JSON.stringify(st.labels));
  if (!st.labels.includes('高级版') || !st.labels.includes('自带 Key')) {
    throw new Error('档位不全：' + JSON.stringify(st.labels));
  }
  return '高级版 / 自带 Key（基础版已隐藏）';
});

await check('T2 选「自带 Key」→ 选中态 + sy_tier=BYOK + 汇总显示档位', async () => {
  const ok = await ev(`(()=>{const b=[...document.querySelectorAll('.mask .preset')].find(x=>x.textContent.trim()==='自带 Key');
    if(!b) return false; b.click(); return true})()`);
  if (!ok) throw new Error('找不到「自带 Key」按钮');
  await sleep(500);
  const st = await ev(`({tier: localStorage.getItem('sy_tier'),
                        on: [...document.querySelectorAll('.mask .preset')].filter(b=>b.classList.contains('on')).map(b=>b.textContent.trim()),
                        sum: (document.querySelector('.mask .sum')||{}).textContent.replace(/\\s+/g,' ').trim()})`);
  if (st.tier !== 'BYOK') throw new Error('localStorage.sy_tier 不是 BYOK：' + st.tier);
  if (!st.on.includes('自带 Key')) throw new Error('选中态没切过去：' + JSON.stringify(st.on));
  if (st.sum.indexOf('自带 Key') < 0) throw new Error('汇总行没显示档位：' + st.sum);
  return st.sum;
});

await check('T3 BYOK 但没配 key → 后端降级 PRO，页面显示高级版', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.mask button')].find(x=>x.textContent.includes('进入对局')); b.click(); return true})()`);
  await waitFor(`location.hash.indexOf('/match') >= 0`, '没进对局', 20000);
  await waitFor(`!!document.querySelector('.kv')`, '对局右侧卡片', 20000);
  await sleep(1200);
  const mid = await ev(`(location.hash.match(/match\\?match=([^&]+)/) || [])[1] || ''`);
  // 从 store 里拿 matchId（更稳）
  const matchId = await ev(`(()=>{const app=document.querySelector('#app').__vue_app__;
    const st=app.config.globalProperties.$pinia.state.value; return st.debate && st.debate.matchId})()`);
  const d = await call('GET', '/api/matches/' + matchId, null, TOKEN);
  const tier = d.body && d.body.match && d.body.match.tier;
  if (tier !== 'PRO') throw new Error('后端没降级到 PRO，实际 ' + tier);
  const ui = await ev(`(()=>{const rows=[...document.querySelectorAll('.kv')].map(x=>x.textContent.replace(/\\s+/g,' ').trim());
    return rows.filter(t=>t.indexOf('AI 档位')>=0).join('|')})()`);
  if (ui.indexOf('高级版') < 0) throw new Error('页面没显示高级版：' + ui);
  return '对局 tier=' + tier + '，页面「' + ui + '」';
});

await check('T4 钱包配好 BYOK（baseUrl+key+enabled）→ 开局 tier 真的是 BYOK', async () => {
  const save = await call('POST', '/api/llm/profile', {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    apiKey: 'sk-test-' + stamp,
    enabled: true
  }, TOKEN);
  if (save.status !== 200) throw new Error('保存 BYOK 配置失败：' + JSON.stringify(save).slice(0, 120));
  const topics = await call('GET', '/api/topics', null, TOKEN);
  const mk = await call('POST', '/api/matches', {
    topicId: topics.body[0].id,
    seats: ALL_SEATS,
    mode: 'SPRINT',
    pace: 'tight',
    difficulty: 'novice',
    tier: 'BYOK'
  }, TOKEN);
  if (!mk.body?.matchId) throw new Error('开不了局：' + JSON.stringify(mk).slice(0, 120));
  const d = await call('GET', '/api/matches/' + mk.body.matchId, null, TOKEN);
  const tier = d.body && d.body.match && d.body.match.tier;
  if (tier !== 'BYOK') throw new Error('配了 key 仍不是 BYOK，实际 ' + tier);
  return 'BYOK 生效（matchId=' + mk.body.matchId + '）';
});

await check('T5 BYOK 打完：账单服务费「免费」，余额没被扣服务费', async () => {
  const topics = await call('GET', '/api/topics', null, TOKEN);
  const mk = await call('POST', '/api/matches', {
    topicId: topics.body[0].id,
    seats: ALL_SEATS,
    mode: 'SPRINT',
    pace: 'tight',
    difficulty: 'novice',
    tier: 'BYOK'
  }, TOKEN);
  const mid = mk.body.matchId;
  const before = await call('GET', '/api/wallet', null, TOKEN);
  const finished = await playToEnd(mid, TOKEN);
  if (!finished) throw new Error('这场没打完（轮询超时）');
  await sleep(800);
  const after = await call('GET', '/api/wallet', null, TOKEN);
  const d0 = Number(before.body && (before.body.balanceCents ?? before.body.balance));
  const d1 = Number(after.body && (after.body.balanceCents ?? after.body.balance));
  if (d1 !== d0) throw new Error('BYOK 本场居然扣钱了：' + d0 + ' → ' + d1);

  // 页面账单
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/review?match=' + mid });
  await sleep(2400);
  await waitFor(`!!document.querySelector('.bill-strip')`, '账单条', 25000);
  const bill = await ev(`(document.querySelector('.bill-strip')||{}).innerText.replace(/\\s+/g,' ').trim()`);
  if (bill.indexOf('自带 Key') < 0) throw new Error('账单没显示档位：' + bill);
  if (bill.indexOf('服务费 免费') < 0 && !/服务费\s*免费/.test(bill)) throw new Error('服务费没显示免费：' + bill);
  return '余额 ' + d0 + ' → ' + d1 + '；' + bill.slice(0, 80);
});

await check('T6 多人房：非房主成员看对局，显示「费用 由房主承担」', async () => {
  // A=房主（当前账号），B=队友；B 加入并准备，A 开局
  const bReg = await call('POST', '/api/auth/register', { account: 'trb' + stamp, password: 'abc12345' });
  const B = bReg.body.token;
  const room = await call('POST', '/api/rooms', {}, TOKEN);
  const code = room.body && room.body.code;
  if (!code) throw new Error('建房失败：' + JSON.stringify(room).slice(0, 120));
  const join = await call('POST', '/api/rooms/' + code + '/join', {}, B);
  if (join.status !== 200) throw new Error('B 加入房间失败：' + JSON.stringify(join).slice(0, 120));
  await call('POST', '/api/rooms/' + code + '/ready', { ready: true }, B);
  const start = await call('POST', '/api/rooms/' + code + '/start', {}, TOKEN);
  const mid = start.body && start.body.matchId;
  if (!mid) throw new Error('开局失败：' + JSON.stringify(start).slice(0, 140));
  const d = await call('GET', '/api/matches/' + mid, null, TOKEN);
  const payer = d.body && d.body.match && d.body.match.payer_user_id;
  const owner = d.body && d.body.match && d.body.match.user_id;
  if (!payer) throw new Error('后端没记 payer_user_id');
  if (String(payer) !== String(owner)) throw new Error('房间局的 payer 不等于发起人：' + payer + ' vs ' + owner);

  // 以 B 的身份打开这一场（带 ?match= 深链）
  await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(B)}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/match?match=' + mid });
  await sleep(2200);
  await waitFor(`!!document.querySelector('.kv')`, '对局页', 25000);
  const rows = await ev(`[...document.querySelectorAll('.kv')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()).join('|')`);
  if (rows.indexOf('由房主承担') < 0) throw new Error('没显示房主承担：' + rows);
  return 'B 视角：' + rows.split('|').filter((t) => t.indexOf('费用') >= 0)[0] + '（payer=' + payer + '）';
});

await check('T7 全程零 JS 异常', async () => {
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
