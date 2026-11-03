// A5 用户侧前端自检：举报入口 / 举报弹窗 / 我的举报 / 禁言黄条（CDP 真浏览器，无 npm 依赖）
// 用法：node server/scripts/selftest_report.mjs <debugPort> <appUrl>
const PORT = process.argv[2] || '9456';
const APP = process.argv[3] || 'http://localhost:8080/';
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
const A = 'ra' + stamp;     // 举报人
const B = 'rb' + stamp;     // 被举报内容的作者
const PWD = 'abc12345';

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP });
await sleep(1500);
await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){}; true`);
await send('Page.reload', {}); await sleep(1600);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot', 20000);

// 准备两个账号 + 一篇 B 的帖子
const prep = await ev(`(async()=>{
  const j = async (p,b) => { const r = await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); return r.json(); };
  const a = await j('/api/auth/register',{account:'${A}',password:'${PWD}'});
  const b = await j('/api/auth/register',{account:'${B}',password:'${PWD}'});
  const post = await (await fetch('/api/community/posts',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+b.token},
      body:JSON.stringify({type:'CHAT',title:'待举报的帖子',body:'正文内容'})})).json();
  return { postId: post.postId, aToken: a.token, aUser: a.user, bToken: b.token, bUser: b.user };
})()`);

// 浏览器里切成 A 的登录态
await ev(`(()=>{authSetToken(${JSON.stringify(prep.aToken)});S.user=${JSON.stringify(prep.aUser)};authRenderMeBox();go('community');return true;})()`);
await sleep(1200);

await check('A0 未登录时点举报会先要求登录', async () => {
  await ev(`(()=>{authSetToken('');S.user=null;cmMuteInfo=null;go('community');return true;})()`);
  await sleep(900);
  await ev(`cmOpenPost(${prep.postId})`);
  await sleep(900);
  const hasBtn = await ev(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.indexOf('举报')>=0)`);
  if (!hasBtn) throw new Error('未登录时详情页应也能看到举报按钮');
  await ev(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.indexOf('举报')>=0);b.click();return true;})()`);
  await sleep(600);
  const st = await ev(`({view:S.view, mask: !!document.querySelector('#cmReportMask')})`);
  if (st.mask) throw new Error('未登录不该弹出举报框');
  if (st.view !== 'me') throw new Error('未登录点举报应跳到登录页，实际 view=' + st.view);
  return '已跳转登录页';
});

// 恢复 A 登录
await ev(`(()=>{authSetToken(${JSON.stringify(prep.aToken)});S.user=${JSON.stringify(prep.aUser)};authRenderMeBox();go('community');return true;})()`);
await sleep(1000);

await check('A1 别人的帖子详情页有「举报」按钮', async () => {
  await ev(`cmOpenPost(${prep.postId})`);
  await sleep(1000);
  const txt = await ev(`document.body.innerText`);
  if (!txt.includes('举报')) throw new Error('详情页没找到举报按钮');
  return '有';
});

await check('A2 举报弹窗能选原因并提交（补充说明含敏感词会被打码）', async () => {
  await ev(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.indexOf('举报')>=0);b.click();return true;})()`);
  await waitFor(`!!document.querySelector('#cmReportMask')`, '举报弹窗');
  const reasons = await ev(`document.querySelectorAll('#cmReportMask .cm-opt').length`);
  if (reasons !== 4) throw new Error('原因选项应有 4 个，实际 ' + reasons);
  await ev(`(()=>{document.querySelector('#cmReportMask .cm-opt[data-r="ABUSE"]').click();
    document.querySelector('#cmReportDetail').value='这是广告，加微信聊';return true;})()`);
  await ev(`cmSubmitReport()`);
  await sleep(1500);
  const gone = await ev(`!document.querySelector('#cmReportMask')`);
  if (!gone) throw new Error('提交后弹窗没关');
  const mine = await ev(`(async()=>{const r = await cmRequest('GET','/api/community/my-reports?page=1&size=10'); return r;})()`);
  if (!mine.items || !mine.items.length) throw new Error('我的举报里没有记录');
  const d = mine.items[0];
  if (d.status !== 'PENDING') throw new Error('新举报应为 PENDING，实际 ' + d.status);
  // 只用生产词表里确实存在的词断言（「加微信」在 community-sensitive-words.txt 里）
  if (String(d.detail || '').includes('加微信')) throw new Error('补充说明没打码：' + d.detail);
  if (!String(d.detail || '').includes('＊')) throw new Error('补充说明应为全角＊打码：' + d.detail);
  return 'status=' + d.status + ' detail=' + d.detail;
});

