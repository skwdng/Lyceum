// 用户违规浮窗自检：浮窗内容 + 浮窗内禁言后状态同步 + 两处入口共用同一组件
//
// 用法：node server/scripts/selftest_vue_admin_userpop.mjs [cdpPort] [baseUrl]
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

// ---------- 造数：一个用户 + 一条帖子 + 一条评论 ----------
const stamp = Date.now().toString().slice(-6);
const acc = 'up' + stamp;
await call('POST', '/api/auth/register', { account: acc, password: 'abc12345' });
const user = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
const me = await call('GET', '/api/auth/me', undefined, user);
const uid = me.body.id;
const post = await call('POST', '/api/community/posts',
  { type: 'CHAT', title: `浮窗自检帖 ${stamp}`, body: '这是用户浮窗自检用的帖子正文，需要足够长度。' }, user);
await call('POST', `/api/community/posts/${post.body.postId}/comments`, { body: '浮窗自检评论' }, user);

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

const ADMIN = adminToken();

async function openAdmin(hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/login' });
  await sleep(1200);
  await ev('localStorage.clear(); sessionStorage.clear(); true');
  await ev(`localStorage.setItem('sy_admin_jwt', ${JSON.stringify(ADMIN)});
            localStorage.setItem('sy_admin_collapsed','0'); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(2000);
  await waitFor(`!!document.querySelector('.adm-nav')`, '管理台挂载', 20000);
}

await check('B1 用户管理页点用户名 → 浮窗打开且含统计与违规历史', async () => {
  await openAdmin('admin/users?q=' + acc);
  await waitFor(`document.querySelectorAll('.u-link').length > 0`, '用户行渲染', 20000);

  // 直接在列表里找目标用户那一行（不依赖搜索框，避免选错输入框）
  await ev(`(()=>{const tr=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(acc)}));
    if(!tr) throw new Error('列表里没有目标用户');
    tr.querySelector('.u-link').click(); return true;})()`);
  await waitFor(`!!document.querySelector('.upop')`, '浮窗打开', 15000);
  await waitFor(`!!document.querySelector('.upop-stats')`, '浮窗数据加载');

  const st = await ev(`(()=>{const p=document.querySelector('.upop');return {
    head: p.querySelector('.upop-head').innerText.replace(/\\s+/g,' '),
    stats: p.querySelector('.upop-stats').innerText.replace(/\\s+/g,' '),
    subs: [...p.querySelectorAll('.upop-sub')].map(s=>s.textContent.trim()),
    foot: [...p.querySelectorAll('.upop-foot .btn')].map(b=>b.textContent.trim())};})()`);
  if (!st.head.includes(uid)) throw new Error('浮窗不是目标用户：' + st.head);
  if (!st.stats.includes('帖子 1')) throw new Error('统计不对：' + st.stats);
  if (!st.subs.includes('禁言记录') || !st.subs.includes('被处置的内容')) throw new Error('缺少违规历史区块：' + st.subs);
  return `${st.head} · ${st.stats} · 按钮 ${st.foot.join('/')}`;
});

await check('B2 浮窗内点「禁言」→ 头部变「禁言中」，接口状态同步', async () => {
  await ev(`(()=>{const p=document.querySelector('.upop');
    [...p.querySelectorAll('.upop-foot .btn')].find(b=>b.textContent.trim()==='禁言').click(); return true;})()`);
  await waitFor(`document.querySelector('.upop-head').innerText.includes('禁言中')`, '浮窗头部状态', 15000);

  const detail = await call('GET', `/api/admin/users/${uid}/profile`, undefined, ADMIN);
  if (!detail.body.moderation.muted) throw new Error('接口 muted 仍为 false');
  const banned = (detail.body.moderation.banHistory || []).some((b) => b.active);
  if (!banned) throw new Error('禁言记录里没有生效中的一条');
  return '头部=禁言中 · profile.muted=true · banHistory 有生效记录';
});

await check('B3 关闭浮窗后用户列表状态同步（社区禁言列不再是「未禁言」）', async () => {
  await ev(`document.querySelector('.upop-x').click(); true`);
  await waitFor(`!document.querySelector('.upop')`, '浮窗关闭');

  // 重新载入用户管理，确认列表里的「社区禁言」列已经变了
  await openAdmin('admin/users?q=' + acc);
  await waitFor(`document.querySelectorAll('tbody tr').length > 0`, '用户列表', 20000);
  const rowText = await ev(`(()=>{const tr=[...document.querySelectorAll('tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify(acc)})); return tr ? tr.innerText.replace(/\\s+/g,' ') : 'none';})()`);
  if (rowText.includes('未禁言')) throw new Error('列表行仍显示「未禁言」：' + rowText);
  if (!/禁言至|禁言中/.test(rowText)) throw new Error('列表行的社区禁言列没同步：' + rowText);
  return rowText.slice(0, 70);
});

await check('B4 第二处入口：帖子管理页点作者名，弹出同一个浮窗', async () => {
  await openAdmin('admin/content/posts');
  await waitFor(`document.querySelectorAll('[data-panel="content-posts"] tbody tr').length >= 1`, '帖子列表');
  // 作者列是第 4 个 td 里的 cp-link
  await ev(`(()=>{const tr=[...document.querySelectorAll('[data-panel="content-posts"] tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify(acc)}));
    if(!tr) throw new Error('列表里没有该用户的帖子');
    tr.querySelectorAll('.cp-link')[1].click(); return true;})()`);
  await waitFor(`!!document.querySelector('.upop')`, '浮窗打开', 15000);
  await waitFor(`!!document.querySelector('.upop-stats')`, '浮窗数据加载');
  const head = await ev(`document.querySelector('.upop-head').innerText.replace(/\\s+/g,' ')`);
  if (!head.includes(uid)) throw new Error('浮窗里的用户不是目标用户：' + head);
  return head;
});

await check('B5 全站入口：评论管理 / 评论树 / 视频作者 / 处理记录对象 / 举报作者 都能点开浮窗', async () => {
  // 先把缺的数据补齐：一条举报（举报人 + 作者）和一条视频
  const repAcc = 'rp' + stamp;
  await call('POST', '/api/auth/register', { account: repAcc, password: 'abc12345' });
  const reporter = (await call('POST', '/api/auth/login', { account: repAcc, password: 'abc12345' })).body.token;
  await call('POST', '/api/community/reports',
    { targetType: 'POST', targetId: post.body.postId, reason: 'SPAM', detail: '自检' }, reporter);
  await call('POST', '/api/video/videos',
    { title: `浮窗自检视频 ${stamp}`, description: '自检', url: 'http://127.0.0.1:8080/media/demo.mp4', poster: '', topic: 'x', segment: 'OPEN' }, user);
  // 处理记录里要有用户类行（封禁 → 解封，留两条）
  await call('POST', `/api/admin/users/${uid}/status`, { status: 0, reason: '自检封禁' }, ADMIN);
  await call('POST', `/api/admin/users/${uid}/status`, { status: 1, reason: '自检解封' }, ADMIN);

  const opened = [];

  // 1) 评论管理
  await openAdmin('admin/content/comments');
  await waitFor(`!!document.querySelector('[data-panel="content-comments"] tbody .cc-author')`, '评论作者链接', 20000);
  await ev(`document.querySelector('[data-panel="content-comments"] tbody .cc-author').click(); true`);
  await waitFor(`!!document.querySelector('.upop')`, '评论管理浮窗', 15000);
  opened.push('评论管理');
  await ev(`document.querySelector('.upop-x').click(); true`);
  await sleep(300);

  // 2) 帖子详情抽屉里的评论树作者
  await openAdmin('admin/content/posts');
  await waitFor(`document.querySelectorAll('[data-panel="content-posts"] tbody tr').length > 0`, '帖子列表', 20000);
  await ev(`(()=>{const tr=[...document.querySelectorAll('[data-panel="content-posts"] tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify('浮窗自检帖 ' + stamp)}));
    if(!tr) throw new Error('找不到自检帖'); tr.querySelectorAll('.cp-link')[0].click(); return true;})()`);
  await waitFor(`!!document.querySelector('.modal .ct-author')`, '抽屉评论树', 20000);
  await ev(`document.querySelector('.modal .ct-author').click(); true`);
  await waitFor(`!!document.querySelector('.upop')`, '评论树浮窗', 15000);
  opened.push('评论树');
  await ev(`document.querySelector('.upop-x').click(); true`);
  await sleep(200);
  await ev(`(()=>{const b=[...document.querySelectorAll('.modal .foot .btn')].find(x=>x.textContent.trim()==='关闭'); if(b) b.click(); return true;})()`);
  await sleep(400);

  // 3) 视频复核作者
  await openAdmin('admin/video-audit');
  await waitFor(`document.querySelectorAll('[data-panel="video-audit"] tbody tr .va-link').length >= 2`, '视频行', 20000);
  await ev(`(()=>{const tr=document.querySelector('[data-panel="video-audit"] tbody tr');
    tr.querySelectorAll('.va-link')[1].click(); return true;})()`);
  await waitFor(`!!document.querySelector('.upop')`, '视频作者浮窗', 15000);
  opened.push('视频作者');
  await ev(`document.querySelector('.upop-x').click(); true`);
  await sleep(300);

  // 4) 处理记录：对象列的用户 id
  await openAdmin('admin/audit');
  await waitFor(`!!document.querySelector('[data-panel="audit"] .au-link')`, '处理记录用户链接', 20000);
  await ev(`document.querySelector('[data-panel="audit"] .au-link').click(); true`);
  await waitFor(`!!document.querySelector('.upop')`, '处理记录浮窗', 15000);
  opened.push('处理记录');
  await ev(`document.querySelector('.upop-x').click(); true`);
  await sleep(300);

  // 5) 举报处理：作者
  await openAdmin('admin/reports');
  await waitFor(`!!document.querySelector('.rp-link')`, '举报作者链接', 20000);
  await ev(`document.querySelector('.rp-link').click(); true`);
  await waitFor(`!!document.querySelector('.upop')`, '举报作者浮窗', 15000);
  opened.push('举报作者');
  await ev(`document.querySelector('.upop-x').click(); true`);

  return opened.join(' / ') + ' 五个入口全部弹出浮窗';
});

await check('B6 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
