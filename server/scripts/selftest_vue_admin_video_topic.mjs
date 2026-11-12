// 视频复核 + 辩题审核自检
//
// 用法：node server/scripts/selftest_vue_admin_video_topic.mjs [cdpPort] [baseUrl]
//
// 重点覆盖两条验收：
//   1) 非管理员调视频模块那 4 个审核接口一律 403（不能靠开开关蒙过去）
//   2) 辩题下架后前台题库看不到、管理端仍能查到并能改回通过
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

const stamp = Date.now().toString().slice(-6);
const acc = 'vt' + stamp;
await call('POST', '/api/auth/register', { account: acc, password: 'abc12345' });
const user = (await call('POST', '/api/auth/login', { account: acc, password: 'abc12345' })).body.token;
const pub = await call('POST', '/api/video/videos',
  { title: `自检视频 ${stamp}`, description: '视频复核自检', url: 'http://127.0.0.1:8080/media/demo.mp4', poster: '', topic: '自检', segment: 'OPEN' }, user);
const videoId = pub.body.videoId || pub.body.id;

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

// ==================== 一、视频：非管理员 403 ====================

await check('C1 非管理员调视频审核 4 个接口 → 全 403', async () => {
  const r1 = await call('GET', '/api/video/audit/queue', undefined, user);
  const r2 = await call('GET', `/api/video/audit/${videoId}/logs`, undefined, user);
  const r3 = await call('POST', `/api/video/audit/${videoId}/decide`, { decision: 'PASS' }, user);
  const r4 = await call('POST', `/api/video/audit/${videoId}/restore`, {}, user);
  const all = [r1, r2, r3, r4];
  const bad = all.filter((r) => r.status !== 403);
  if (bad.length) throw new Error('不是全部 403：' + all.map((r) => r.status).join(','));
  return 'queue/logs/decide/restore = 403,403,403,403（code=' + (r1.body.code || '?') + '）';
});

await check('C2 匿名调同样被拒（不能借开关放行）', async () => {
  const r = await call('GET', '/api/video/audit/queue');
  if (r.status !== 401 && r.status !== 403) throw new Error('HTTP ' + r.status);
  return 'HTTP ' + r.status;
});

await check('C3 管理员走 /api/admin/video-audit/**：队列 200 + 视频在队列里', async () => {
  const q = await call('GET', '/api/admin/video-audit/queue?status=ALL&size=20', undefined, ADMIN);
  if (q.status !== 200) throw new Error('HTTP ' + q.status);
  const found = (q.body.list || []).some((v) => v.id === videoId);
  if (!found) throw new Error('队列里没有刚发的视频 #' + videoId);
  return `list=${q.body.list.length} · stats=${JSON.stringify(q.body.stats)}`;
});

await check('C4 管理页面：视频复核页渲染出筛选与统计', async () => {
  await openAdmin('admin/video-audit');
  await waitFor(`!!document.querySelector('[data-panel="video-audit"]')`, '视频复核页', 20000);
  await waitFor(`!!document.querySelector('[data-panel="video-audit"] .tbl-x, [data-panel="video-audit"] .adm-error')`, '表格或错误态');
  const st = await ev(`(()=>{const p=document.querySelector('[data-panel="video-audit"]');
    return {tabs:[...p.querySelectorAll('.va-bar .btn')].map(b=>b.textContent.trim()),
            head: p.querySelector('h2').innerText.replace(/\\s+/g,' '),
            rows: p.querySelectorAll('tbody tr').length};})()`);
  if (!st.tabs.includes('待复核') || !st.tabs.includes('全部')) throw new Error('筛选按钮不全：' + st.tabs);
  return `${st.head} · 行 ${st.rows}`;
});

