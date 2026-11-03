// B5 管理端「处理记录」tab + 一键恢复按钮（CDP 真浏览器）
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
  throw new Error('no target');
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

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

// 造数据：一篇被删的帖子（DELETE）+ 一篇被判禁言但没删的（BAN）
const stamp = Date.now().toString().slice(-6);
await send('Page.navigate', { url: BASE + '/' }); await sleep(1500);
const prep = await ev(`(async()=>{
  const j = async (p,b,h) => { const r = await fetch(p,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},h||{}),body:JSON.stringify(b)}); return {s:r.status, d: await r.json().catch(()=>null)}; };
  const au = (await j('/api/auth/register',{account:'va${stamp}',password:'abc12345'})).d;
  const rp = (await j('/api/auth/register',{account:'vr${stamp}',password:'abc12345'})).d;
  const HA = {Authorization:'Bearer '+au.token}, HR = {Authorization:'Bearer '+rp.token};
  const ad = (await j('/api/admin/auth/login',{account:'admin',password:'admin123'})).d;
  const HM = {Authorization:'Bearer '+ad.token};
  const p1 = (await j('/api/community/posts',{type:'CHAT',title:'B5要被删的帖${stamp}',body:'正文'},HA)).d.postId;
  const r1 = (await j('/api/community/reports',{targetType:'POST',targetId:p1,reason:'ABUSE'},HR)).d.reportId;
  await fetch('/api/admin/reports/'+r1+'/resolve',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},HM),body:JSON.stringify({action:'DELETE',note:'B5删除留痕'})});
  const p2 = (await j('/api/community/posts',{type:'CHAT',title:'B5只禁言的帖${stamp}',body:'正文'},HA)).d.postId;
  const r2 = (await j('/api/community/reports',{targetType:'POST',targetId:p2,reason:'SPAM'},HR)).d.reportId;
  await fetch('/api/admin/reports/'+r2+'/resolve',{method:'POST',headers:Object.assign({'Content-Type':'application/json'},HM),body:JSON.stringify({action:'BAN',banDays:1,note:'B5只禁言'})});
  return {p1:p1, p2:p2};
})()`);

await send('Page.navigate', { url: BASE + '/admin' }); await sleep(1600);
await ev(`try{localStorage.removeItem('sy_admin_jwt')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1600);
await ev(`(()=>{document.querySelector('#acc').value='admin';document.querySelector('#pwd').value='admin123';return true;})()`);
await ev(`adminLogin()`);
await waitFor(`getComputedStyle(document.querySelector('#appView')).display !== 'none'`, '进后台');

await check('B5-1 顶栏第三个 tab「处理记录」存在且可切换', async () => {
  const names = await ev(`Array.from(document.querySelectorAll('.tabs button')).map(b=>b.textContent).join('|')`);
  if (names.indexOf('处理记录') < 0) throw new Error('没有处理记录 tab：' + names);
  await ev(`adminTab('audit')`);
  await waitFor(`getComputedStyle(document.querySelector('#auditPanel')).display !== 'none'`, '审计面板');
  return names;
});

await check('B5-2 审计表格有列与数据（含操作人/动作/对象/详情/状态）', async () => {
  await waitFor(`(document.querySelectorAll('#auditBody tbody tr')||[]).length > 0`, '有记录');
  const txt = await ev(`document.querySelector('#auditBody').innerText`);
  for (const k of ['操作人', '动作', '对象', '详情', '状态']) {
    if (txt.indexOf(k) < 0) throw new Error('表头缺列：' + k);
  }
  if (txt.indexOf('B5删除留痕') < 0) throw new Error('没看到本轮的删除记录');
  if (txt.indexOf('生效中') < 0) throw new Error('没有「生效中」状态');
  return '列齐 + 有数据';
});

await check('B5-3 DELETE 行有「恢复」按钮，BAN 行显示「不可恢复」', async () => {
  const st = await ev(`(()=>{
    const rows = Array.from(document.querySelectorAll('#auditBody tbody tr'));
    const del = rows.find(function(r){ return r.innerText.indexOf('B5删除留痕') >= 0; });
    const ban = rows.find(function(r){ return r.innerText.indexOf('B5只禁言') >= 0; });
    return {
      delHasBtn: !!(del && del.querySelector('button')),
      banHasBtn: !!(ban && ban.querySelector('button')),
      banText: ban ? ban.innerText.replace(/\\s+/g,' ') : ''
    };
  })()`);
  if (!st.delHasBtn) throw new Error('删除行应该有恢复按钮');
  if (st.banHasBtn) throw new Error('纯禁言行不该有恢复按钮');
  if (st.banText.indexOf('不可恢复') < 0) throw new Error('纯禁言行应显示「不可恢复」：' + st.banText);
  return '删除可恢复 / 禁言不可恢复';
});

await check('B5-4 恢复要二次确认，取消则什么都不发生', async () => {
  await ev(`(()=>{window.__confirmText=''; window.confirm=function(m){ window.__confirmText=m; return false; }; return true;})()`);
  await ev(`(()=>{
    const rows = Array.from(document.querySelectorAll('#auditBody tbody tr'));
    const del = rows.find(function(r){ return r.innerText.indexOf('B5删除留痕') >= 0; });
    del.querySelector('button').click();
    return true;
  })()`);
  await sleep(800);
  const msg = await ev(`window.__confirmText`);
  if (String(msg).indexOf('确认撤销这次处理') < 0) throw new Error('确认文案不对：' + msg);
  if (String(msg).indexOf('重新可见') < 0) throw new Error('确认文案应提示内容会重新可见：' + msg);
  const stillDeleted = await ev(`(async()=>{ const r = await fetch('/api/community/posts/${prep.p1}'); return r.status; })()`);
  if (stillDeleted !== 404) throw new Error('取消后不该恢复，帖子状态 ' + stillDeleted);
  return msg;
});

await check('B5-5 确认后恢复：内容重新可见、状态变已撤销、多一条撤销记录', async () => {
  await ev(`window.confirm = function(){ return true; }`);
  await ev(`(()=>{
    const rows = Array.from(document.querySelectorAll('#auditBody tbody tr'));
    const del = rows.find(function(r){ return r.innerText.indexOf('B5删除留痕') >= 0; });
    del.querySelector('button').click();
    return true;
  })()`);
  await sleep(2200);
  const visible = await ev(`(async()=>{ const r = await fetch('/api/community/posts/${prep.p1}'); return r.status; })()`);
  if (visible !== 200) throw new Error('恢复后帖子应 200，实际 ' + visible);
  const txt = await ev(`document.querySelector('#auditBody').innerText`);
  if (txt.indexOf('已撤销') < 0) throw new Error('状态列应出现「已撤销」');
  if (txt.indexOf('撤销处理') < 0) throw new Error('应多一条「撤销处理」记录');
  const btnLeft = await ev(`(()=>{
    const rows = Array.from(document.querySelectorAll('#auditBody tbody tr'));
    const del = rows.find(function(r){ return r.innerText.indexOf('B5删除留痕') >= 0; });
    return !!(del && del.querySelector('button'));
  })()`);
  if (btnLeft) throw new Error('已撤销的行不该再显示恢复按钮');
  return '帖子 200 / 已撤销 / 无按钮';
});

await check('B5-6 无 JS 异常', async () => { if (errs.length) throw new Error(errs[0].slice(0, 160)); return '0'; });

out.forEach(l => console.log(l));
console.log('\n汇总：' + out.filter(l => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close(); process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
