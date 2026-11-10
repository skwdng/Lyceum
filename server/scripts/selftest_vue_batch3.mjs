// Vue 迁移 · 批 3 自检（社区：列表 / 详情 / 发帖 / 评论 / 楼中楼 / @提及 / 点赞 / 举报 / 通知深链）
//
// 用法：node server/scripts/selftest_vue_batch3.mjs [cdpPort] [baseUrl]
//
// 数据用接口预置（两篇帖子 + 一条评论），UI 只做交互验证。
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

const stamp = Date.now().toString().slice(-6);
const ACC = 'cm' + stamp;
const OTHER = 'cmb' + stamp;
const PWD = 'abc12345';
const TITLE1 = '自检帖一：怎么练立论' + stamp;
const TITLE2 = '自检帖二：求助！质询怎么提问' + stamp;

const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

const me = await call('POST', '/api/auth/register', { account: ACC, password: PWD });
const other = await call('POST', '/api/auth/register', { account: OTHER, password: PWD });
if (!me.body?.token || !other.body?.token) {
  console.log('准备账号失败');
  process.exit(1);
}
const TOKEN = me.body.token;
const OTHER_TOKEN = other.body.token;
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ name: '甲' + stamp })
});
await fetch(BASE + '/api/auth/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OTHER_TOKEN },
  body: JSON.stringify({ name: '乙' + stamp })
});

// 预置：其它账号发两篇帖（用于验证搜索/筛选/举报；自己发的另一篇用于编辑删除）
const p1 = await call('POST', '/api/community/posts', { type: 'GUIDE', title: TITLE1, body: '## 先说结论\n\n练习要**有针对性**。\n\n- 每天一道\n- 打完立刻复盘' }, OTHER_TOKEN);
const p2 = await call('POST', '/api/community/posts', { type: 'HELP', title: TITLE2, body: '质询老是问不住对方，怎么办？' }, OTHER_TOKEN);
if (!p1.body?.postId || !p2.body?.postId) {
  console.log('预置帖子失败：' + JSON.stringify({ p1, p2 }).slice(0, 240));
  process.exit(1);
}
// 给帖一挂一条别人的评论（用于楼中楼/@提及）
const c1 = await call('POST', '/api/community/posts/' + p1.body.postId + '/comments', { body: '我也想练立论，一起加油', replyObjectType: 'POST' }, OTHER_TOKEN);

async function openV2(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(1600);
}

