// B2/B3 前端自检：用户端「我的」改密 + 管理端顶栏改密（CDP 真浏览器）
// 管理端会真的改一次密码再改回来，脚本末尾有兜底复原，保证演示环境仍是 admin/admin123
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
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { resolve, reject } = pend.get(m.id); pend.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
};
const send = (m, p = {}) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 220)); return r.result.value; };
const waitFor = async (x, l, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(150); } throw new Error('timeout:' + l); };
const out = []; const check = async (n, f) => { try { const v = await f(); out.push('PASS  ' + n + (v ? '  [' + v + ']' : '')); } catch (e) { out.push('FAIL  ' + n + '  -> ' + e.message); } };
const toastText = `Array.from(document.querySelectorAll('#toastHost .toast, #toast .tst')).map(function(x){return x.textContent;}).join('|')`;

const stamp = Date.now().toString().slice(-6);
const USER = 'pw' + stamp, USER_PWD = 'abc12345';
const TMP_ADMIN_PWD = 'tmpadmin' + stamp;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' });
await sleep(1600);
await ev(`try{localStorage.removeItem('sy_jwt');localStorage.removeItem('sy_admin_jwt')}catch(e){};true`);

const reg = await ev(`(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${USER}',password:'${USER_PWD}'})});return r.json();})()`);

// ==================== 用户端 ====================
await ev(`(()=>{authSetToken(${JSON.stringify(reg.token)});S.user=${JSON.stringify(reg.user)};authRenderMeBox();go('me');return true;})()`);
await sleep(900);

await check('P1 「我的」里有修改密码三输入框', async () => {
  const ids = await ev(`['authOldPwd','authNewPwd','authNewPwd2'].map(i=>!!document.getElementById(i)).join(',')`);
  if (ids !== 'true,true,true') throw new Error('输入框缺失：' + ids);
  return '齐';
});

await check('P2 两次不一致 -> 前端拦下，不退出登录', async () => {
  await ev(`(()=>{document.querySelector('#authOldPwd').value='${USER_PWD}';document.querySelector('#authNewPwd').value='newpass123';document.querySelector('#authNewPwd2').value='different12';return true;})()`);
  await ev(`authChangePassword()`); await sleep(600);
  const t = await ev(toastText);
  if (t.indexOf('不一致') < 0) throw new Error('没提示：' + t);
  if (!(await ev(`!!S.user`))) throw new Error('不该退出登录');
  return t;
});

await check('P3 弱密码 -> 前端拦下并提示规则', async () => {
  await ev(`(()=>{document.querySelector('#authNewPwd').value='abcdefgh';document.querySelector('#authNewPwd2').value='abcdefgh';return true;})()`);
  await ev(`authChangePassword()`); await sleep(600);
  const t = await ev(toastText);
  if (t.indexOf('数字和字母') < 0) throw new Error('没提示规则：' + t);
  return t;
});

await check('P4 旧密码错 -> 400 中文提示，仍留在页面', async () => {
  await ev(`(()=>{document.querySelector('#authOldPwd').value='wrong12345';document.querySelector('#authNewPwd').value='newpass123';document.querySelector('#authNewPwd2').value='newpass123';return true;})()`);
  await ev(`authChangePassword()`); await sleep(1500);
  const t = await ev(toastText);
  if (t.indexOf('旧密码不正确') < 0) throw new Error('没提示旧密码错：' + t);
  if (!(await ev(`!!S.user`))) throw new Error('400 不该把人踢下线');
  return t;
});

