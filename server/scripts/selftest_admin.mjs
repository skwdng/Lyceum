// A6 管理端页面自检（CDP 真浏览器，无 npm 依赖）
// 用法：node server/scripts/selftest_admin.mjs <debugPort> <baseUrl>
const PORT = process.argv[2] || '9456';
const BASE = (process.argv[3] || 'http://localhost:8080').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target on ' + PORT);
}
const ws = new WebSocket(await getWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const pageErrors = []; const consoleErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map(a => a.value || a.description || '').join(' '));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};
const waitFor = async (expr, label, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); }
  throw new Error('timeout: ' + label);
};
const results = [];
const check = async (name, fn) => {
  try { const v = await fn(); results.push({ name, ok: true, detail: v === undefined ? '' : String(v) }); }
  catch (e) { results.push({ name, ok: false, detail: e.message }); }
};

const stamp = Date.now().toString().slice(-6);
const A1 = 'xa' + stamp, A2 = 'xb' + stamp, PWD = 'abc12345';
const XSS = '<img src=x onerror="window.__xss=1"> #' + stamp;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

// 造数据：A2 发一篇标题带 XSS 的帖子，A1 举报它
await send('Page.navigate', { url: BASE + '/' });
await sleep(1600);
const prep = await ev(`(async()=>{
  const j = async (p,b,h) => { const r = await fetch(p,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},h||{}),body:JSON.stringify(b)}); return r.json(); };
  const a1 = await j('/api/auth/register',{account:'${A1}',password:'${PWD}'});
  const a2 = await j('/api/auth/register',{account:'${A2}',password:'${PWD}'});
  const post = await j('/api/community/posts',{type:'CHAT',title:${JSON.stringify(XSS)},body:'正文'}, {Authorization:'Bearer '+a2.token});
  await j('/api/community/reports',{targetType:'POST',targetId:post.postId,reason:'ABUSE',detail:'带 <b>HTML</b> 的补充说明'}, {Authorization:'Bearer '+a1.token});
  return { postId: post.postId };
})()`);

// 打开管理页（先清掉可能残留的管理员令牌，保证从"未登录"开始）
await ev(`try{localStorage.removeItem('sy_admin_jwt')}catch(e){}; true`);
await send('Page.navigate', { url: BASE + '/admin' });
await sleep(1800);

await check('A1 未登录打开 /admin 看到独立登录页', async () => {
  const st = await ev(`({login:getComputedStyle(document.querySelector('#loginView')).display,
    app:getComputedStyle(document.querySelector('#appView')).display,
    title:document.title})`);
  if (st.login === 'none') throw new Error('登录页没显示');
  if (st.app !== 'none') throw new Error('未登录不该显示主界面');
  if (String(st.title).indexOf('管理后台') < 0) throw new Error('标题不对：' + st.title);
  return st.title;
});

await check('A2 密码错误时给出错误提示，不进入后台', async () => {
  await ev(`(()=>{document.querySelector('#acc').value='admin';document.querySelector('#pwd').value='wrong12345';return true;})()`);
  await ev(`adminLogin()`);
  await sleep(1500);
  const st = await ev(`({app:getComputedStyle(document.querySelector('#appView')).display,
    toast:(document.querySelector('.toast')||{}).textContent||''})`);
  if (st.app !== 'none') throw new Error('错密码竟然进了后台');
  if (!st.toast) throw new Error('没有错误提示');
  return st.toast;
});

