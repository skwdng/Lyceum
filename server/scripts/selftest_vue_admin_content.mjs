// 内容管理台自检：帖子搜索 / 详情 / 评论树 / 屏蔽 / 恢复 / 评论定位
//
// 用法：node server/scripts/selftest_vue_admin_content.mjs [cdpPort] [baseUrl]
//
// 说明：管理台的 `sy_admin_jwt` 用开发密钥现签（与 selftest_vue_batch3b.mjs 的 adminToken() 同款），
// 后端仍然校验签名与 typ=ADMIN，不存在绕过。
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

// ---------- 接口辅助（造数 + 断言） ----------
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

const stamp = Date.now().toString().slice(-6);
const acc = 'sc' + stamp;
await call('POST', '/api/auth/register', { account: acc, password: 'abc12345' });
const user = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
const uid = (await call('GET', '/api/auth/me', undefined, user)).body.id;
const post = await call('POST', '/api/community/posts',
  { type: 'HELP', title: `自检帖 ${stamp}`, body: '这是内容管理自检用的帖子正文，长度需要超过门槛才算合规。' }, user);
const postId = post.body.postId;
const c1 = await call('POST', `/api/community/posts/${postId}/comments`, { body: `自检楼 ${stamp}` }, user);
const rootId = c1.body.commentId;
const c2 = await call('POST', `/api/community/posts/${postId}/comments`,
  { body: `自检楼中楼 ${stamp}`, replyObjectType: 'COMMENT', replyObjectCommentId: rootId }, user);
const replyId = c2.body.commentId;

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

/** 清 localStorage → 注入管理员令牌 → 进入指定页面 → 等应用挂载完成 */
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

// 自检里要处理"屏蔽理由"输入：ModerationBar 用的是 window.prompt，无头浏览器会直接返回 null，
// 这里把它替换成固定值，让流程能走完（真实使用里是人工输入）。
const PATCH_PROMPT = `window.prompt = () => '自检理由'; window.confirm = () => true; true`;

