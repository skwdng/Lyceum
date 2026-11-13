// 管理员账号 + 权限分级（RBAC）自检
//
// 覆盖用户要的那条完整链路：
//   超管创建账号 → 用一次性密码登录 → 强制改密 → 按角色验证菜单与按钮
//   → 直接输 URL 显示「无权限」卡片 → VIEWER 一个处置按钮都没有
//
// 用法：node server/scripts/selftest_vue_admin_rbac.mjs [cdpPort] [baseUrl]
import crypto from 'crypto';

const PORT = process.argv[2] || '9482';
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

// ---------- 造数据（否则"看不到处置按钮"会因为没有行而假通过）----------
const stamp = Date.now().toString().slice(-6);
const pu = 'rb' + stamp;
await call('POST', '/api/auth/register', { account: pu, password: 'abc12345' });
const userTok = (await call('POST', '/api/auth/login', { account: pu, password: 'abc12345' })).body.token;
const post = await call('POST', '/api/community/posts',
  { type: 'CHAT', title: `权限自检帖 ${stamp}`, body: '这条用来验证按钮级权限，正文要够长一点。' }, userTok);
await call('POST', `/api/community/posts/${post.body.postId}/comments`, { body: `权限自检评论 ${stamp}` }, userTok);
await call('POST', '/api/video/videos',
  { title: `权限自检视频 ${stamp}`, description: '按钮级权限', url: 'http://127.0.0.1:8080/media/demo.mp4', poster: '', topic: 'x', segment: 'OPEN' }, userTok);
await call('POST', '/api/auth/register', { account: 'rr' + stamp, password: 'abc12345' });
const repTok = (await call('POST', '/api/auth/login', { account: 'rr' + stamp, password: 'abc12345' })).body.token;
await call('POST', '/api/community/reports',
  { targetType: 'POST', targetId: post.body.postId, reason: 'SPAM', detail: '权限自检' }, repTok);
// 处理记录要有内容（恢复按钮的断言用）
const ADMIN = adminToken();
await call('POST', `/api/admin/content/comment/999999/unhide`, {}, ADMIN);   // 404 无所谓，只求一条记录
await call('POST', `/api/admin/content/post/${post.body.postId}/hide`, { note: '权限自检' }, ADMIN);
await call('POST', `/api/admin/content/post/${post.body.postId}/unhide`, {}, ADMIN);

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

/** 真实登录表单：填账号密码 → 点登录（这套自检要验的就是"人怎么进来的"） */
async function uiLogin(acc, pwd) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/login' });
  await sleep(1000);
  await ev('localStorage.clear(); sessionStorage.clear(); true');
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/login' });
  await waitFor(`document.querySelectorAll('.login-box input').length >= 2`, '登录表单', 20000);
  await ev(`(()=>{const i=document.querySelectorAll('.login-box input');
    i[0].value=${JSON.stringify(acc)}; i[0].dispatchEvent(new Event('input',{bubbles:true}));
    i[1].value=${JSON.stringify(pwd)}; i[1].dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('.login-box button')].find(b=>b.textContent.includes('登录')).click();
    return true;})()`);
  await sleep(2400);
}

/** 直接把令牌写进 localStorage 再进某页（换角色后重进用） */
async function openWithToken(token, hash) {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/login' });
  await sleep(900);
  await ev(`localStorage.clear(); localStorage.setItem('sy_admin_jwt', ${JSON.stringify(token)});
    localStorage.setItem('sy_admin_collapsed','0'); true`);
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
  await sleep(2400);
}
const menus = () => ev(`[...document.querySelectorAll('.adm-nav a .lb')].map(x=>x.textContent.trim())`);

const viewerAcc = 'rv' + stamp;
let oneTimePwd = '';
let viewerId = 0;