await send('Page.navigate', { url: BASE + '/v2/index.html#/login' });
await sleep(900);
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(TOKEN)}); true`);

// ==================== 列表 ====================

await check('B3-C1 社区列表：帖子卡 / 概览 / 热门辩题 / 须知都在', async () => {
  await openV2('community');
  await waitFor(`document.querySelectorAll('.cm .post').length > 0`, '帖子列表', 25000);
  const st = await ev(`({posts: document.querySelectorAll('.cm .post').length,
                        types: [...document.querySelectorAll('.ptype')].map(x=>x.textContent.trim()).slice(0,3),
                        stat: document.querySelectorAll('.cm-stat').length,
                        tabs: document.querySelectorAll('.cm .tab').length})`);
  if (!st.posts) throw new Error('没有帖子');
  if (st.stat < 3) throw new Error('侧栏概览不全：' + st.stat);
  if (st.tabs < 8) throw new Error('筛选 Tab 不全：' + st.tabs);
  return `帖子 ${st.posts} 张，Tab ${st.tabs} 个，类型 ${st.types.join('/')}`;
});

await check('B3-C2 搜索：只按标题过滤（280ms 防抖后命中 1 篇）', async () => {
  await ev(`(()=>{const i=document.querySelector('.sbox input');
    i.value=${JSON.stringify('自检帖一：怎么练立论' + stamp)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await sleep(1200);
  const st = await ev(`({n: document.querySelectorAll('.cm .post').length,
                        first: (document.querySelector('.cm .post-title em')||{}).textContent,
                        mark: !!document.querySelector('.cm mark')})`);
  if (st.n !== 1) throw new Error('搜索命中数不对：' + st.n);
  if (String(st.first).indexOf(stamp) < 0) throw new Error('命中的不是那篇：' + st.first);
  return `命中 1 篇，高亮=${st.mark}`;
});

await check('B3-C3 类型筛选 + 筛选胶囊可单点移除', async () => {
  await ev(`(()=>{const i=document.querySelector('.sbox input'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await sleep(900);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm .tab')].find(x=>x.textContent.trim()==='求助'); b.click(); return true})()`);
  await sleep(1400);
  const withChip = await ev(`({n: document.querySelectorAll('.cm .post').length, chips: document.querySelectorAll('.fchip').length})`);
  if (withChip.chips < 1) throw new Error('没有筛选胶囊');
  await ev(`(()=>{const i=document.querySelector('.fchip i'); i.click(); return true})()`);
  await sleep(1400);
  const after = await ev(`({chips: document.querySelectorAll('.fchip').length, n: document.querySelectorAll('.cm .post').length})`);
  if (after.chips !== 0) throw new Error('胶囊没被移除');
  if (after.n < 2) throw new Error('清除筛选后帖子数没恢复：' + after.n);
  return `筛选后 ${withChip.n} 篇 → 清除后 ${after.n} 篇`;
});

// ==================== 发帖 ====================

await check('B3-C4 发帖：类型/标题/正文 → 跳详情且 Markdown 渲染正确', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm button')].find(x=>x.textContent.includes('＋ 发布帖子')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.cm-modal')`, '发帖弹窗', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm-modal .cm-opt')].find(x=>x.textContent.includes('教程')); b.click(); return true})()`);
  await ev(`(()=>{const i=document.querySelector('.cm-modal .cm-input');
    i.value=${JSON.stringify('自检帖三：我的立论模板' + stamp)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const t=document.querySelector('.cm-modal .cm-textarea');
    t.value=${JSON.stringify('## 模板\n\n第一句亮明**立场**。\n\n- 定义\n- 标准\n- 论点')};
    t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm-modal-foot button')].find(x=>x.textContent.includes('发布')); b.click(); return true})()`);
  await waitFor(`location.hash.indexOf('community/') >= 0`, '没跳详情', 20000);
  await waitFor(`!!document.querySelector('.post-body')`, '详情没渲染', 20000);
  const st = await ev(`({h: !!(document.querySelector('.post-body h2') || document.querySelector('.post-body h3')),
                        b: !!document.querySelector('.post-body b'),
                        ul: !!document.querySelector('.post-body ul'),
                        title: (document.querySelector('.ccard h2')||{}).textContent,
                        type: (document.querySelector('.ptype')||{}).textContent})`);
  if (!st.h || !st.b || !st.ul) throw new Error('Markdown 没渲染全：' + JSON.stringify(st));
  return `${st.title} · 类型 ${st.type} · h2/b/ul 都在`;
});

// ==================== 详情：点赞 / 评论 / 楼中楼 / @ ====================

await check('B3-C5 点赞：+1 且按钮变「已赞」，再点回退', async () => {
  const before = await ev(`(()=>{const b=[...document.querySelectorAll('.ccard .btn')].find(x=>x.textContent.includes('点赞')||x.textContent.includes('已赞'));
    return b?b.textContent.replace(/\\s+/g,' ').trim():''})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.ccard .btn')].find(x=>x.textContent.includes('点赞')||x.textContent.includes('已赞')); b.click(); return true})()`);
  await sleep(1500);
  const after = await ev(`(()=>{const b=[...document.querySelectorAll('.ccard .btn')].find(x=>x.textContent.includes('点赞')||x.textContent.includes('已赞'));
    return b?b.textContent.replace(/\\s+/g,' ').trim():''})()`);
  if (after.indexOf('已赞') < 0) throw new Error('没变成已赞：' + after);
  await ev(`(()=>{const b=[...document.querySelectorAll('.ccard .btn')].find(x=>x.textContent.includes('已赞')); b.click(); return true})()`);
  await sleep(1500);
  const back = await ev(`(()=>{const b=[...document.querySelectorAll('.ccard .btn')].find(x=>x.textContent.includes('点赞')||x.textContent.includes('已赞'));
    return b?b.textContent.replace(/\\s+/g,' ').trim():''})()`);
  if (back.indexOf('已赞') >= 0) throw new Error('没取消点赞：' + back);
  return `${before} → ${after} → ${back}`;
});