await check('A1 帖子管理：关键词搜索命中刚发的帖子', async () => {
  await openAdmin('admin/content/posts');
  await waitFor(`!!document.querySelector('[data-panel="content-posts"] .cp-input')`, '筛选栏');
  await ev(`(()=>{const i=document.querySelector('[data-panel="content-posts"] .cp-input');
    i.value='自检帖 ${stamp}'; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="content-posts"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await waitFor(`document.querySelectorAll('[data-panel="content-posts"] tbody tr').length >= 1`, '搜索结果');
  const title = await ev(`document.querySelector('[data-panel="content-posts"] .cp-link').textContent.trim()`);
  if (!title.includes('自检帖 ' + stamp)) throw new Error('搜到的不是目标帖：' + title);
  return title;
});

await check('A2 详情抽屉：正文 + 评论树（楼 + 楼中楼）', async () => {
  await ev(`document.querySelector('[data-panel="content-posts"] .cp-link').click(); true`);
  await waitFor(`!!document.querySelector('.modal .pd-title')`, '抽屉打开');
  await waitFor(`document.querySelectorAll('.modal .ct-item').length >= 2`, '评论树渲染');
  const st = await ev(`(()=>{const m=document.querySelector('.modal');return {
    title: m.querySelector('.pd-title').textContent.trim(),
    roots: m.querySelectorAll('.ct-root').length,
    replies: m.querySelectorAll('.ct-reply').length,
    hasBody: m.querySelector('.pd-body').textContent.includes('内容管理自检')};})()`);
  if (st.roots !== 1 || st.replies !== 1) throw new Error('层级不对：' + JSON.stringify(st));
  return `楼 ${st.roots} / 楼中楼 ${st.replies}`;
});

await check('A3 抽屉内屏蔽评论 → 显示「已屏蔽」', async () => {
  await ev(PATCH_PROMPT);
  await ev(`(()=>{const root=document.querySelector('.modal .ct-root');
    [...root.querySelectorAll('.btn')].find(b=>b.textContent.trim()==='屏蔽').click(); return true;})()`);
  await waitFor(`document.querySelector('.modal .ct-root').innerText.includes('已屏蔽')`, '已屏蔽标记', 15000);
  return 'ct-root 出现「已屏蔽」';
});

await check('A4 处理记录里出现 MANUAL 行，一键恢复后内容回来', async () => {
  const audits = await call('GET', '/api/admin/audit?page=1&size=20', undefined, ADMIN);
  const manual = (audits.body.items || []).find((a) => a.reportId === 0 && a.targetId === rootId);
  if (!manual) throw new Error('没找到 MANUAL 审计行');
  const restored = await call('POST', `/api/admin/audit/${manual.id}/restore`, {}, ADMIN);
  if (restored.status !== 204) throw new Error('恢复失败 HTTP ' + restored.status);
  const tree = await call('GET', `/api/admin/posts/${postId}/comments`, undefined, ADMIN);
  const root = (tree.body.items || []).find((c) => c.id === rootId);
  if (!root || root.hidden) throw new Error('恢复后仍处于屏蔽状态');
  return `audit#${manual.id} → 已恢复`;
});

await check('A5 评论管理：跨帖搜索 + 点「查看所在帖子」定位并高亮', async () => {
  await openAdmin('admin/content/comments');
  await waitFor(`!!document.querySelector('[data-panel="content-comments"] .cc-input')`, '评论筛选栏');
  await ev(`(()=>{const i=document.querySelector('[data-panel="content-comments"] .cc-input');
    i.value='自检楼中楼 ${stamp}'; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="content-comments"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await waitFor(`document.querySelectorAll('[data-panel="content-comments"] tbody tr').length >= 1`, '评论搜索结果');
  const post = await ev(`(()=>{const links=[...document.querySelectorAll('[data-panel="content-comments"] tbody .cc-link')];
    const l = links.find((a) => a.textContent.trim().startsWith('#')); return l ? l.textContent.trim() : 'none';})()`);
  if (!post.includes('#' + postId)) throw new Error('所在帖子列不对：' + post);

  await ev(`document.querySelector('[data-panel="content-comments"] .cc-ops .btn').click(); true`);
  await waitFor(`location.hash.includes('post=${postId}')`, '跳转到帖子管理', 15000);
  await waitFor(`!!document.querySelector('.modal .pd-title')`, '跳转后抽屉打开', 15000);
  await waitFor(`!!document.querySelector('#c-${replyId}.is-hl')`, '目标楼层高亮', 15000);
  return `hash=${await ev('location.hash')} · 高亮 #c-${replyId}`;
});

await check('A6 帖子管理：按作者筛选只出该作者的帖子', async () => {
  await openAdmin('admin/content/posts');
  await waitFor(`!!document.querySelector('[data-panel="content-posts"] .cp-input')`, '筛选栏');
  await ev(`(()=>{const inputs=[...document.querySelectorAll('[data-panel="content-posts"] .cp-input')];
    const i=inputs.find(x=>x.placeholder && x.placeholder.includes('作者'));
    i.value=${JSON.stringify(uid)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="content-posts"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await sleep(1200);
  const authors = await ev(`[...document.querySelectorAll('[data-panel="content-posts"] tbody tr')]
      .map(tr=>tr.querySelectorAll('td')[3].innerText.trim())`);
  if (!authors.length) throw new Error('按作者筛选后没有任何行');
  const wrong = authors.filter((a) => a !== uid);
  if (wrong.length) throw new Error('混进了别的作者：' + JSON.stringify(wrong));
  return `${authors.length} 行，全部是 ${uid}`;
});

await check('A7 举报处置老路径不变：REPORT 来源仍然结案并留痕', async () => {
  // 举报得由**别人**发起（自己不能举报自己），所以现注册一个举报人
  const repAcc = 'sr' + stamp;
  await call('POST', '/api/auth/register', { account: repAcc, password: 'abc12345' });
  const reporter = (await call('POST', '/api/auth/login', { account: repAcc, password: 'abc12345' })).body.token;
  const victim = await call('POST', '/api/community/reports',
    { targetType: 'POST', targetId: postId, reason: 'SPAM', detail: '自检举报' }, reporter);
  if (victim.status >= 300) throw new Error('举报创建失败 HTTP ' + victim.status + ' ' + JSON.stringify(victim.body));

  const queue = await call('GET', '/api/admin/reports?status=PENDING&page=1&size=20', undefined, ADMIN);
  const group = (queue.body.items || []).find((g) => Number(g.targetId) === Number(postId) && g.targetType === 'POST');
  if (!group) throw new Error('管理端 PENDING 队列里没有这条举报');

  const done = await call('POST', `/api/admin/reports/${group.firstReportId}/resolve`,
    { action: 'DELETE', note: '自检老路径' }, ADMIN);
  if (done.status !== 204 && done.status !== 200) throw new Error('处置失败 HTTP ' + done.status + ' ' + JSON.stringify(done.body));

  const after = await call('GET', '/api/admin/reports?status=ACCEPTED&page=1&size=50', undefined, ADMIN);
  const accepted = (after.body.items || []).some((g) => g.targetId === postId);
  if (!accepted) throw new Error('举报没有变成 ACCEPTED（老路径被改坏了）');

  const audits = await call('GET', '/api/admin/audit?page=1&size=20', undefined, ADMIN);
  const row = (audits.body.items || []).find((a) => a.reportId > 0 && a.targetId === postId);
  if (!row) throw new Error('处理记录里没有 REPORT 来源的行（reportId>0）');
  return `report#${row.reportId} · verdict=${row.verdict} · 举报 ACCEPTED`;
});

await check('A8 处理记录页分得出「内容管理」与「举报」两种来源', async () => {
  await openAdmin('admin/audit');
  await waitFor(`document.querySelectorAll('[data-panel="audit"] table tbody tr').length > 0`, '处理记录行', 20000);
  const st = await ev(`(()=>{const p=document.querySelector('[data-panel="audit"]');
    const tags=[...p.querySelectorAll('tbody .tag')].map(t=>t.textContent.trim());
    return {head:[...p.querySelectorAll('th')].map(x=>x.textContent.trim()),
            manual: tags.filter(t=>t==='内容管理').length,
            report: tags.filter(t=>t==='举报').length};})()`);
  if (!st.head.includes('来源')) throw new Error('表头没有「来源」列：' + JSON.stringify(st.head));
  if (!st.manual) throw new Error('没有一条「内容管理」来源的记录（MANUAL 没体现）');
  if (!st.report) throw new Error('没有一条「举报」来源的记录（REPORT 没体现）');
  return `来源列：内容管理 ${st.manual} 条 / 举报 ${st.report} 条`;
});

await check('A9 长列表：1280x720 下页面可滚到底且分页栏可见（回归 2026-11-12 显示不全问题）', async () => {
  // 这条守的是两个坑：① 主站全局 .panel 的 max-height:88vh 串到管理台导致内容被裁且无滑条；
  // ② 内容区自成滚动容器、滚动条看不见。改成整页滚动 + panel max-height:none 之后，必须能滚到底。
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  try {
    await openAdmin('admin/topics');            // 12 道题，必然超过 720 高
    await waitFor(`document.querySelectorAll('[data-panel="topic-review"] tbody tr').length > 3`, '辩题行');
    const st = await ev(`(async()=>{
      const panel = document.querySelector('[data-panel="topic-review"] .panel');
      const scrollable = document.documentElement.scrollHeight - innerHeight > 8;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise(r=>setTimeout(r,150));
      const el = document.querySelector('[data-panel="topic-review"] .tr-page');
      const r = el ? el.getBoundingClientRect() : null;
      return { scrollable, maxH: getComputedStyle(panel).maxHeight,
               atBottom: scrollY + innerHeight >= document.documentElement.scrollHeight - 2,
               pagerVisible: r ? (r.top < innerHeight && r.bottom > 0) : false };})()`);
    if (st.maxH !== 'none') throw new Error('面板仍被 max-height 限制：' + st.maxH);
    if (!st.scrollable) throw new Error('内容超出但页面不可滚（滚动条/裁切问题回来了）');
    if (!st.atBottom) throw new Error('滚不到底');
    if (!st.pagerVisible) throw new Error('滚到底后分页栏仍不可见');
    return `maxHeight=${st.maxH} · 可滚到底 · 分页栏可见`;
  } finally {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  }
});

await check('A9 评论管理：作者 ID + 日期筛选生效', async () => {
  await openAdmin('admin/content/comments');
  await waitFor(`document.querySelectorAll('[data-panel="content-comments"] .cc-input').length >= 4`, '评论筛选条');

  // 作者筛选
  await ev(`(()=>{const p=document.querySelector('[data-panel="content-comments"]');
    const a=[...p.querySelectorAll('.cc-bar .cc-input')].find(x=>x.placeholder&&x.placeholder.includes('作者'));
    a.value=${JSON.stringify(uid)}; a.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="content-comments"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await sleep(1300);
  const authors = await ev(`[...document.querySelectorAll('[data-panel="content-comments"] tbody tr')]
      .map(tr=>tr.querySelectorAll('td')[3].innerText.trim()).filter(Boolean)`);
  if (!authors.length) throw new Error('按作者筛选后没有数据');
  if (authors.some((a) => a !== uid)) throw new Error('混进了别的作者：' + JSON.stringify(authors));

  // 日期筛选：把「起始日期」设成明天 -> 必然 0 条
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await ev(`(()=>{const p=document.querySelector('[data-panel="content-comments"]');
    const d=[...p.querySelectorAll('.cc-bar input[type="date"]')][0];
    d.value=${JSON.stringify(tomorrow)}; d.dispatchEvent(new Event('input',{bubbles:true}));
    d.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
  await sleep(1300);
  const emptyText = await ev(`(document.querySelector('[data-panel="content-comments"]')||{innerText:''}).innerText.includes('没有符合条件')`);
  if (!emptyText) throw new Error('起始日期设成明天之后仍显示数据（日期筛选没生效）');
  return `作者筛选 ${authors.length} 行全为 ${uid} · 起始日期=明天 → 空态`;
});

await check('A10 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