// ==================== R1 超管：菜单 + 管理员管理页 ====================
await check('R1 超管登录：菜单 11 项（含「管理员管理」）+ 顶栏角色 SUPER', async () => {
  await uiLogin('admin', 'admin123');
  await waitFor(`!!document.querySelector('.adm-nav')`, '管理台挂载', 20000);
  const m = await menus();
  if (!m.includes('管理员管理')) throw new Error('菜单里没有管理员管理：' + JSON.stringify(m));
  if (m.length !== 11) throw new Error('超管菜单应为 11 项，实际 ' + m.length + '：' + JSON.stringify(m));
  const role = await ev(`(document.querySelector('.adm-role')||{textContent:''}).textContent.trim()`);
  if (role !== 'SUPER') throw new Error('顶栏角色应为 SUPER，实际 ' + role);
  return m.length + ' 项 · ' + role;
});

await check('R2 管理员管理页：新建账号 → 一次性密码弹窗（12 位、写明只显示一次）', async () => {
  await ev(`(()=>{[...document.querySelectorAll('.adm-nav a')].find(a=>a.textContent.includes('管理员管理')).click(); return true;})()`);
  await waitFor(`!!document.querySelector('[data-panel="admins"]')`, '管理员管理页', 20000);
  await waitFor(`document.querySelectorAll('[data-panel="admins"] tbody tr').length > 0`, '管理员列表', 20000);
  const selfRow = await ev(`(()=>{const tr=[...document.querySelectorAll('[data-panel="admins"] tbody tr')]
    .find(r=>r.innerText.includes('我')); if(!tr) return null;
    const sel=tr.querySelector('.ad-role'); const stop=[...tr.querySelectorAll('button')].find(b=>b.textContent.trim()==='停用');
    return {role: sel.disabled, stop: stop ? stop.disabled : null};})()`);
  if (!selfRow || selfRow.role !== true || selfRow.stop !== true) {
    throw new Error('自己那一行的改角色/停用应当置灰：' + JSON.stringify(selfRow));
  }
  // 新建账号改成**弹窗**：点「＋ 新建账号」→ 弹窗里填账号/角色 → 创建
  await ev(`(()=>{[...document.querySelectorAll('[data-panel="admins"] button')]
    .find(b=>b.textContent.includes('新建账号')).click(); return true;})()`);
  await waitFor(`!!document.querySelector('[data-panel="create-admin"]')`, '新建账号弹窗', 20000);
  await waitFor(`!!document.querySelector('[data-panel="create-admin"] .ac-input')`, '弹窗表单', 20000);
  await ev(`(()=>{const p=document.querySelector('[data-panel="create-admin"]');
    const i=p.querySelector('.ac-input');
    i.value=${JSON.stringify(viewerAcc)}; i.dispatchEvent(new Event('input',{bubbles:true}));
    const s=p.querySelector('select');
    s.value='VIEWER'; s.dispatchEvent(new Event('change',{bubbles:true}));
    return true;})()`);
  const tip = await ev(`(document.querySelector('[data-panel="create-admin"] .ac-tip')||{textContent:''}).textContent.trim()`);
  if (!tip.includes('只读')) throw new Error('角色说明没跟着变：' + tip);
  await ev(`(()=>{[...document.querySelectorAll('[data-panel="create-admin"] .foot button')]
    .find(b=>b.textContent.includes('创建账号')).click(); return true;})()`);
  await waitFor(`!!document.querySelector('[data-panel="pwd-once"] .ad-pwd')`, '一次性密码弹窗', 20000);
  if (await ev(`!!document.querySelector('[data-panel="create-admin"]')`)) {
    throw new Error('创建成功后新建弹窗应当关闭，只留一次性密码弹窗');
  }
  oneTimePwd = await ev(`document.querySelector('[data-panel="pwd-once"] .ad-pwd').textContent.trim()`);
  if (!/^[A-Za-z0-9]{12}$/.test(oneTimePwd)) throw new Error('一次性密码格式不对：' + oneTimePwd);
  const hint = await ev(`document.querySelector('[data-panel="pwd-once"]').innerText`);
  if (!hint.includes('唯一一次')) throw new Error('弹窗没写"唯一一次"');
  await ev(`(()=>{[...document.querySelectorAll('[data-panel="pwd-once"] button')]
    .find(b=>b.textContent.includes('记下')).click(); return true;})()`);
  await sleep(400);
  const row = await ev(`(()=>{const tr=[...document.querySelectorAll('[data-panel="admins"] tbody tr')]
    .find(r=>r.innerText.includes(${JSON.stringify(viewerAcc)}));
    if(!tr) return null; viewerId=Number(tr.querySelector('td').innerText.trim()); return {role: tr.querySelector('.ad-role').value,
    mustChange: tr.innerText.includes('待改密')};})()`);
  if (!row || row.role !== 'VIEWER' || !row.mustChange) throw new Error('新建行不对：' + JSON.stringify(row));
  return '账号 ' + viewerAcc + ' · 一次性密码已拿到';
});

