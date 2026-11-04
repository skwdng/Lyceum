// D4 前端自检：未登录引导 / SSE 带令牌 / 房间昵称与角色标签（CDP 真浏览器）
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
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval:' + JSON.stringify(r.exceptionDetails).slice(0, 240)); return r.result.value; };
const waitFor = async (x, l, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(150); } throw new Error('timeout:' + l); };
const out = []; const check = async (n, f) => { try { const v = await f(); out.push('PASS  ' + n + (v ? '  [' + v + ']' : '')); } catch (e) { out.push('FAIL  ' + n + '  -> ' + e.message); } };
const toastText = `Array.from(document.querySelectorAll('#toast .tst')).map(function(x){return x.textContent;}).join('|')`;

const stamp = Date.now().toString().slice(-6);
const ACC_A = 'da' + stamp, ACC_B = 'db' + stamp, PWD = 'abc12345';

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' });
await sleep(1600);
await ev(`try{localStorage.removeItem('sy_jwt');localStorage.removeItem('sy_uid')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1800);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot', 20000);

// ==================== 未登录 ====================
await check('D4-1 未登录进单人页 -> 「登录后可见」，不出操作面板', async () => {
  await ev(`go('solo')`); await sleep(500);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('登录后可见') < 0) throw new Error('没有登录引导：' + txt.slice(0, 80));
  if (txt.indexOf('开始辩论') >= 0) throw new Error('未登录不该看到开始辩论按钮');
  return '有引导、无操作面板';
});

await check('D4-2 未登录进房间/诊断/记录页同样显示登录后可见', async () => {
  for (const v of ['room', 'diag', 'records']) {
    await ev(`go('${v}')`); await sleep(350);
    const txt = await ev(`document.querySelector('#main').innerText`);
    if (txt.indexOf('登录后可见') < 0) throw new Error(v + ' 页没显示引导');
  }
  return '三页都有';
});

await check('D4-3 未登录点「开始辩论」-> 提示并跳登录页', async () => {
  await ev(`go('solo')`); await sleep(300);
  // 直接触发引导入口（等价于点按钮）
  await ev(`needLogin('登录后才能开始辩论')`);
  await sleep(500);
  const st = await ev(`({view:S.view, toast:(${toastText})})`);
  if (st.view !== 'me') throw new Error('应跳到登录页，view=' + st.view);
  if (String(st.toast).indexOf('登录后才能开始辩论') < 0) throw new Error('没有提示：' + st.toast);
  return st.toast;
});

// ==================== 登录 ====================
const prep = await ev(`(async()=>{
  const j = async (p,b,h) => { const r = await fetch(p,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},h||{}),body:JSON.stringify(b)}); return r.json(); };
  const a = await j('/api/auth/register',{account:'${ACC_A}',password:'${PWD}'});
  const b = await j('/api/auth/register',{account:'${ACC_B}',password:'${PWD}'});
  await fetch('/api/auth/me',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify({name:'张同学'})});
  await fetch('/api/auth/me',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+b.token},body:JSON.stringify({name:'李同学'})});
  const me = await (await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+a.token}})).json();
  return { aToken:a.token, aUser:me, bToken:b.token };
})()`);

await check('D4-4 登录后单人页正常渲染（不再显示登录后可见）', async () => {
  await ev(`(()=>{authSetToken(${JSON.stringify(prep.aToken)});S.user=${JSON.stringify(prep.aUser)};authRenderMeBox();go('solo');return true;})()`);
  await sleep(700);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('登录后可见') >= 0) throw new Error('登录了还显示引导');
  return '正常';
});

await check('D4-5 登录后能开局，SSE 用 ?token= 连上', async () => {
  await ev(`openSeatPanel('t1')`); await sleep(600);
  await ev(`startFromPanel()`);
  await waitFor(`!!S.matchId`, '建局', 20000);
  await waitFor(`S.view === 'match'`, '进对局页', 20000);
  await sleep(2500);
  const st = await ev(`({es: !!S.es, url: S.es ? S.es.url : ''})`);
  if (!st.es) throw new Error('EventSource 没建立');
  if (String(st.url).indexOf('/events?token=') < 0) throw new Error('SSE 地址没带令牌：' + st.url);
  return 'SSE 已连，url 带 token';
});

await check('D4-6 建房后席位显示账号昵称 + 房主标签', async () => {
  await ev(`(()=>{stopPoll();go('room');return true;})()`); await sleep(500);
  await ev(`createRoom()`);
  await waitFor(`!!S.roomCode`, '建房', 20000);
  await sleep(800);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('张同学') < 0) throw new Error('席位没显示账号昵称，实际：' + txt.slice(0, 200));
  if (txt.indexOf('房主') < 0) throw new Error('没有房主标签');
  const html = await ev(`document.querySelector('#main').innerHTML`);
  if (html.indexOf('<span class="tag">房主</span>') < 0) throw new Error('房主应是小标签而不是名字');
  return '昵称+房主标签';
});

await check('D4-7 另一个账号加入 -> 显示昵称 + 玩家标签', async () => {
  const code = await ev(`S.roomCode`);
  await ev(`(async()=>{
    await fetch('/api/rooms/${code}/join',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer ${prep.bToken}'},body:'{}'});
    return true;
  })()`);
  await ev(`(async()=>{ S.room = await api('/api/rooms/' + S.roomCode); render(); return true; })()`);
  await sleep(900);
  const txt = await ev(`document.querySelector('#main').innerText`);
  const html = await ev(`document.querySelector('#main').innerHTML`);
  if (txt.indexOf('李同学') < 0) throw new Error('没显示第二个人的昵称：' + txt.slice(0, 200));
  if (html.indexOf('<span class="tag g">玩家</span>') < 0) throw new Error('没有玩家标签');
  if (html.indexOf('>房主</span>') >= 0 && html.indexOf('张同学') < 0) throw new Error('房主还是被当名字用');
  return '李同学 + 玩家标签';
});

await check('D4-8 房主视角 canStart 与未准备人数正常', async () => {
  const st = await ev(`({isHost:S.room.isHost, canStart:S.room.canStart, unready:(S.room.unready||[]).length})`);
  if (!st.isHost) throw new Error('应识别为房主');
  if (st.unready !== 1) throw new Error('应有 1 人未准备（李同学），实际 ' + st.unready);
  if (st.canStart) throw new Error('还有未准备的人，canStart 应为 false');
  return 'isHost=true, 未准备 1 人';
});

await check('D4-9 社区页不受影响', async () => {
  await ev(`(()=>{stopRoomPoll();go('community');return true;})()`);
  await waitFor(`(S.posts||[]).length >= 0 && S.comm.view === 'list'`, '社区渲染', 20000);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('社区') < 0) throw new Error('社区页没渲染');
  return '正常';
});

// ==================== 登录后的落点（2026-11-04 修复）====================

await check('D4-11 被弹去登录后，登录成功回到原页面（不再一律跳社区）', async () => {
  // 未登录进「辩论记录」-> 整页登录引导
  await ev(`(()=>{authClear();S.user=null;S.lastVisitedView=null;go('records');return true;})()`);
  await sleep(500);
  const gate = await ev(`document.querySelector('#main').innerText`);
  if (gate.indexOf('登录后可见') < 0) throw new Error('记录页应显示登录引导');
  // 点「去登录 / 注册」
  await ev(`(()=>{[...document.querySelectorAll('#main button')].find(b=>b.textContent.indexOf('去登录')>=0).click();return true;})()`);
  await sleep(600);
  if ((await ev(`S.view`)) !== 'me') throw new Error('没进登录页');
  // 走真实登录表单
  await ev(`(()=>{S.authTab='login';render();return true;})()`);
  await sleep(400);
  await ev(`(()=>{document.querySelector('#authAccount').value='${ACC_A}';document.querySelector('#authPassword').value='${PWD}';return true;})()`);
  await ev(`authLogin()`);
  await waitFor(`S.view === 'records'`, '登录后回记录页', 20000);
  if (!(await ev(`!!S.user`))) throw new Error('登录态没恢复');
  return '回到「辩论记录」';
});

await check('D4-12 没有来路时（一进来就登录）仍回社区', async () => {
  await ev(`(()=>{authClear();S.user=null;S.lastVisitedView=null;S.view='me';render();return true;})()`);
  await sleep(400);
  await ev(`(()=>{S.authTab='login';render();return true;})()`);
  await sleep(300);
  await ev(`(()=>{document.querySelector('#authAccount').value='${ACC_A}';document.querySelector('#authPassword').value='${PWD}';return true;})()`);
  await ev(`authLogin()`);
  await waitFor(`S.view === 'community'`, '登录后回社区', 20000);
  return '回到社区（默认）';
});

await check('D4-10 无未捕获 JS 异常', async () => { if (errs.length) throw new Error(errs[0].slice(0, 200)); return '0'; });

out.forEach(l => console.log(l));
console.log('\n汇总：' + out.filter(l => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close(); process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