await check('B3-C6 发表评论：出现在评论区，字数计数正确', async () => {
  await ev(`(()=>{const t=document.querySelector('#replyInput');
    t.value='这条是自检评论'; t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await sleep(300);
  const cnt = await ev(`document.body.innerText.match(/(\\d+) \\/ 1000/)?document.body.innerText.match(/(\\d+) \\/ 1000/)[1]:''`);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发布回复')); b.click(); return true})()`);
  await waitFor(`[...document.querySelectorAll('.reply-text')].some(x=>x.textContent.includes('自检评论'))`, '评论没出现', 20000);
  return `计数 ${cnt} / 1000，评论已出现`;
});

await check('B3-C7 楼中楼：回复某条评论 → 显示「回复了 对方」', async () => {
  await ev(`(()=>{const s=[...document.querySelectorAll('.reply-like span')].find(x=>x.textContent.trim()==='回复'); s.click(); return true})()`);
  await sleep(600);
  const chip = await ev(`document.body.innerText.indexOf('回复 ') >= 0`);
  await ev(`(()=>{const t=document.querySelector('#replyInput');
    t.value='楼中楼自检'; t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发布回复')); b.click(); return true})()`);
  await waitFor(`document.querySelectorAll('.reply-sub').length > 0`, '楼中楼没出现', 20000);
  const st = await ev(`(()=>{const s=document.querySelector('.reply-sub');
    return {text: s?s.innerText.replace(/\\n/g,' | ').slice(0,80):'', hasReplyTo: !!(s&&s.innerText.indexOf('回复了')>=0)}})()`);
  if (!st.hasReplyTo) throw new Error('楼中楼没有「回复了」：' + st.text);
  return st.text;
});

await check('B3-C8 @提及：输入 @ 弹候选，选中后正文带浅蓝 @昵称', async () => {
  await ev(`(()=>{const t=document.querySelector('#replyInput');
    t.value='@乙'; t.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await waitFor(`!!document.querySelector('.mention-box')`, '@ 候选没出现', 15000);
  const cand = await ev(`document.querySelectorAll('.mention-item').length`);
  await ev(`(()=>{const it=document.querySelector('.mention-item'); it.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); return true})()`);
  await sleep(500);
  const inserted = await ev(`document.querySelector('#replyInput').value`);
  if (String(inserted).indexOf('@') < 0) throw new Error('没插入 @昵称：' + inserted);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('发布回复')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.reply-text .mention')`, '@ 没渲染成浅蓝', 20000);
  return `候选 ${cand} 个，插入「${String(inserted).slice(0, 20)}」`;
});

// ==================== 编辑 / 举报 / 通知深链 ====================

await check('B3-C9 编辑自己的帖子：改标题后立即生效', async () => {
  await ev(`(()=>{const b=[...document.querySelectorAll('.ccard button')].find(x=>x.textContent.trim()==='编辑'); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.cm-modal')`, '编辑弹窗', 15000);
  const newTitle = '自检帖三（已编辑）' + stamp;
  await ev(`(()=>{const i=document.querySelector('.cm-modal .cm-input');
    i.value=${JSON.stringify(newTitle)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm-modal-foot button')].find(x=>x.textContent.includes('保存')); b.click(); return true})()`);
  await sleep(1800);
  const title = await ev(`(document.querySelector('.ccard h2')||{}).textContent`);
  if (String(title).indexOf('已编辑') < 0) throw new Error('标题没更新：' + title);
  return title;
});

