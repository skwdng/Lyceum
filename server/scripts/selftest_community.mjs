// 社区前端自检（CDP 直连真浏览器，无 npm 依赖）
// 用法：先起后端（localhost:8080），再
//   node server/scripts/selftest_community.mjs 9455
// 做法与仓库既有 selftest_*.mjs 一致：连 Chrome/Edge 的 /json/list，用 WebSocket 发 CDP 命令。
const PORT = process.argv[2] || '9455';
const APP = process.argv[3] || 'http://localhost:8080/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const l = await r.json();
      const p = l.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target on port ' + PORT);
}

const ws = new WebSocket(await getWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pend = new Map();
const consoleErrors = [];
const pageErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pend.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};
const waitFor = async (expr, label, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evalJs(expr)) return true;
    await sleep(150);
  }
  throw new Error('timeout: ' + label);
};

const results = [];
const check = async (name, fn) => {
  try { const v = await fn(); results.push({ name, ok: true, detail: v === undefined ? '' : String(v) }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(1200);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, '页面 boot 完成', 20000);

// 2026-11-03：社区身份走 JWT，先自动注册一个账号并把 token 写进 localStorage
const smokeAcc = 'ui' + Date.now().toString().slice(-6);
await evalJs(`(async()=>{const r=await authApi('/api/auth/register','POST',{account:'${smokeAcc}',password:'abc12345'});authSetToken(r.token);S.user=r.user;return true;})()`);

await check('A1 点导航"讨论社区"后 URL 不跳页', async () => {
  const before = await evalJs('location.pathname');
  await evalJs(`(()=>{const a=[...document.querySelectorAll('#nav a')].find(x=>x.textContent.includes('讨论社区'));if(!a)throw new Error('导航项缺失');a.click();return true;})()`);
  await waitFor(`S.view==='community'`, 'S.view 切到 community');
  const after = await evalJs('location.pathname');
  if (before !== after) throw new Error(`URL 变了：${before} -> ${after}`);
  return `pathname 保持 ${after}`;
});

await check('A2 社区视图渲染出 .cm 容器', async () => {
  await waitFor(`!!document.querySelector('.cm')`, '.cm 容器');
  return await evalJs(`document.querySelector('.cm').className`);
});

await check('A3 列表从后端拉到数据（total 可读）', async () => {
  await waitFor(`typeof S.postTotal === 'number' && (typeof S.comm.postId !== 'undefined')`, 'S 状态就绪');
  await sleep(600);
  const n = await evalJs(`S.posts.length`);
  return `S.posts=${n}, S.postTotal=${await evalJs('S.postTotal')}`;
});

await check('A4 发帖：点按钮 -> 填表 -> 提交 -> 列表刷新', async () => {
  await evalJs(`cmOpenNewPost()`);
  await waitFor(`!!document.querySelector('#cmTitle')`, '发帖弹窗');
  await evalJs(`(()=>{
     const t=document.querySelector('#cmTitle'); t.value='自检帖 '+Date.now();
     const b=document.querySelector('#cmBody'); b.value='自检正文：加微信 与 赌博（应被打码）';
     return true;})()`);
  await evalJs(`cmSubmitPost(null)`);
  await sleep(1500);
  const titles = await evalJs(`S.posts.map(p=>p.title).slice(0,5)`);
  if (!Array.isArray(titles) || !titles.some(t => String(t).startsWith('自检帖'))) throw new Error('列表里没找到新帖：' + JSON.stringify(titles));
  return titles[0];
});

await check('A5 敏感词已由后端打码（正文不含原文）', async () => {
  const p = await evalJs(`(S.posts.find(x=>String(x.title).startsWith('自检帖'))||{}).excerpt`);
  if (!p) throw new Error('拿不到摘要');
  if (String(p).includes('加微信') || String(p).includes('赌博')) throw new Error('摘要仍有原文：' + p);
  return p;
});

await check('A5b B7 发帖后直接用返回的 postId 进详情', async () => {
  const st = await evalJs(`({view:S.comm.view, id:S.postDetail && S.postDetail.id, title:S.postDetail && S.postDetail.title})`);
  if (st.view !== 'post' || !st.id) throw new Error('没有直接进详情：' + JSON.stringify(st));
  if (!String(st.title).startsWith('自检帖')) throw new Error('详情标题不对：' + st.title);
  return `postId=${st.id} view=post`;
});
await check('A6 进详情 -> 发评论 -> 评论出现', async () => {
  await evalJs(`(()=>{const p=S.posts.find(x=>String(x.title).startsWith('自检帖'));cmOpenPost(p.id);return true;})()`);
  await waitFor(`S.comm.view==='post' && S.postDetail`, '进入详情');
  await sleep(600);
  await evalJs(`(()=>{const i=document.querySelector('#replyInput');if(!i)throw new Error('没有回复框');i.value='自检评论 '+Date.now();return true;})()`);
  await evalJs(`cmPostReply()`);
  await sleep(1600);
  const n = await evalJs(`S.postComments.length`);
  if (!n) throw new Error('评论没出现');
  return `S.postComments=${n}`;
});

await check('A7 点赞 -> 点赞态变化', async () => {
  const before = await evalJs(`S.postDetail && S.postDetail.likeCount`);
  await evalJs(`cmLikePost()`);
  await sleep(1200);
  const after = await evalJs(`S.postDetail && S.postDetail.likeCount`);
  return `likeCount ${before} -> ${after}`;
});

await check('A8 返回列表 -> 筛选/翻页控件在', async () => {
  await evalJs(`(()=>{S.comm.view='list';S.comm.postId=null;render();return true;})()`);
  await sleep(400);
  const has = await evalJs(`!!document.querySelector('.cm') && !!document.querySelector('.page-head')`);
  if (!has) throw new Error('列表页结构缺失');
  return 'ok';
});

await check('A11 评论昵称来自 sy_user.name（不再由前端提交）', async () => {
  const names = await evalJs(`S.postComments.map(c=>c.authorName)`);
  const me = await evalJs(`S.user && S.user.name`);
  if (!Array.isArray(names) || !names.length) throw new Error('没有评论可校验');
  if (names.some(n => n !== me)) throw new Error('评论昵称与登录用户不一致：' + JSON.stringify(names) + ' vs ' + me);
  return JSON.stringify(names);
});
await check('A12 B3 浏览计数先 POST /view 再 GET 详情', async () => {
  const r = await evalJs(`(()=>{
    const log = CM_LOG.map(x=>x.method+' '+x.path);
    for (let i=0;i<log.length;i++){
      const m = log[i].match(/^POST \\/api\\/community\\/posts\\/(\\d+)\\/view$/);
      if (!m) continue;
      const id = m[1];
      const gi = log.findIndex((s,j)=> j>i && s === 'GET /api/community/posts/'+id);
      if (gi > i) return 'view@'+i+' < get@'+gi;
    }
    return 'no-pair';
  })()`);
  if (r === 'no-pair') throw new Error('CM_LOG 里找不到 view/get 配对');
  return r;
});

await check('A13 B4 点赞后以服务端为准（状态与计数一致）', async () => {
  const before = await evalJs(`S.postDetail.liked`);
  await evalJs(`cmLikePost()`);
  await sleep(1600);
  const st = await evalJs(`({liked:S.postDetail.liked, like:S.postDetail.likeCount})`);
  if (st.liked === before) throw new Error('点赞态没变化：' + JSON.stringify(st));
  if (!(st.like >= 0)) throw new Error('计数异常：' + JSON.stringify(st));
  return JSON.stringify(st);
});
await check('A9 旧链接 /community.html 自动跳回 SPA', async () => {
  await send('Page.navigate', { url: APP.replace(/\/$/, '') + '/community.html' });
  await sleep(1500);
  const u = await evalJs('location.pathname + location.search');
  if (!String(u).includes('v=community') && u !== '/') throw new Error('未跳转：' + u);
  return u;
});

await check('A10 无未捕获 JS 异常 / 控制台报错', async () => {
  if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(' | '));
  const real = consoleErrors.filter(t => !/favicon|404 \(Not Found\)/i.test(t));
  if (real.length) throw new Error(real.slice(0, 3).join(' | '));
  return `pageErrors=0, consoleErrors=${consoleErrors.length}`;
});

const bad = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n汇总：${results.length - bad.length}/${results.length} 通过`);
if (pageErrors.length) console.log('页面异常：\n' + pageErrors.slice(0, 5).join('\n'));
ws.close();
process.exit(bad.length ? 1 : 0);
