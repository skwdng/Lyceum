// 登录 / 我的 / 登出 的前端自检（CDP 直连真浏览器，无 npm 依赖）
// 用法：先起后端（localhost:8080）与带 --remote-debugging-port 的浏览器，再
//   node server/scripts/selftest_auth.mjs 9456
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
  throw new Error('no target on port ' + PORT);
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
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

const account = 'ui' + Date.now().toString().slice(-6);
const password = 'abc12345';

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP });
await sleep(1200);
// 先清掉可能残留的登录态，保证从"未登录"开始
await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){}; true`);
await send('Page.reload', {});
await sleep(1500);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot 完成', 20000);

await check('A0 账号块钉死在侧栏左下角（不被导航挤走）', async () => {
  const g = await ev(`(()=>{const sb=document.querySelector('.sb').getBoundingClientRect();
    const me=document.querySelector('#meBox').getBoundingClientRect();
    return {gap:Math.round(sb.bottom-me.bottom), left:Math.round(me.left-sb.left), mt:getComputedStyle(document.querySelector('#meBox')).marginTop};})()`);
  if (g.gap > 40) throw new Error('没钉在底部，距侧栏底 ' + g.gap + 'px');
  if (g.left > 40) throw new Error('没在左侧，距侧栏左边 ' + g.left + 'px');
  return `距底 ${g.gap}px / 距左 ${g.left}px`;
});
await check('A1 不再有独立「我的账号」导航项，账号入口收进左下角', async () => {
  const nav = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.textContent).join(',')`);
  if (String(nav).includes('我的账号')) throw new Error('导航里还留着「我的账号」：' + nav);
  const box = await ev(`(()=>{const b=document.querySelector('#meBox');return b?b.textContent.replace(/\\s+/g,' ').trim():null})()`);
  if (!box) throw new Error('没找到左下角 #meBox');
  return '左下角=' + box;
});

await check('A2 未登录点左下角账号块显示登录表单', async () => {
  await ev(`(()=>{document.querySelector('#meBox').click();return true;})()`);
  await waitFor(`!!document.querySelector('#authAccount')`, '登录表单');
  const tabs = await ev(`[...document.querySelectorAll('.auth-tabs a')].map(a=>a.textContent).join('/')`);
  if (!tabs.includes('登录') || !tabs.includes('注册')) throw new Error('缺少登录/注册 tab：' + tabs);
  return tabs;
});

await check('A3 注册新账号后自动登录并回到社区', async () => {
  await ev(`authTab('register')`);
  await sleep(200);
  await ev(`(()=>{document.querySelector('#authAccount').value=${JSON.stringify(account)};document.querySelector('#authPassword').value=${JSON.stringify(password)};return true;})()`);
  await ev(`authRegister()`);
  await waitFor(`S.user && S.user.account === ${JSON.stringify(account)}`, '登录态就绪', 20000);
  const st = await ev(`({view:S.view, name:S.user.name, hasToken: !!localStorage.getItem('sy_jwt'),
                        meName:(document.querySelector('#meName')||{}).textContent,
                        meSub:(document.querySelector('#meSub')||{}).textContent,
                        meAv:(document.querySelector('#meAv')||{}).textContent})`);
  if (!st.hasToken) throw new Error('token 没写进 localStorage');
  if (st.meName !== account) throw new Error('左下角名字没跟着变：' + st.meName);
  if (String(st.meSub || '').indexOf('@' + account) !== 0) throw new Error('左下角副标题不对：' + st.meSub);
  if (st.meAv !== account.slice(0, 1)) throw new Error('左下角头像首字不对：' + st.meAv);
  return `account=${account} 左下角=${st.meName}/${st.meSub}/头像${st.meAv}`;
});

await check('A4 登录后发帖，作者昵称=账号', async () => {
  await ev(`go('community')`);
  await waitFor(`S.view==='community'`, '进社区');
  await sleep(700);
  await ev(`cmOpenNewPost()`);
  await waitFor(`!!document.querySelector('#cmTitle')`, '发帖弹窗');
  const title = '登录发的帖 ' + Date.now();
  await ev(`(()=>{document.querySelector('#cmTitle').value=${JSON.stringify(title)};document.querySelector('#cmBody').value='正文';return true;})()`);
  await ev(`cmSubmitPost(null)`);
  await sleep(1600);
  const author = await ev(`(S.posts.find(p=>String(p.title).startsWith('登录发的帖'))||{}).authorName`);
  if (author !== account) throw new Error('作者昵称不对：' + author + '，期望 ' + account);
  return 'authorName=' + author;
});

await check('A5 在「我的」改名后，社区里的作者昵称立刻变', async () => {
  const newName = '昵称' + Date.now().toString().slice(-4);
  await ev(`(()=>{document.querySelector('#meBox').click();return true;})()`);
  await waitFor(`!!document.querySelector('#authName')`, '我的面板');
  await ev(`(()=>{document.querySelector('#authName').value=${JSON.stringify(newName)};return true;})()`);
  await ev(`authRename()`);
  await sleep(1200);
  await ev(`go('community')`);
  await sleep(1400);
  const author = await ev(`(S.posts.find(p=>String(p.title).startsWith('登录发的帖'))||{}).authorName`);
  if (author !== newName) throw new Error('改名没生效：' + author + '，期望 ' + newName);
  return 'authorName=' + author;
});

await check('A6 刷新页面后仍保持登录（token 持久化）', async () => {
  await send('Page.reload', {});
  await sleep(1600);
  await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'reload 后 boot', 20000);
  const u = await ev(`S.user && S.user.account`);
  if (u !== account) throw new Error('刷新后登录态丢了：' + u);
  return 'still logged in as ' + u;
});

await check('A7 登出后本地登录态被清空', async () => {
  await ev(`(()=>{document.querySelector('#meBox').click();return true;})()`);
  await waitFor(`!!document.querySelector('#authName')`, '我的面板');
  await ev(`authLogout()`);
  await sleep(1500);
  const st = await ev(`({user:S.user, token:localStorage.getItem('sy_jwt')})`);
  if (st.user) throw new Error('S.user 没清空');
  if (st.token) throw new Error('localStorage 里 token 没清掉');
  return 'user=null, token=null';
});

await check('A8 登出后发帖被拒（401，帖子没建成）', async () => {
  await ev(`go('community')`);
  await sleep(900);
  const before = await ev(`S.posts.length`);
  const r = await ev(`(async()=>{
    try { await cmRequest('POST','/api/community/posts',{body:{type:'CHAT',title:'匿名不该成功',body:'x'}}); return 'unexpected-success'; }
    catch(e){ return e.code || e.message; }
  })()`);
  await sleep(500);
  const after = await ev(`S.posts.length`);
  if (r === 'unexpected-success') throw new Error('匿名发帖竟然成功了');
  if (after !== before) throw new Error('列表多了一条，说明帖子建成了');
  return 'code=' + r;
});

await check('A9 匿名仍可浏览社区列表', async () => {
  await ev(`go('community')`);
  await sleep(1200);
  const ok = await ev(`S.view==='community' && typeof S.postTotal === 'number' && !!document.querySelector('.cm')`);
  if (!ok) throw new Error('匿名列表渲染失败');
  return 'posts=' + (await ev(`S.posts.length`));
});

await check('A10 无未捕获 JS 异常', async () => {
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