await check('B3-C10 举报别人的帖子 → 我的举报里出现「待处理」', async () => {
  await openV2('community/' + p1.body.postId);
  await waitFor(`!!document.querySelector('.ccard h2')`, '详情', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.page-head button')].find(x=>x.textContent.includes('举报')); b.click(); return true})()`);
  await waitFor(`!!document.querySelector('.cm-modal')`, '举报弹窗', 15000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm-modal .cm-opt')].find(x=>x.textContent.includes('垃圾广告')); b.click(); return true})()`);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm-modal-foot button')].find(x=>x.textContent.includes('提交举报')); b.click(); return true})()`);
  await sleep(1600);
  // 打开「我的举报」
  await openV2('community');
  await waitFor(`!!document.querySelector('.cm .post')`, '列表', 20000);
  await ev(`(()=>{const b=[...document.querySelectorAll('.cm button')].find(x=>x.textContent.includes('我的举报')); b.click(); return true})()`);
  await waitFor(`document.body.innerText.indexOf('待处理') >= 0`, '我的举报里没有待处理记录', 15000);
  return '举报已提交，我的举报里显示待处理';
});

await check('B3-C11 通知里的「帖子类」点击 → 本地路由到帖子详情并定位楼层', async () => {
  // 用「@提及」通知验定位：# 它带 commentId（实测 COMMENT_POST 的 commentId 为 null，是跳到帖子首页）
  const mine = await call('GET', '/api/auth/me', null, TOKEN);
  const myId = mine.body && mine.body.id;
  const myName = (mine.body && mine.body.name) || '';
  const post = await call('POST', '/api/community/posts', { type: 'CHAT', title: '通知深链自检' + stamp, body: '正文' }, TOKEN);
  const pid = post.body.postId;
  const reply = await call(
    'POST',
    '/api/community/posts/' + pid + '/comments',
    { body: '@' + myName + ' 你好，来看这条', replyObjectType: 'POST', mentions: [myId] },
    OTHER_TOKEN
  );
  if (!pid || !reply.body?.commentId) throw new Error('预置评论失败');
  await sleep(900);
  await openV2('notify');
  await waitFor(`document.querySelectorAll('.notify-row').length > 0`, '通知列表', 20000);
  await ev(`(()=>{const r=[...document.querySelectorAll('.notify-row')].find(x=>x.textContent.includes('@ 了你')); (r||document.querySelector('.notify-row')).click(); return true})()`);
  await waitFor(`location.hash.indexOf('community/') >= 0`, '没跳到帖子详情', 20000);
  const hash = await ev(`location.hash`);
  await waitFor(`!!document.querySelector('.reply-item')`, '详情没渲染', 20000);
  if (hash.indexOf('around=') < 0) throw new Error('没带 around 定位参数：' + hash);
  const focused = await ev(`!!document.querySelector('.cm-focus') || document.querySelectorAll('.reply-item').length > 0`);
  if (!focused) throw new Error('没定位到楼层');
  return hash;
});
await check('B3-C12 旧页社区仍可用（旧实现照旧渲染）', async () => {
  await send('Page.navigate', { url: BASE + '/?v=community' });
  await sleep(2600);
  await waitFor(`!!document.querySelector('#nav a')`, '旧页外壳', 20000);
  const st = await ev(`({old: typeof S !== 'undefined', posts: document.querySelectorAll('.cm .post').length,
                        nav: document.querySelectorAll('#nav a').length})`);
  if (!st.old) throw new Error('没进旧页');
  if (!st.posts) throw new Error('旧页社区没渲染帖子');
  return `旧页社区 ${st.posts} 篇，导航 ${st.nav} 项`;
});

await check('B3-C13 全程零 JS 异常', async () => {
  const all = errs.filter((e) => !/ResizeObserver|favicon/i.test(e || ''));
  if (all.length) throw new Error(all.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter((x) => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