await check('P5 改密成功 -> 清本地令牌回登录页，旧密码失效新密码可用', async () => {
  await ev(`(()=>{document.querySelector('#authOldPwd').value='${USER_PWD}';document.querySelector('#authNewPwd').value='newpass123';document.querySelector('#authNewPwd2').value='newpass123';return true;})()`);
  await ev(`authChangePassword()`);
  await waitFor(`!S.user && !localStorage.getItem('sy_jwt')`, '登出回登录页');
  const st = await ev(`({view:S.view})`);
  if (st.view !== 'me') throw new Error('应回登录页，view=' + st.view);
  const old = await ev(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${USER}',password:'${USER_PWD}'})});return r.status;})()`);
  if (old !== 401) throw new Error('旧密码应 401，实际 ' + old);
  const ok = await ev(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'${USER}',password:'newpass123'})});return r.status;})()`);
  if (ok !== 200) throw new Error('新密码应 200，实际 ' + ok);
  return '回登录页 / 旧 401 / 新 200';
});

await check('P6 旧令牌调 /me 与社区都是 401 TOKEN_STALE', async () => {
  const r = await ev(`(async()=>{
    const me = await fetch('/api/auth/me',{headers:{Authorization:'Bearer ${reg.token}'}});
    const posts = await fetch('/api/community/posts',{headers:{Authorization:'Bearer ${reg.token}'}});
    const a = await me.json().catch(()=>({})); const b = await posts.json().catch(()=>({}));
    return me.status+':'+(a.code||'')+' / '+posts.status+':'+(b.code||'');
  })()`);
  if (String(r) !== '401:TOKEN_STALE / 401:TOKEN_STALE') throw new Error('实际 ' + r);
  return r;
});

// ==================== 管理端 ====================
await send('Page.navigate', { url: BASE + '/admin' }); await sleep(1600);
await ev(`try{localStorage.removeItem('sy_admin_jwt')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1600);
await ev(`(()=>{document.querySelector('#acc').value='admin';document.querySelector('#pwd').value='admin123';return true;})()`);
await ev(`adminLogin()`);
await waitFor(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`, '进后台');

await check('P7 顶栏有「修改密码」，弹窗三输入框', async () => {
  const has = await ev(`Array.from(document.querySelectorAll('header button')).some(function(b){return b.textContent.indexOf('修改密码')>=0;})`);
  if (!has) throw new Error('顶栏没按钮');
  await ev(`adminOpenPassword()`); await sleep(500);
  const ids = await ev(`['apwdOld','apwdNew','apwdNew2'].map(i=>!!document.getElementById(i)).join(',')`);
  if (ids !== 'true,true,true') throw new Error('输入框缺失：' + ids);
  return '弹窗+三输入框';
});

await check('P8 两次不一致 -> 前端拦下，不退出后台', async () => {
  await ev(`(()=>{document.querySelector('#apwdOld').value='admin123';document.querySelector('#apwdNew').value='newadmin123';document.querySelector('#apwdNew2').value='different1';return true;})()`);
  await ev(`adminSubmitPassword()`); await sleep(600);
  const t = await ev(toastText);
  if (t.indexOf('不一致') < 0) throw new Error('没提示：' + t);
  if (!(await ev(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`))) throw new Error('不该退出');
  return t;
});

await check('P9 旧密码错 -> 400 提示且不踢人', async () => {
  await ev(`(()=>{document.querySelector('#apwdOld').value='wrong12345';document.querySelector('#apwdNew').value='newadmin123';document.querySelector('#apwdNew2').value='newadmin123';return true;})()`);
  await ev(`adminSubmitPassword()`); await sleep(1500);
  const t = await ev(toastText);
  if (t.indexOf('旧密码不正确') < 0) throw new Error('没提示：' + t);
  if (!(await ev(`!!localStorage.getItem('sy_admin_jwt')`))) throw new Error('400 不该清令牌');
  return t;
});

await check('P10 改密成功 -> 回登录页；用新密码登录后改回 admin123', async () => {
  await ev(`(()=>{document.querySelector('#apwdOld').value='admin123';document.querySelector('#apwdNew').value='${TMP_ADMIN_PWD}';document.querySelector('#apwdNew2').value='${TMP_ADMIN_PWD}';return true;})()`);
  await ev(`adminSubmitPassword()`);
  await waitFor(`getComputedStyle(document.querySelector('#loginView')).display !== 'none' && !localStorage.getItem('sy_admin_jwt')`, '回登录页');
  // 用新密码登录
  await ev(`(()=>{document.querySelector('#acc').value='admin';document.querySelector('#pwd').value='${TMP_ADMIN_PWD}';return true;})()`);
  await ev(`adminLogin()`);
  await waitFor(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`, '新密码登录成功');
  // 改回 admin123
  await ev(`adminOpenPassword()`); await sleep(400);
  await ev(`(()=>{document.querySelector('#apwdOld').value='${TMP_ADMIN_PWD}';document.querySelector('#apwdNew').value='admin123';document.querySelector('#apwdNew2').value='admin123';return true;})()`);
  await ev(`adminSubmitPassword()`);
  await waitFor(`getComputedStyle(document.querySelector('#loginView')).display !== 'none'`, '再次回登录页');
  const back = await ev(`(async()=>{const r=await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'admin123'})});return r.status;})()`);
  if (back !== 200) throw new Error('改回 admin123 后应能登录，实际 ' + back);
  return '容器已复原 admin/admin123';
});

await check('P11 无未捕获 JS 异常', async () => {
  if (errs.length) throw new Error(errs[0].slice(0, 160));
  return '0';
});

// ==================== 兜底：确保演示环境密码复原 ====================
try {
  const ok = await ev(`(async()=>{const r=await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'admin123'})});return r.status;})()`);
  if (ok !== 200) {
    // still on temp password -> restore via API
    await ev(`(async()=>{
      const l=await (await fetch('/api/admin/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin',password:'${TMP_ADMIN_PWD}'})})).json();
      if(!l.token) return false;
      await fetch('/api/admin/auth/password',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+l.token},body:JSON.stringify({oldPassword:'${TMP_ADMIN_PWD}',newPassword:'admin123'})});
      return true;
    })()`);
    console.log('\n[兜底] admin 密码已由脚本复原为 admin123');
  }
} catch (e) { console.log('\n[兜底] 复原检查失败：' + e.message); }

out.forEach(l => console.log(l));
console.log('\n汇总：' + out.filter(l => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close();
process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