await check('C5 管理页面点「通过」→ 视频变 PASSED 且上架', async () => {
  // 切到「全部」再找目标视频
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="video-audit"] .va-bar .btn')]
      .find(x=>x.textContent.trim()==='全部'); b.click(); return true;})()`);
  await waitFor(`document.querySelectorAll('[data-panel="video-audit"] tbody tr').length > 0`, '全部列表', 15000);
  const clicked = await ev(`(()=>{const tr=[...document.querySelectorAll('[data-panel="video-audit"] tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify('自检视频 ' + stamp)}));
    if(!tr) return false;
    [...tr.querySelectorAll('.btn')].find(b=>b.textContent.trim()==='通过').click(); return true;})()`);
  if (!clicked) throw new Error('列表里找不到目标视频');
  await waitFor(`(()=>{const tr=[...document.querySelectorAll('[data-panel="video-audit"] tbody tr')]
      .find(r=>r.innerText.includes(${JSON.stringify('自检视频 ' + stamp)}));
    return tr && tr.innerText.includes('PASSED');})()`, '状态变 PASSED', 20000);
  const d = await call('GET', `/api/admin/video-audit/${videoId}/logs`, undefined, ADMIN);
  const human = (d.body.list || []).find((g) => g.stage === 'HUMAN');
  if (!human || !String(human.operator).startsWith('admin:')) throw new Error('审核日志操作人不对：' + JSON.stringify(human));
  return '行内 PASSED · 日志 operator=' + human.operator;
});

await check('C6 驳回后不上广场；恢复后回到驳回前的状态', async () => {
  // 先记下驳回前的状态（C5 刚把它置成 PASSED，所以这里预期 prev=PASSED）
  const before = await call('GET', `/api/admin/video-audit/${videoId}/logs`, undefined, ADMIN);
  const prev = before.body.video.audit_status;

  const rej = await call('POST', `/api/admin/video-audit/${videoId}/decide`, { decision: 'REJECT', reason: '自检驳回' }, ADMIN);
  if (rej.status !== 200 || rej.body.visible !== false) throw new Error('驳回失败 ' + JSON.stringify(rej.body));

  const feed1 = await call('GET', '/api/video/feed?size=50');
  const list1 = (feed1.body && (feed1.body.list || feed1.body.items)) || [];
  if (list1.some((v) => v.id === videoId)) throw new Error('驳回后视频还在广场里');

  // 恢复 = 撤销最近一次判定 -> 回到 prev 状态（不是"回队列"，回队列只发生在 prev 是 REVIEW/PENDING 时）
  const back = await call('POST', `/api/admin/video-audit/${videoId}/restore`, {}, ADMIN);
  if (back.status !== 200) throw new Error('恢复失败 ' + JSON.stringify(back.body));
  if (back.body.restoredTo !== prev) throw new Error(`恢复到的状态不对：${back.body.restoredTo} ≠ 驳回前 ${prev}`);

  const after = await call('GET', `/api/admin/video-audit/${videoId}/logs`, undefined, ADMIN);
  if (after.body.video.audit_status !== prev) throw new Error('恢复后 audit_status 没回去：' + after.body.video.audit_status);

  const feed2 = await call('GET', '/api/video/feed?size=50');
  const list2 = (feed2.body && (feed2.body.list || feed2.body.items)) || [];
  const onSquare = list2.some((v) => v.id === videoId);
  if (prev === 'PASSED' && !onSquare) throw new Error('恢复成 PASSED 后应该重新出现在广场');
  return `驳回→广场 ${list1.length} 条不含它 · 恢复→${prev}（广场可见=${onSquare}）`;
});

// ==================== 二、辩题：下架 → 前台消失 → 管理端仍可见 ====================

let topicId = null;

await check('D1 管理端题库列表（含 REJECT）200', async () => {
  const l = await call('GET', '/api/admin/topics?modStatus=ALL&page=1&size=5', undefined, ADMIN);
  if (l.status !== 200 || !l.body.total) throw new Error('HTTP ' + l.status + ' total=' + (l.body && l.body.total));
  topicId = l.body.items[0].id;
  return `total=${l.body.total} · 样本 ${topicId}`;
});

await check('D2 下架一题 → 前台题库立刻看不到', async () => {
  const before = await call('GET', '/api/topics');
  const arr0 = Array.isArray(before.body) ? before.body : (before.body.topics || []);
  const hadIt = arr0.some((t) => t.id === topicId);

  const off = await call('POST', `/api/admin/topics/${topicId}/offline`, { reason: '自检下架' }, ADMIN);
  if (off.status !== 204) throw new Error('下架 HTTP ' + off.status);

  const after = await call('GET', '/api/topics');
  const arr1 = Array.isArray(after.body) ? after.body : (after.body.topics || []);
  const stillThere = arr1.some((t) => t.id === topicId);
  if (stillThere) throw new Error('下架后前台仍能看到 #' + topicId);
  return `前台 ${arr0.length} → ${arr1.length} 题（原本可见=${hadIt}）`;
});

await check('D3 管理端仍查得到（modStatus=REJECT），并能改回通过', async () => {
  const rej = await call('GET', '/api/admin/topics?modStatus=REJECT&page=1&size=50', undefined, ADMIN);
  const found = (rej.body.items || []).some((t) => t.id === topicId);
  if (!found) throw new Error('管理端 REJECT 列表里找不到 #' + topicId);

  const back = await call('POST', `/api/admin/topics/${topicId}/approve`, {}, ADMIN);
  if (back.status !== 204) throw new Error('通过 HTTP ' + back.status);

  const front = await call('GET', '/api/topics');
  const arr = Array.isArray(front.body) ? front.body : (front.body.topics || []);
  if (!arr.some((t) => t.id === topicId)) throw new Error('改回通过后前台还是看不到');
  return `REJECT 共 ${rej.body.total} 题 · 往返恢复成功`;
});

await check('D4 管理页面：辩题审核页渲染 + 驳回理由必填', async () => {
  await openAdmin('admin/topics');
  await waitFor(`!!document.querySelector('[data-panel="topic-review"]')`, '辩题审核页', 20000);
  await waitFor(`document.querySelectorAll('[data-panel="topic-review"] tbody tr').length > 0`, '题目行', 15000);

  await ev(`(()=>{const tr=document.querySelector('[data-panel="topic-review"] tbody tr');
    [...tr.querySelectorAll('.btn')].find(b=>b.textContent.trim()==='驳回').click(); return true;})()`);
  await waitFor(`!!document.querySelector('.mask .tr-ta')`, '驳回弹窗');
  await ev(`(()=>{const b=[...document.querySelectorAll('.mask .foot .btn')].find(x=>x.textContent.trim()==='确定');
    b.click(); return true;})()`);
  await sleep(600);

  const r = await call('POST', `/api/admin/topics/${topicId}/reject`, {}, ADMIN);
  if (r.status !== 400) throw new Error('理由为空应 400，实际 ' + r.status);
  const rows = await ev(`document.querySelectorAll('[data-panel="topic-review"] tbody tr').length`);
  return `弹窗出现 · 空理由被拒 400 · 表格 ${rows} 行`;
});

await check('D5 视频/辩题页的筛选条能用（标题、作者、日期、题目 id）', async () => {
  // 视频：标题搜索
  await openAdmin('admin/video-audit');
  await waitFor(`document.querySelectorAll('[data-panel="video-audit"] .va-input').length >= 4`, '视频筛选条');
  // 先切到「全部」：这个视频在 C5 已经被通过，默认的「待复核」筛选下搜不到它
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-panel="video-audit"] .va-bar .btn')]
      .find(x=>x.textContent.trim()==='全部'); b.click(); return true;})()`);
  await sleep(1200);
  await ev(`(()=>{const p=document.querySelector('[data-panel="video-audit"]');
    const t=[...p.querySelectorAll('.va-bar .va-input')].find(x=>x.placeholder&&x.placeholder.includes('标题'));
    t.value=${JSON.stringify('自检视频 ' + stamp)}; t.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="video-audit"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await sleep(1400);
  const vRows = await ev(`[...document.querySelectorAll('[data-panel="video-audit"] tbody tr')].map(r=>r.innerText)`);
  if (!vRows.some((t) => t.includes('自检视频 ' + stamp))) throw new Error('视频按标题搜不到：' + vRows.length + ' 行');
  const vDates = await ev(`document.querySelectorAll('[data-panel="video-audit"] .va-input[type="date"]').length`);
  if (vDates !== 2) throw new Error('视频页日期控件不是 2 个：' + vDates);

  // 辩题：题目 id 精确筛 + 日期控件存在
  await openAdmin('admin/topics');
  await waitFor(`document.querySelectorAll('[data-panel="topic-review"] .tr-input').length >= 5`, '辩题筛选条');
  const tDates = await ev(`document.querySelectorAll('[data-panel="topic-review"] .tr-input[type="date"]').length`);
  if (tDates !== 2) throw new Error('辩题页日期控件不是 2 个：' + tDates);
  await ev(`(()=>{const p=document.querySelector('[data-panel="topic-review"]');
    const i=[...p.querySelectorAll('.tr-input')].find(x=>x.placeholder&&x.placeholder.includes('题目 ID'));
    i.value=${JSON.stringify(topicId)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await ev(`[...document.querySelectorAll('[data-panel="topic-review"] .btn')].find(b=>b.textContent.trim()==='搜索').click(); true`);
  await sleep(1400);
  const tRows = await ev(`document.querySelectorAll('[data-panel="topic-review"] tbody tr').length`);
  if (tRows !== 1) throw new Error('辩题按 id 筛应为 1 行，实际 ' + tRows);
  return `视频标题筛 ${vRows.length} 行 · 辩题 id 筛 ${tRows} 行 · 两页各 2 个日期控件`;
});

await check('D6 非管理员调管理端题库/视频复核被拒', async () => {
  const t = await call('GET', '/api/admin/topics', undefined, user);
  const v = await call('GET', '/api/admin/video-audit/queue', undefined, user);
  if (![401, 403].includes(t.status)) throw new Error('topics HTTP ' + t.status);
  if (![401, 403].includes(v.status)) throw new Error('video-audit HTTP ' + v.status);
  return `topics=${t.status} video-audit=${v.status}`;
});

await check('D6 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
console.log('\n汇总：' + out.filter((l) => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