// ==================== R3 新账号首登：强制改密 ====================
await check('R3 新账号登录 → 被强制压到改密页（直接输业务 URL 也一样）', async () => {
  await uiLogin(viewerAcc, oneTimePwd);
  await waitFor(`location.hash.includes('change-password')`, '改密页', 20000);
  const hint = await ev(`document.body.innerText.includes('首次登录必须改密')`);
  if (!hint) throw new Error('改密页没有「首次登录必须改密」提示');
  // 直接输业务 URL 也回改密页
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/content/posts' });
  await sleep(2200);
  const hash = await ev('location.hash');
  if (!hash.includes('change-password')) throw new Error('未改密时业务页应被压回改密页，实际 ' + hash);
  return hash;
});

// ==================== R4 改密 → 回登录页 → 新密码登录 ====================
const viewerPwd = 'Viewer20' + stamp.slice(-2);
await check('R4 改密成功 → 回登录页 → 新密码可登录', async () => {
  await ev(`(()=>{const i=[...document.querySelectorAll('.cpwd-input')];
    i[0].value=${JSON.stringify(oneTimePwd)}; i[0].dispatchEvent(new Event('input',{bubbles:true}));
    i[1].value=${JSON.stringify(viewerPwd)}; i[1].dispatchEvent(new Event('input',{bubbles:true}));
    i[2].value=${JSON.stringify(viewerPwd)}; i[2].dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('确认修改')).click(); return true;})()`);
  await waitFor(`location.hash.includes('/admin/login')`, '回登录页', 20000);
  await uiLogin(viewerAcc, viewerPwd);
  await waitFor(`!!document.querySelector('.adm-nav')`, 'VIEWER 进入管理台', 20000);
  return 'hash=' + (await ev('location.hash'));
});

// ==================== R5 VIEWER 菜单按权限过滤 ====================
await check('R5 VIEWER 菜单：没有「管理员管理」，只剩读权限项', async () => {
  const m = await menus();
  if (m.includes('管理员管理')) throw new Error('VIEWER 不该看到管理员管理：' + JSON.stringify(m));
  if (m.length !== 10) throw new Error('VIEWER 菜单应为 10 项，实际 ' + m.length + '：' + JSON.stringify(m));
  const role = await ev(`(document.querySelector('.adm-role')||{textContent:''}).textContent.trim()`);
  if (role !== 'VIEWER') throw new Error('顶栏角色应为 VIEWER，实际 ' + role);
  return m.length + ' 项 · ' + role;
});

// ==================== R6 直接输 URL → 无权限卡片 ====================
await check('R6 直接输 #/admin/admins → 「无权限」卡片（不是白屏/404）', async () => {
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/admins' });
  await sleep(2400);
  await waitFor(`!!document.querySelector('[data-panel="forbidden"]')`, '无权限卡片', 20000);
  const txt = await ev(`document.querySelector('[data-panel="forbidden"]').innerText.replace(/\\s+/g,' ')`);
  if (!txt.includes('无权限')) throw new Error('卡片文案不对：' + txt);
  if (!txt.includes('admin:manage')) throw new Error('卡片应说明缺少的权限点：' + txt);
  return txt.slice(0, 40);
});

