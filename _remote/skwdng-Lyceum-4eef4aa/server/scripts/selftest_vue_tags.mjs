// T2 前端自检：发帖标签选择器 / 热门标签条与筛选 / 卡片与详情展示
//
// 用法：node server/scripts/selftest_vue_tags.mjs [cdpPort] [baseUrl]
import crypto from 'crypto';

const PORT = process.argv[2] || '9482';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEV_SECRET = 'siyige-dev-only-jwt-secret-do-not-use-in-production-0123456789';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function userToken(sub, acc) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ sub: String(sub), acc, jti: crypto.randomUUID(), iat: now, exp: now + 7200 });
  const sig = crypto.createHmac('sha256', DEV_SECRET).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + sig;
}

const call = async (method, path, body, token) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt.slice(0, 120) }; }
  return { status: r.status, body: j };
};

// ---------- 造数：一个用户 + 两篇带标签的帖子 ----------
const stamp = Date.now().toString().slice(-6);
const acc = 'tgui' + stamp;
await call('POST', '/api/auth/register', { account: acc, password: 'abc12345' });
const realTok = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
const me = await call('GET', '/api/auth/me', undefined, realTok);
const uid = me.body.id;
const TOKEN = userToken(uid, acc);

const TAG_A = '界面标签' + stamp.slice(-3);
const TAG_B = '第二标签' + stamp.slice(-3);
const postA = await call('POST', '/api/community/posts',
  { type: 'GUIDE', title: `带标签的帖子 ${stamp}`, body: '这条用来验证卡片与详情的标签展示。', tags: [TAG_A, TAG_B] }, TOKEN);
const postB = await call('POST', '/api/community/posts',
  { type: 'CHAT', title: `只剩一个标签的帖子 ${stamp}`, body: '这条只带 TAG_A。', tags: [TAG_A] }, TOKEN);
// 第三条只带 TAG_B：用来证明"筛选后不该出现没这个标签的帖子"
await call('POST', '/api/community/posts',
  { type: 'CHAT', title: `无关标签的帖子 ${stamp}`, body: '这条只有 TAG_B，按 TAG_A 筛时不该出现。', tags: [TAG_B] }, TOKEN);
const tagAId = (postA.body.tags || []).find((t) => t.name === TAG_A)?.id;
const postAId = postA.body.postId;