await check('A3 admin/admin123 能登录，三张统计卡有数字', async () => {
  await ev(`(()=>{document.querySelector('#acc').value='admin';document.querySelector('#pwd').value='admin123';return true;})()`);
  await ev(`adminLogin()`);
  await waitFor(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`, '进入后台');
  await waitFor(`document.querySelector('#stPending').textContent !== '-'`, '统计加载');
  const st = await ev(`({p:document.querySelector('#stPending').textContent,
    t:document.querySelector('#stToday').textContent,
    b:document.querySelector('#stBanned').textContent})`);
  if (!/^\d+$/.test(String(st.p).trim())) throw new Error('待处理统计异常：' + st.p);
  return '待处理=' + st.p + ' 今日=' + st.t + ' 禁言中=' + st.b;
});

await check('A4 队列里能看到聚合后的举报（含多人标与原因）', async () => {
  await waitFor(`(document.querySelectorAll('#reportsBody tbody tr')||[]).length > 0`, '队列有数据');
  const txt = await ev(`document.querySelector('#reportsBody').innerText`);
  if (txt.indexOf('帖子') < 0) throw new Error('没有类型标记');
  if (txt.indexOf('人身攻击') < 0) throw new Error('没有原因文案');
  return txt.split('\n').slice(0, 6).join(' / ').slice(0, 90);
});

await check('A5 被举报内容里的 HTML 被转义（不执行）', async () => {
  const xss = await ev(`window.__xss || 0`);
  if (xss) throw new Error('XSS 竟然执行了！');
  const hasImg = await ev(`!!document.querySelector('#reportsBody img')`);
  if (hasImg) throw new Error('注入的 <img> 被当成标签渲染了');
  const txt = await ev(`document.querySelector('#reportsBody').innerText`);
  if (txt.indexOf('<img') < 0) throw new Error('标题原文应作为纯文本显示');
  return '文本显示、未执行';
});

await check('A6 点「处理」打开详情：内容全文 + 举报列表 + 组合按钮', async () => {
  await ev(`(()=>{
    const rows = Array.from(document.querySelectorAll('#reportsBody tbody tr'));
    const row = rows.find(function(r){ return r.innerText.indexOf(${JSON.stringify(stamp)}) >= 0; });
    if (!row) throw new Error('队列里找不到本轮举报');
    row.querySelector('button').click();
    return true;
  })()`);
  await waitFor(`!!document.querySelector('#detailMask')`, '详情弹窗');
  await sleep(600);
  const st = await ev(`({txt:document.querySelector('#detailMask').innerText,
    btns:Array.from(document.querySelectorAll('#detailMask .foot button')).map(b=>b.textContent).join(',')})`);
  if (st.txt.indexOf('正文') < 0) throw new Error('没显示目标正文');
  if (st.txt.indexOf('条举报') < 0) throw new Error('没显示举报条数');
  for (const k of ['忽略', '禁言', '删除内容', '删除并禁言']) {
    if (st.btns.indexOf(k) < 0) throw new Error('缺少动作按钮：' + k);
  }
  return st.btns;
});

await check('A7 点「删除内容」：队列清空、帖子变 404', async () => {
  await ev(`(()=>{Array.from(document.querySelectorAll('#detailMask .foot button')).find(b=>b.textContent==='删除内容').click();return true;})()`);
  await sleep(1800);
  const gone = await ev(`!document.querySelector('#detailMask')`);
  if (!gone) throw new Error('处理完弹窗没关');
  const st = await ev(`(async()=>{
    const r = await fetch('/api/community/posts/${prep.postId}');
    return r.status;
  })()`);
  if (st !== 404) throw new Error('帖子应变 404，实际 ' + st);
  const left = await ev(`document.querySelector('#reportsBody').innerText`);
  if (left.indexOf('${JSON.stringify(stamp)}') >= 0) throw new Error('已处理的那条还在队列里');
  return '帖子 404，队列已移除';
});

await check('A8 用户管理：列表能搜索、能禁言并显示到期时间', async () => {
  await ev(`adminTab('users')`);
  await waitFor(`(document.querySelectorAll('#usersBody tbody tr')||[]).length > 0`, '用户列表');
  await ev(`(()=>{document.querySelector('#userQ').value='${A2}';return true;})()`);
  await ev(`adminSearchUsers()`);
  await sleep(1200);
  const rows = await ev(`document.querySelectorAll('#usersBody tbody tr').length`);
  if (rows !== 1) throw new Error('搜索应只剩 1 行，实际 ' + rows);
  await ev(`(()=>{const b=Array.from(document.querySelectorAll('#usersBody button')).find(x=>x.textContent.indexOf('禁言')>=0);b.click();return true;})()`);
  await sleep(1600);
  const txt = await ev(`document.querySelector('#usersBody').innerText`);
  if (txt.indexOf('禁言至') < 0) throw new Error('禁言后应显示「禁言至 …」，实际：' + txt.slice(0, 120));
  return '已禁言并显示到期时间';
});

await check('A9 全站封禁按钮会把用户标成「全站封禁」', async () => {
  await ev(`(()=>{window.confirm = function(){ return true; };return true;})()`);
  await ev(`(()=>{const b=Array.from(document.querySelectorAll('#usersBody button')).find(x=>x.textContent.indexOf('全站封禁')>=0);b.click();return true;})()`);
  await sleep(1800);
  const txt = await ev(`document.querySelector('#usersBody').innerText`);
  if (txt.indexOf('全站封禁') < 0) throw new Error('没显示全站封禁标记');
  if (txt.indexOf('解封') < 0) throw new Error('按钮应变成「解封」');
  return '已标记全站封禁';
});

await check('A10 刷新页面仍保持登录（令牌持久化），退出后回登录页', async () => {
  await send('Page.reload', {});
  await sleep(1800);
  await waitFor(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`, '重进后台');
  await ev(`adminLogout()`);
  await sleep(600);
  const st = await ev(`({login:getComputedStyle(document.querySelector('#loginView')).display,
    token:localStorage.getItem('sy_admin_jwt')})`);
  if (st.login === 'none') throw new Error('退出后应回登录页');
  if (st.token) throw new Error('退出后令牌应清掉');
  return '刷新保持、退出清理';
});

await check('A11 无未捕获 JS 异常', async () => {
  if (pageErrors.length) throw new Error(pageErrors.slice(0, 2).join(' | '));
  const real = consoleErrors.filter(t => !/favicon|404 \(Not Found\)/i.test(t));
  if (real.length) throw new Error(real.slice(0, 2).join(' | '));
  return `pageErrors=0 consoleErrors=${consoleErrors.length}`;
});

const bad = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n汇总：${results.length - bad.length}/${results.length} 通过`);
if (pageErrors.length) console.log('页面异常：\n' + pageErrors.slice(0, 5).join('\n'));
ws.close();
process.exit(bad.length ? 1 : 0);