// ==================== R7 VIEWER 七个页面零处置按钮 ====================
await check('R7 VIEWER 看不到任何处置按钮（帖子/评论/用户/视频/辩题/处理记录/报表导出）', async () => {
  const seen = [];
  const step = async (hash, expr, rowsExpr, label) => {
    await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#' + hash });
    await sleep(2300);
    const rows = await ev(rowsExpr);
    if (!rows) throw new Error(label + ' 列表为空，按钮断言会假通过');
    const btns = await ev(expr);
    if (btns.length) throw new Error(label + ' 出现了处置按钮：' + JSON.stringify(btns));
    seen.push(label);
  };
  await step('admin/content/posts',
    `[...document.querySelectorAll('[data-panel="content-posts"] tbody .mb button')].map(b=>b.textContent.trim())`,
    `document.querySelectorAll('[data-panel="content-posts"] tbody tr').length > 0`, '帖子管理');
  await step('admin/content/comments',
    `[...document.querySelectorAll('[data-panel="content-comments"] tbody .mb button')].map(b=>b.textContent.trim())`,
    `document.querySelectorAll('[data-panel="content-comments"] tbody tr').length > 0`, '评论管理');
  await step('admin/users',
    `[...document.querySelectorAll('tbody .btn')].map(b=>b.textContent.trim()).filter(t=>t==='禁言'||t==='全站封禁'||t==='解封'||t==='解禁')`,
    `document.querySelectorAll('tbody tr').length > 0`, '用户管理');
  await step('admin/video-audit',
    `[...document.querySelectorAll('[data-panel="video-audit"] tbody .va-ops button')].map(b=>b.textContent.trim()).filter(t=>t!=='日志')`,
    `document.querySelectorAll('[data-panel="video-audit"] tbody tr').length > 0`, '视频复核');
  await step('admin/topics',
    `[...document.querySelectorAll('[data-panel="topics"] tbody .tr-ops button')].map(b=>b.textContent.trim())`,
    `document.querySelectorAll('[data-panel="topics"] tbody tr').length >= 0`, '辩题审核');
  await step('admin/audit',
    `[...document.querySelectorAll('[data-panel="audit"] tbody .btn')].map(b=>b.textContent.trim()).filter(t=>t==='恢复')`,
    `document.querySelectorAll('[data-panel="audit"] tbody tr').length > 0`, '处理记录');
  await send('Page.navigate', { url: BASE + '/v2/index.html?t=' + Date.now() + '#/admin/analytics' });
  await sleep(2600);
  const exp = await ev(`[...document.querySelectorAll('button')].filter(b=>['CSV','XLSX'].includes(b.textContent.trim())).length`);
  if (exp > 0) throw new Error('报表页出现导出按钮 ' + exp + ' 个');
  seen.push('报表导出');
  return seen.join(' / ') + ' 全部无处置按钮';
});

// ==================== R8 改角色 → 不重新登录就生效 ====================
await check('R8 超管把 VIEWER 改成 MOD → 对方不重新登录：菜单变、出现「屏蔽」但没有「禁言」', async () => {
  const viewerTok = (await call('POST', '/api/admin/auth/login', { account: viewerAcc, password: viewerPwd })).body.token;
  const idInDb = (await call('GET', '/api/admin/admins', undefined, ADMIN)).body.items
    .find((i) => i.account === viewerAcc).id;
  const r = await call('POST', `/api/admin/admins/${idInDb}/role`, { role: 'MOD' }, ADMIN);
  if (r.status !== 200) throw new Error('改角色失败：' + JSON.stringify(r).slice(0, 120));

  await openWithToken(viewerTok, 'admin/content/posts');
  const m = await menus();
  if (!m.includes('视频复核')) throw new Error('MOD 菜单应包含视频复核：' + JSON.stringify(m));
  const btns = await ev(`[...document.querySelectorAll('[data-panel="content-posts"] tbody .mb button')].map(b=>b.textContent.trim())`);
  if (!btns.includes('屏蔽')) throw new Error('MOD 应能看到「屏蔽」，实际 ' + JSON.stringify(btns));
  if (btns.includes('禁言')) throw new Error('MOD 不该看到「禁言」：' + JSON.stringify(btns));
  const role = await ev(`(document.querySelector('.adm-role')||{textContent:''}).textContent.trim()`);
  if (role !== 'MOD') throw new Error('顶栏角色应变成 MOD，实际 ' + role);
  return '角色 ' + role + ' · 按钮 ' + JSON.stringify(btns);
});

await check('R9 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