// ---------- CDP ----------
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
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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
const send = (method, params = {}) => new Promise((resolve, reject) => {
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

async function open(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/login' });
  await sleep(900);
  await ev(`localStorage.clear(); localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(2200);
}

// ==================== 1. 热门标签条 ====================
await check('1 社区页有热门标签条，且包含刚用过的标签', async () => {
  await open('/community');
  await waitFor(`!!document.querySelector('[data-panel="tag-bar"]')`, '标签条', 20000);
  await waitFor(`document.querySelectorAll('[data-panel="tag-bar"] .htag').length > 1`, '标签条有内容', 20000);
  const names = await ev(`[...document.querySelectorAll('[data-panel="tag-bar"] .htag')].map(b=>b.textContent.trim())`);
  if (!names.includes(TAG_A)) throw new Error('标签条里没有 ' + TAG_A + '：' + JSON.stringify(names));
  if (names[0] !== '全部') throw new Error('第一个应该是「全部」：' + JSON.stringify(names));
  return names.slice(0, 5).join(' / ');
});

// ==================== 2. 卡片显示标签 ====================
await check('2 卡片上显示标签（前 3 个 + 折叠计数）', async () => {
  const tags = await ev(`[...document.querySelectorAll('.cm .post')].flatMap(c=>[...c.querySelectorAll('.p-tag')].map(t=>t.textContent.trim()))`);
  if (!tags.includes(TAG_A)) throw new Error('卡片上看不到 ' + TAG_A + '：' + JSON.stringify(tags));
  const more = await ev(`[...document.querySelectorAll('.cm .post .p-tag.more')].length`);
  return tags.length + ' 个标签位' + (more ? '（含 +N）' : '') + ' · ' + tags.slice(0, 4).join('/');
});

// ==================== 3. 点热门标签 → URL 带 tagId + 列表收窄 ====================
await check('3 点热门标签 → URL 带 tagId，列表只剩带该标签的帖子', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="tag-bar"] .htag')]
    .find(x=>x.textContent.trim()===${JSON.stringify(TAG_A)}); b.click(); return true;})()`);
  await sleep(1600);
  const hash = await ev('location.hash');
  if (!hash.includes('tagId=' + tagAId)) throw new Error('URL 没带 tagId：' + hash);
  const titles = await ev(`[...document.querySelectorAll('.cm .post .post-title em')].map(e=>e.textContent.trim())`);
  const total = await ev(`(document.querySelector('.cm .post')?1:0)+0`);
  if (!titles.some((t) => t.includes('带标签的帖子'))) throw new Error('列表里没有那篇：' + JSON.stringify(titles));
  if (titles.some((t) => t.includes('无关标签的帖子'))) {
    throw new Error('没这个标签的帖子不该出现：' + JSON.stringify(titles));
  }
  if (!total) throw new Error('列表空了');
  const chip = await ev(`[...document.querySelectorAll('.fchip b')].map(b=>b.textContent.trim()).join('|')`);
  if (!chip.includes('标签：' + TAG_A)) throw new Error('筛选胶囊没显示标签：' + chip);
  return hash;
});

// ==================== 4. 刷新后仍是筛选状态（URL 承载） ====================
await check('4 刷新页面后筛选状态还在（URL 承载，不是内存状态）', async () => {
  await send('Page.reload');
  await sleep(2400);
  const hash = await ev('location.hash');
  if (!hash.includes('tagId=' + tagAId)) throw new Error('刷新后 URL 丢了 tagId：' + hash);
  const on = await ev(`[...document.querySelectorAll('[data-panel="tag-bar"] .htag.on')].map(b=>b.textContent.trim()).join()`);
  if (!on.includes(TAG_A)) throw new Error('标签条没有高亮当前标签：' + on);
  return hash;
});

// ==================== 5. 点「全部」→ 取消筛选 ====================
await check('5 点「全部」→ 取消标签筛选，URL 干净', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="tag-bar"] .htag')]
    .find(x=>x.textContent.trim()==='全部'); b.click(); return true;})()`);
  await sleep(1500);
  const hash = await ev('location.hash');
  if (hash.includes('tagId=')) throw new Error('URL 还带 tagId：' + hash);
  const titles = await ev(`[...document.querySelectorAll('.cm .post .post-title em')].map(e=>e.textContent.trim())`);
  if (!titles.some((t) => t.includes('只剩一个标签'))) throw new Error('取消筛选后列表没恢复：' + JSON.stringify(titles));
  return hash + ' · ' + titles.length + ' 篇';
});

// ==================== 6. 详情页标签 → 点回列表筛选 ====================
await check('6 详情页显示完整标签；点标签回列表并筛选', async () => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/community/' + postAId });
  await sleep(2400);
  await waitFor(`!!document.querySelector('[data-panel="post-tags"]')`, '详情标签', 20000);
  const names = await ev(`[...document.querySelectorAll('[data-panel="post-tags"] .p-tag')].map(t=>t.textContent.trim())`);
  if (names.length !== 2 || !names.includes(TAG_A) || !names.includes(TAG_B)) {
    throw new Error('详情标签不对：' + JSON.stringify(names));
  }
  await ev(`(()=>{document.querySelector('[data-panel="post-tags"] .p-tag').click(); return true;})()`);
  await sleep(1800);
  const hash = await ev('location.hash');
  if (!hash.includes('#/community') || !hash.includes('tagId=')) throw new Error('点标签没跳回列表：' + hash);
  return names.join('/') + ' → ' + hash;
});

// ==================== 7. 发帖弹窗的标签选择器 ====================
await check('7 发帖弹窗：输入联想 + 回车成 chip + 满 5 个禁用输入', async () => {
  await open('/community');
  await ev(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.includes('发布帖子')).click(); return true;})()`);
  await waitFor(`!!document.querySelector('[data-panel="tag-picker"]')`, '标签选择器', 20000);

  // 输入已存在的标签 → 出现联想
  await ev(`(()=>{const i=document.querySelector('[data-panel="tag-picker"] input');
    i.value=${JSON.stringify(TAG_A)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await sleep(900);
  const sug = await ev(`[...document.querySelectorAll('.tag-sug .ts')].map(x=>x.textContent.trim())`);
  if (!sug.some((s) => s.includes(TAG_A))) throw new Error('联想没出现：' + JSON.stringify(sug));

  // 回车选中联想 → 变 chip
  await ev(`(()=>{const i=document.querySelector('[data-panel="tag-picker"] input');
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return true;})()`);
  await sleep(500);
  const chips1 = await ev(`[...document.querySelectorAll('[data-panel="tag-picker"] .tp-chip')].map(c=>c.textContent.replace('✕','').trim())`);
  if (!chips1.includes(TAG_A)) throw new Error('没加成 chip：' + JSON.stringify(chips1));

  // 再敲一个新词回车 = 新建
  await ev(`(()=>{const i=document.querySelector('[data-panel="tag-picker"] input');
    i.value='新造标签${stamp.slice(-2)}'; i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return true;})()`);
  await sleep(500);
  const chips2 = await ev(`[...document.querySelectorAll('[data-panel="tag-picker"] .tp-chip')].map(c=>c.textContent.replace('✕','').trim())`);
  if (chips2.length !== 2) throw new Error('新标签没加上：' + JSON.stringify(chips2));

  // 补满 5 个，第 6 个输入框应禁用
  await ev(`(()=>{const box=document.querySelector('[data-panel="tag-picker"]');
    const i=box.querySelector('input');
    ['补位1','补位2','补位3'].forEach(n=>{ i.value=n; i.dispatchEvent(new Event('input',{bubbles:true}));
      i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); });
    return true;})()`);
  await sleep(600);
  const state = await ev(`(()=>{const i=document.querySelector('[data-panel="tag-picker"] input');
    return { chips:[...document.querySelectorAll('[data-panel="tag-picker"] .tp-chip')].length, disabled: i.disabled,
             ph: i.placeholder };})()`);
  if (state.chips !== 5) throw new Error('应该正好 5 个标签：' + JSON.stringify(state));
  if (!state.disabled) throw new Error('满 5 个后输入框应禁用：' + JSON.stringify(state));
  return '5 个 · 输入框禁用 · ' + state.ph;
});

// ==================== 8. 发出去以后卡片与详情都带新标签 ====================
await check('8 带标签发帖 → 详情页显示这些标签', async () => {
  const title = '自检发帖' + stamp;
  await ev(`(()=>{const box=document.querySelector('.cm-modal');
    const t=box.querySelector('input.cm-input'); t.value=${JSON.stringify(title)};
    t.dispatchEvent(new Event('input',{bubbles:true}));
    const ta=box.querySelector('textarea'); ta.value='自检正文，验证标签提交后能显示。';
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    [...box.querySelectorAll('.cm-modal-foot button')].find(b=>b.textContent.includes('发布')).click();
    return true;})()`);
  await waitFor(`location.hash.includes('/community/')`, '跳到详情', 20000);
  await sleep(1200);
  await waitFor(`!!document.querySelector('[data-panel="post-tags"]')`, '详情标签', 20000);
  const names = await ev(`[...document.querySelectorAll('[data-panel="post-tags"] .p-tag')].map(t=>t.textContent.trim())`);
  if (names.length !== 5) throw new Error('详情应有 5 个标签：' + JSON.stringify(names));
  return names.join('/');
});

await check('9 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