await check('A3 「我的举报」弹窗能打开并显示待处理', async () => {
  await ev(`cmOpenMyReports()`);
  await waitFor(`!!document.querySelector('#cmMyMask')`, '我的举报弹窗');
  await sleep(800);
  const txt = await ev(`document.querySelector('#cmMyMask').innerText`);
  if (txt.indexOf('我的举报') < 0) throw new Error('弹窗标题不对');
  if (txt.indexOf('待处理') < 0) throw new Error('应显示「待处理」，实际：' + txt.slice(0, 120));
  if (txt.indexOf('人身攻击') < 0) throw new Error('应显示举报原因');
  await ev(`cmCloseMyReports()`);
  return '有记录且显示待处理';
});

await check('A4 重复举报会被拒（ALREADY_REPORTED）', async () => {
  const r = await ev(`(async()=>{ try { await cmRequest('POST','/api/community/reports',{body:{targetType:'POST',targetId:${prep.postId},reason:'SPAM'}}); return 'SUCCESS'; } catch(e){ return e.code; } })()`);
  if (r !== 'ALREADY_REPORTED') throw new Error('期望 ALREADY_REPORTED，实际 ' + r);
  return 'ALREADY_REPORTED';
});

await check('A5 自己的帖子：有编辑/删除、没有举报按钮', async () => {
  await ev(`(()=>{authSetToken(${JSON.stringify(prep.bToken)});S.user=${JSON.stringify(prep.bUser)};authRenderMeBox();go('community');return true;})()`);
  await sleep(900);
  await ev(`cmOpenPost(${prep.postId})`);
  await sleep(1000);
  const txt = await ev(`document.body.innerText`);
  if (!txt.includes('编辑') || !txt.includes('删除')) throw new Error('作者自己的帖子应有编辑/删除');
  const reportBtn = await ev(`Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.indexOf('举报')>=0).length`);
  if (reportBtn > 0) throw new Error('自己的帖子不该出现举报按钮');
  return '编辑/删除在，举报不在';
});

await check('A6 被禁言：顶部黄条出现，发帖被 403 MUTED 拦下', async () => {
  const banned = await ev(`(async()=>{
    const login = await (await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({account:'admin',password:'admin123'})})).json();
    const r = await fetch('/api/admin/users/${B}/ban',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+login.token},
      body:JSON.stringify({days:1,reason:'自检用'})});
    return r.status;
  })()`);
  if (banned !== 204) throw new Error('禁言接口返回 ' + banned);
  await ev(`(()=>{go('community');return true;})()`);
  await sleep(1800);
  const txt = await ev(`document.body.innerText`);
  if (txt.indexOf('你已被禁言') < 0) throw new Error('没看到禁言黄条');
  const r = await ev(`(async()=>{ try { await cmRequest('POST','/api/community/posts',{body:{type:'CHAT',title:'禁言中还发帖',body:'x'}}); return 'SUCCESS'; } catch(e){ return e.code + '|' + e.message; } })()`);
  if (String(r).indexOf('MUTED') < 0) throw new Error('发帖应被 MUTED 拦下，实际 ' + r);
  // 浏览不受影响
  const list = await ev(`(async()=>{ const r = await cmRequest('GET','/api/community/posts?page=1&size=3'); return r.total; })()`);
  if (typeof list !== 'number') throw new Error('被禁言的人应该还能浏览');
  return '黄条出现，发帖 MUTED，浏览正常';
});

await check('A7 无未捕获 JS 异常', async () => {
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
