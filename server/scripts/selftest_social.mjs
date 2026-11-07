// 社交自检（V1 起逐步扩展）：好友请求 → 接受 → 好友列表 → 删除
// 用法：node server/scripts/selftest_social.mjs [cdpPort] [baseUrl]
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
const waitFor = async (x, l, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(150); } throw new Error('timeout:' + l); };
const out = []; const check = async (n, f) => { try { const v = await f(); out.push('PASS  ' + n + (v ? '  [' + v + ']' : '')); } catch (e) { out.push('FAIL  ' + n + '  -> ' + e.message); } };

const stamp = Date.now().toString().slice(-6);
const ACC_A = 'fa' + stamp, ACC_B = 'fb' + stamp, PWD = 'abc12345';
const NAME_A = '测试甲' + stamp, NAME_B = '测试乙' + stamp;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' }); await sleep(1700);
await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1800);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot');

// ==================== 造两个账号 ====================
const prep = await ev(`(async()=>{
  const j = async (p, b, t) => {
    const h = {'Content-Type':'application/json'}; if (t) h.Authorization = 'Bearer ' + t;
    const r = await fetch(p, {method:'POST', headers:h, body: JSON.stringify(b)});
    return r.json();
  };
  const a = await j('/api/auth/register', {account:'${ACC_A}', password:'${PWD}'});
  const b = await j('/api/auth/register', {account:'${ACC_B}', password:'${PWD}'});
  const patch = async (tok, name) => fetch('/api/auth/me', {method:'PATCH',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+tok}, body: JSON.stringify({name})});
  await patch(a.token, '${NAME_A}');
  await patch(b.token, '${NAME_B}');
  return {a:a.token, b:b.token};
})()`);
if (!prep.a || !prep.b) throw new Error('造账号失败');

/** 用某个账号的令牌重载页面，回到登录态 */
async function beUser(token, view){
  await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(token)}); true`);
  await send('Page.reload', {}); await sleep(1800);
  await waitFor(`(typeof S !== 'undefined') && !!S.user`, '登录态恢复', 15000);
  if (view) { await ev(`go('${view}')`); await sleep(700); }
}

// ==================== V1：好友 ====================

await check('S1 侧栏出现「好友」入口（匿名也不崩）', async () => {
  const n = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.textContent.trim()).join('|')`);
  if (n.indexOf('好友') < 0) throw new Error('侧栏没有好友入口：' + n);
  return n;
});

await check('S2 A 登录后搜索 B（昵称片段）', async () => {
  await beUser(prep.a, 'friends');
  // 等首屏的 loadFriends 落定，否则它会在我填完搜索词后再 render 一次，把输入框重置掉
  await waitFor(`!!document.querySelector('#frQuery') && S.social && !S.social.error`, '好友页就绪');
  await sleep(400);
  // 直接喂状态再走一次搜索请求（真实用户也是"输入 + 点搜索"，这里只是省掉键盘事件）
  const st = await ev(`(async()=>{
    S.social.q = ${JSON.stringify(NAME_B)};
    const el = document.querySelector('#frQuery'); if (el) el.value = ${JSON.stringify(NAME_B)};
    await friendsSearch();
    return { n: (S.social.search||[]).length, names: (S.social.search||[]).map(x=>x.name),
             main: document.querySelector('#main').innerText.slice(0, 160) };
  })()`);
  if (!st.n) throw new Error('搜索无结果：' + JSON.stringify(st));
  if (!st.names.includes(NAME_B)) throw new Error('结果里没有 B：' + JSON.stringify(st.names));
  return '搜到 ' + st.names.join(',');
});

await check('S3 点「加好友」→ 就地展开附言输入框', async () => {
  await ev(`(()=>{
    const rows=[...document.querySelectorAll('.fr-row')];
    const hit=rows.find(r=>r.textContent.indexOf('${NAME_B}')>=0);
    const btn=[...hit.querySelectorAll('button')].find(b=>b.textContent.indexOf('加好友')>=0);
    btn.click(); return true;
  })()`);
  await waitFor(`!!document.querySelector('#frNote')`, '附言输入框');
  return '输入框已出现';
});

await check('S4 填附言并发送 → 按钮变「已发送」且 B 收到通知', async () => {
  await ev(`(()=>{ const el=document.querySelector('#frNote'); el.value='上次那局打得不错'; return true; })()`);
  await ev(`(()=>{
    const body=[...document.querySelectorAll('.fr-note')][0];
    const btn=[...body.querySelectorAll('button')].find(b=>b.textContent.indexOf('发送')>=0);
    btn.click(); return true;
  })()`);
  await sleep(1500);
  await waitFor(`[...document.querySelectorAll('.fr-row')].some(r=>r.textContent.indexOf('已发送')>=0)`, '已发送状态', 15000);

  // B 的通知角标应为 1（FRIEND_REQUEST）
  const unread = await ev(`(async()=>{
    const r = await fetch('/api/community/notifications/unread-count', {headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.b)}}});
    return (await r.json()).unread;
  })()`);
  if (Number(unread) < 1) throw new Error('B 的通知角标没亮：' + unread);
  return '已发送 · B 角标=' + unread;
});

await check('S5 B 登录后「待处理请求」显示附言', async () => {
  await beUser(prep.b, 'friends');
  await waitFor(`document.querySelector('#main').innerText.indexOf('待处理请求') >= 0`, '待处理区块', 15000);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('上次那局打得不错') < 0) throw new Error('附言没显示：' + txt.slice(0, 160));
  return '附言可见';
});

await check('S6 点「接受」→ 双方好友列表都出现对方', async () => {
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='接受');
    btn.click(); return true;
  })()`);
  await sleep(1600);
  await waitFor(`document.querySelector('#main').innerText.indexOf('${NAME_A}') >= 0`, 'B 的好友列表出现 A', 15000);

  const aFriends = await ev(`(async()=>{
    const r = await fetch('/api/social/friends', {headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.a)}}});
    return (await r.json()).items.map(x=>x.name);
  })()`);
  if (aFriends.length !== 1 || aFriends[0] !== NAME_B) throw new Error('A 的好友列表不对：' + JSON.stringify(aFriends));
  return 'B 看到 ' + NAME_A + ' · A 看到 ' + aFriends[0];
});

await check('S7 删除好友 → 双方列表都清空', async () => {
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='删除');
    btn.click(); return true;
  })()`);
  await sleep(1500);
  await waitFor(`document.querySelector('#main').innerText.indexOf('还没有好友') >= 0`, 'B 列表清空', 15000);

  const aFriends = await ev(`(async()=>{
    const r = await fetch('/api/social/friends', {headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.a)}}});
    return (await r.json()).total;
  })()`);
  if (Number(aFriends) !== 0) throw new Error('A 那边还有好友：' + aFriends);
  return '双向清空';
});

await check('S8 好友通知点进去落在「好友」页', async () => {
  await beUser(prep.b, 'notify');
  await waitFor(`document.querySelectorAll('#main .notify-row').length > 0`, '通知列表', 15000);
  // 第一条是最新的 FRIEND_REQUEST
  await ev(`(()=>{
    const row=[...document.querySelectorAll('#main .notify-row')].find(r=>r.textContent.indexOf('想加你为好友')>=0);
    if(!row) throw new Error('没有好友请求通知');
    row.click(); return true;
  })()`);
  await sleep(1200);
  const st = await ev(`({view:S.view, hasFriends: document.querySelector('#main').innerText.indexOf('我的好友') >= 0})`);
  if (st.view !== 'friends') throw new Error('没跳到好友页，实际：' + st.view);
  return '跳到 ' + st.view;
});

// ==================== V2：会话与消息 ====================

await check('C1 侧栏「消息」入口存在（与「通知」并列，两个角标独立）', async () => {
  await beUser(prep.a, 'chat');
  await waitFor(`!!document.querySelector('.soc-chat')`, '消息页');
  const nav = await ev(`[...document.querySelectorAll('#nav a')].map(a=>a.textContent.trim())`);
  const has = w => nav.some(x => x.indexOf(w) >= 0);   // 角标会拼进锚文本，不能用全等
  if (!has('消息') || !has('通知')) throw new Error('侧栏缺入口：' + nav.join('|'));
  const blank = await ev(`document.querySelector('#main').innerText`);
  if (blank.indexOf('选一个会话开始聊天') < 0) throw new Error('空态不对：' + blank.slice(0, 80));
  return '空态正确';
});

await check('C2 好友页点「发消息」→ 进入聊天窗', async () => {
  // S7 已经把好友删了，这里重新加回来
  await ev(`(async()=>{
    // 已经是好友时后端会回 409 ALREADY_FRIEND —— 对这个用例来说就是"已就绪"，忽略即可
    try { await api('/api/social/friends/requests', {method:'POST', body:{toId:'${ACC_B}'}}); } catch (e) {}
    return true;
  })()`);
  await ev(`(async()=>{
    const r = await api('/api/social/friends/requests', {headers:{}});
    return true;
  })()`).catch(()=>{});
  // 用 B 的身份接受
  await ev(`(async()=>{
    const r = await fetch('/api/social/friends/requests', {headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.b)}}});
    const j = await r.json();
    const hit = (j.items||[]).find(x => x.fromId === '${ACC_A}');
    if (hit) await fetch('/api/social/friends/requests/' + hit.requestId + '/accept',
      {method:'POST', headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.b)}}});
    return true;
  })()`);

  await beUser(prep.a, 'friends');
  await waitFor(`[...document.querySelectorAll('#main button')].some(b=>b.textContent.trim()==='发消息')`, '好友列表有发消息', 15000);
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='发消息');
    btn.click(); return true;
  })()`);
  await sleep(900);
  const st = await ev(`({view:S.view, hasInput: !!document.querySelector('#chatText'), peer: (S.chat.peer||{}).name})`);
  if (st.view !== 'chat') throw new Error('没进消息页：' + st.view);
  if (!st.hasInput) throw new Error('聊天输入框没出现');
  return 'peer=' + st.peer;
});

await check('C3 A 发一条消息 → 气泡出现、会话被创建', async () => {
  await ev(`(()=>{ document.querySelector('#chatText').value='晚上一起打一局？'; return true; })()`);
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='发送');
    btn.click(); return true;
  })()`);
  await waitFor(`document.querySelectorAll('#main .chat-bubble').length > 0`, '气泡出现', 15000);
  // convId 是从 ack 里回填的（WS 通道），给它一点点时间；气泡本身可能先以「发送中」出现
  await waitFor(`!!S.chat.convId`, '后端建会话后回填 convId', 15000);
  const st = await ev(`({convId: S.chat.convId, n: document.querySelectorAll('#main .chat-bubble').length,
                        text: document.querySelector('#main .chat-bubble').textContent})`);
  if (!st.convId) throw new Error('没拿到 convId（首次发消息应由后端建会话）');
  if (st.text.indexOf('晚上一起打一局') < 0) throw new Error('气泡内容不对：' + st.text);
  return 'convId=' + st.convId;
});

await check('C4 B 登录后「消息」角标 = 1，会话列表有这条', async () => {
  await beUser(prep.b, 'chat');
  await waitFor(`(S.chat && S.chat.unread) >= 1`, 'B 的角标', 20000);
  const st = await ev(`(()=>{
    const chatA=[...document.querySelectorAll('#nav a')].find(a=>a.textContent.indexOf('消息')>=0);
    const badge=chatA?chatA.querySelector('.nav-badge'):null;
    const navA=[...document.querySelectorAll('#nav a')].find(a=>a.textContent.indexOf('通知')>=0);
    const notifyBadge=navA?navA.querySelector('.nav-badge'):null;
    return {mine: badge?badge.textContent:null, notify: notifyBadge?notifyBadge.textContent:null,
            convs: document.querySelectorAll('#main .chat-conv').length,
            preview: (document.querySelector('#main .chat-conv-sub')||{}).textContent};
  })()`);
  if (st.mine !== '1') throw new Error('消息角标不对：' + st.mine);
  if (st.convs !== 1) throw new Error('会话数不对：' + st.convs);
  if (String(st.preview).indexOf('晚上一起打一局') < 0) throw new Error('摘要不对：' + st.preview);
  return '角标=' + st.mine + ' 通知角标=' + (st.notify || '无');
});

await check('C5 B 打开会话 → 看到消息 → 角标清零', async () => {
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`document.querySelectorAll('#main .chat-bubble').length > 0`, 'B 看到消息', 15000);
  await sleep(900);   // 等标已读落库
  const st = await ev(`({unread: S.chat.unread,
                        badge: (()=>{const a=[...document.querySelectorAll('#nav a')].find(x=>x.textContent.indexOf('消息')>=0);
                                     const b=a?a.querySelector('.nav-badge'):null; return b?b.textContent:null;})()})`);
  if (Number(st.unread) !== 0) throw new Error('本地角标没清零：' + st.unread);
  if (st.badge) throw new Error('侧栏红点还在：' + st.badge);
  return '已清零';
});

await check('C6 B 回一条 → A 重新打开能看到', async () => {
  await ev(`(()=>{ document.querySelector('#chatText').value='好，房间号多少？'; return true; })()`);
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='发送');
    btn.click(); return true;
  })()`);
  await sleep(1500);

  await beUser(prep.a, 'chat');
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, 'A 的会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`document.querySelectorAll('#main .chat-bubble').length >= 2`, 'A 看到两条', 15000);
  const t = await ev(`document.querySelector('#main .chat-msgs').innerText`);
  if (t.indexOf('好，房间号多少？') < 0) throw new Error('没收到回复：' + t.slice(0, 120));
  return '两条消息都在';
});

await check('C7 刷新页面消息仍在（落库不是只在前端内存）', async () => {
  await send('Page.reload', {}); await sleep(1800);
  await waitFor(`(typeof S !== 'undefined') && !!S.user`, '登录态');
  await ev(`go('chat')`); await sleep(1200);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`document.querySelectorAll('#main .chat-bubble').length >= 2`, '刷新后仍有消息', 15000);
  return '持久化正确';
});

await check('C8 非好友发不出消息（删好友后）', async () => {
  await ev(`(async()=>{
    await api('/api/social/friends/${ACC_B}', {method:'DELETE'});
    return true;
  })()`);
  const r = await ev(`(async()=>{
    try { await chatSend(); } catch(e) {}
    const el = document.querySelector('#chatText');
    if (el) el.value = '还能发吗';
    try { await chatSend(); } catch(e) {}
    return true;
  })()`);
  // 用接口直接确认：非好友一定 403
  const code = await ev(`(async()=>{
    const r = await fetch('/api/social/messages', {method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('sy_jwt')},
      body: JSON.stringify({toId:'${ACC_B}', body:'还能发吗'})});
    const j = await r.json().catch(()=>({}));
    return r.status + ':' + (j.code||'');
  })()`);
  if (code.indexOf('403') !== 0 || code.indexOf('NOT_FRIEND') < 0) throw new Error('期望 403 NOT_FRIEND，实际 ' + code);
  return code;
});
// ==================== V3：WebSocket 实时 + 轮询兜底 ====================

/** 重新建立好友关系（C8 删过） */
async function refriend(){
  await ev(`(async()=>{
    // 已经是好友时后端会回 409 ALREADY_FRIEND —— 对这个用例来说就是"已就绪"，忽略即可
    try { await api('/api/social/friends/requests', {method:'POST', body:{toId:'${ACC_B}'}}); } catch (e) {}
    const r = await fetch('/api/social/friends/requests', {headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.b)}}});
    const j = await r.json();
    const hit = (j.items||[]).find(x => x.fromId === '${ACC_A}');
    if (hit) await fetch('/api/social/friends/requests/' + hit.requestId + '/accept',
      {method:'POST', headers:{Authorization:'Bearer ' + ${JSON.stringify(prep.b)}}});
    return true;
  })()`);
}

await check('W1 没有 token 的握手会被拒', async () => {
  const r = await ev(`(async()=>{
    return await new Promise(resolve => {
      let done = false;
      const ws = new WebSocket('ws://' + location.host + '/ws/chat');
      const finish = (v) => { if (!done) { done = true; try{ws.close();}catch(e){} resolve(v); } };
      ws.onopen = () => finish('opened(不该发生)');
      ws.onerror = () => finish('rejected');
      ws.onclose = () => finish('rejected');
      setTimeout(() => finish('timeout'), 4000);
    });
  })()`);
  if (r !== 'rejected') throw new Error('匿名握手居然成功了：' + r);
  return r;
});

await check('W2 登录后 WebSocket 自动连上（state=open）', async () => {
  await refriend();
  await beUser(prep.a, 'chat');
  await waitFor(`typeof ChatWs !== 'undefined' && ChatWs.state === 'open'`, 'WS 连上', 20000);
  return 'state=' + (await ev(`ChatWs.state`));
});

await check('W3 对方发消息 → 不刷新、不轮询，1.5 秒内出现在界面上', async () => {
  // 打开与 B 的会话
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, '会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`!!document.querySelector('#chatText')`, '聊天窗');
  const before = await ev(`document.querySelectorAll('#main .chat-bubble').length`);

  // 用 B 的令牌开一条**裸 WebSocket**，模拟"另一个浏览器里的 B"直接发帧
  const t0 = Date.now();
  const sent = await ev(`(async()=>{
    window.__wsB = new WebSocket('ws://' + location.host + '/ws/chat?token=' + encodeURIComponent(${JSON.stringify(prep.b)}));
    await new Promise((res, rej) => { window.__wsB.onopen = res; window.__wsB.onerror = rej; setTimeout(rej, 5000); });
    window.__wsB.send(JSON.stringify({type:'send', toId:'${ACC_A}', body:'这条是 WebSocket 实时推送的', clientMsgId:'wb-1'}));
    return true;
  })()`);
  if (!sent) throw new Error('B 的 WS 没连上');

  await waitFor(`document.querySelector('#main .chat-msgs').innerText.indexOf('这条是 WebSocket 实时推送的') >= 0`,
    'A 没收到实时推送', 8000);
  const ms = Date.now() - t0;
  if (ms > 1500) throw new Error('推送太慢（' + ms + 'ms），可能退回了轮询');
  const after = await ev(`document.querySelectorAll('#main .chat-bubble').length`);
  return (ms + 'ms，气泡 ' + before + '→' + after);
});

await check('W4 反向：A 发消息，B 的 WS 收到 msg 帧', async () => {
  await ev(`(()=>{
    window.__wsBMsgs = [];
    window.__wsB.onmessage = e => { try { window.__wsBMsgs.push(JSON.parse(e.data)); } catch(err) {} };
    document.querySelector('#chatText').value = 'A 通过 WS 发的';
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()==='发送');
    btn.click(); return true;
  })()`);
  await waitFor(`(window.__wsBMsgs||[]).some(m => m.type === 'msg' && m.message.body.indexOf('A 通过 WS 发的') >= 0)`,
    'B 没收到 msg 帧', 10000);
  const frame = await ev(`(window.__wsBMsgs||[]).find(m => m.type === 'msg').message`);
  return 'B 收到 messageId=' + frame.id;
});

await check('W5 ack 回来之后「发送中」气泡消失', async () => {
  await waitFor(`(S.chat.pending||[]).length === 0`, 'pending 没清空', 10000);
  const st = await ev(`({pending:(S.chat.pending||[]).length,
                        bubbles: document.querySelectorAll('#main .chat-bubble').length,
                        text: document.querySelector('#main .chat-msgs').innerText})`);
  if (st.text.indexOf('发送中…') >= 0) throw new Error('还挂着「发送中」');
  return 'pending=' + st.pending + ' 气泡=' + st.bubbles;
});

await check('W6 主动断开后能自动重连回来', async () => {
  await ev(`(()=>{ ChatWs.ws.close(); return true; })()`);
  await sleep(300);
  const mid = await ev(`ChatWs.state`);
  await waitFor(`ChatWs.state === 'open'`, '自动重连', 15000);
  return '断开时=' + mid + '，之后自动回到 open';
});

await check('W7 连续失败 3 次 → 降级为 3 秒轮询', async () => {
  const st = await ev(`(()=>{
    // 取消上一轮排好的自动重连：它会立刻把 state 改回 connecting（这不影响"是否在轮询"）
    if (ChatWs.reconnectTimer) { clearTimeout(ChatWs.reconnectTimer); ChatWs.reconnectTimer = null; }
    ChatWs.failCount = 2;
    chatWsOnDown('自检强制失败');
    return {mode: chatWsMode(), hasPoll: !!ChatWs.pollTimer, interval: CHAT_POLL_FALLBACK_MS};
  })()`);
  if (st.mode !== 'polling' || !st.hasPoll) throw new Error('没进入降级轮询：' + JSON.stringify(st));
  if (st.interval !== 3000) throw new Error('轮询间隔不是 3 秒：' + st.interval);
  return 'mode=polling 轮询=' + st.interval + 'ms';
});

await check('W8 降级期间仍能收到消息（走 afterId 轮询）', async () => {
  const before = await ev(`document.querySelector('#main .chat-msgs').innerText`);
  // B 用 HTTP 发（模拟"对方在线但我这边只能轮询"）
  await ev(`(async()=>{
    await fetch('/api/social/messages', {method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(prep.b)}},
      body: JSON.stringify({toId:'${ACC_A}', body:'降级期间这条也要收到'})});
    return true;
  })()`);
  await waitFor(`document.querySelector('#main .chat-msgs').innerText.indexOf('降级期间这条也要收到') >= 0`,
    '轮询没拉到新消息', 12000);
  if (before.indexOf('降级期间这条也要收到') >= 0) throw new Error('断言基准不对');
  const ms = await ev(`CHAT_POLL_FALLBACK_MS`);
  return '3 秒轮询拉到（阈值 ' + ms + 'ms）';
});

await check('W9 心跳能收到 pong（连接没假死）', async () => {
  await ev(`(()=>{ window.__pong = false; ChatWs.ws.addEventListener('message', e => {
      try { const m = JSON.parse(e.data); if (m.type === 'pong') window.__pong = true; } catch(err) {}
    }); return true; })()`);
  await ev(`chatWsSendRaw({type:'ping'})`);
  await waitFor(`window.__pong === true`, '没收到 pong', 8000);
  return 'pong 正常';
});

await check('W10 恢复实时后自动关掉轮询', async () => {
  await ev(`(()=>{ if (ChatWs.reconnectTimer) { clearTimeout(ChatWs.reconnectTimer); ChatWs.reconnectTimer = null; }
                   ChatWs.backoff = 1000; chatWsConnect(); return true; })()`);
  await waitFor(`ChatWs.state === 'open' && !ChatWs.pollTimer`, '没切回实时', 15000);
  return 'state=open，轮询已停';
});
// ==================== V4：邀请组队 ====================

let inviteCode = null;

await check('I1 房主在房间页能看到「邀请好友」，非房主看不到', async () => {
  await refriend();
  await beUser(prep.a, 'room');
  await waitFor(`document.querySelector('#main').innerText.indexOf('＋ 建房') >= 0 || !!S.roomCode`, '房间页');
  if (!(await ev(`!!S.roomCode`))) {
    await ev(`(()=>{
      const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.indexOf('建房')>=0);
      btn.click(); return true;
    })()`);
    await waitFor(`!!S.roomCode`, '建房成功', 15000);
  }
  await waitFor(`!!(S.room && S.room.isHost)`, '成为房主', 15000);
  inviteCode = await ev(`S.roomCode`);
  const host = await ev(`document.querySelector('#main').innerText.indexOf('邀请好友') >= 0`);
  if (!host) throw new Error('房主看不到「邀请好友」按钮');

  // 队友视角：同一个页面换成 B 的令牌重载，加入后不应有邀请按钮
  await beUser(prep.b, 'room');
  await ev(`joinRoom(${JSON.stringify(inviteCode)})`);
  await waitFor(`!!S.roomCode`, 'B 加入房间', 15000);
  await sleep(900);
  const guest = await ev(`document.querySelector('#main').innerText.indexOf('邀请好友') >= 0`);
  if (guest) throw new Error('非房主也看到了邀请按钮（应该只有房主能拉人）');
  return inviteCode + ' 房主有 / 队友无';
});

await check('I2 打开弹窗能看到好友列表', async () => {
  await beUser(prep.a, 'room');
  await ev(`joinRoom(${JSON.stringify(inviteCode)})`).catch(()=>{});
  await waitFor(`!!S.roomCode && !!(S.room && S.room.isHost)`, '回到房主视角', 15000);
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main button')].find(b=>b.textContent.indexOf('邀请好友')>=0);
    btn.click(); return true;
  })()`);
  await waitFor(`!!document.querySelector('.iv-box')`, '弹窗没打开');
  await waitFor(`document.querySelectorAll('.iv-box .fr-row').length > 0`, '好友列表为空', 15000);
  const names = await ev(`[...document.querySelectorAll('.iv-box .fr-name')].map(e=>e.textContent)`);
  if (!names.length) throw new Error('弹窗里没有好友');
  return '好友：' + names.join(',');
});

await check('I3 点「邀请」→ 变成「已邀请」（同一个人不会发两遍）', async () => {
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('.iv-box button')].find(b=>b.textContent.trim()==='邀请');
    btn.click(); return true;
  })()`);
  await waitFor(`[...document.querySelectorAll('.iv-box button')].some(b=>b.textContent.trim()==='已邀请')`, '没变成已邀请', 15000);
  const st = await ev(`({sent: Object.keys(S.roomInvite.sent||{}).length})`);
  return '已邀请 ' + st.sent + ' 人';
});

await check('I4 队友在聊天窗看到邀请卡片（房间号 + 加入按钮）', async () => {
  await beUser(prep.b, 'chat');
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, '会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`!!document.querySelector('#main .chat-invite')`, '没看到邀请卡片', 15000);
  const card = await ev(`({code: document.querySelector('#main .chat-invite-code').textContent.trim(),
                          hasJoin: [...document.querySelectorAll('#main .chat-invite button')].some(b=>b.textContent.indexOf('加入房间')>=0),
                          head: document.querySelector('#main .chat-invite-h').textContent})`);
  if (card.code !== inviteCode) throw new Error('卡片房间号不对：' + card.code + ' vs ' + inviteCode);
  if (!card.hasJoin) throw new Error('卡片上没有「加入房间」按钮');
  return card.code + ' · ' + card.head;
});

await check('I5 点卡片「加入房间」→ 进入该房间', async () => {
  await ev(`(()=>{
    const btn=[...document.querySelectorAll('#main .chat-invite button')].find(b=>b.textContent.indexOf('加入房间')>=0);
    btn.click(); return true;
  })()`);
  await waitFor(`S.view === 'room' && S.roomCode === ${JSON.stringify(inviteCode)}`, '没进入房间', 20000);
  const st = await ev(`({view:S.view, code:S.roomCode, isHost: !!(S.room && S.room.isHost),
                        seats: (S.room && S.room.seats ? S.room.seats.filter(x=>x.occupant==='USER').length : 0)})`);
  if (st.isHost) throw new Error('被邀请的人不该是房主');
  return '进入 ' + st.code + '，真人席位 ' + st.seats;
});
// ==================== V4.1：聊天窗布局（输入框常驻可见 / 自动贴底） ====================
//
// 这一组是用户实测反馈「聊天记录一多，输入框被顶到页面最下面，要手动滑到底才看得见」的回归用例。
// 根因：.chat 是 grid，隐式 auto 行会跟着内容长高；且 flex 子项默认 min-height:auto，
// overflow:auto 永远不生效 —— 两处都必须写死，只修一个仍然会被顶高。

/** 把视口设成指定尺寸并重新进入聊天页 */
async function openChatAt(w, h){
  await send('Emulation.setDeviceMetricsOverride', {width:w, height:h, deviceScaleFactor:1, mobile:w < 500});
  await beUser(prep.a, 'chat');
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, '会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await waitFor(`!!document.querySelector('#chatMsgs')`, '聊天窗');
  await sleep(600);
}

/** 输入框是否完整落在视口内 */
const inputVisible = () => ev(`(()=>{const el=document.querySelector('.chat-input');
  if(!el) return 'no-input'; const r=el.getBoundingClientRect();
  return r.bottom <= window.innerHeight + 1 && r.top >= 0;})()`);

/** 处于宽屏或手机布局 */
async function setViewport(which){
  if (which === 'desktop') await send('Emulation.setDeviceMetricsOverride', {width:1440, height:900, deviceScaleFactor:1, mobile:false});
  else await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
}

await check('L1 宽屏：输入框常驻在视口内，页面本身不滚动', async () => {
  await setViewport('desktop');
  await refriend();
  // 先把会话垫长：这个 bug 只在"消息多到撑满面板"时才出现，短会话测不出来
  await ev(`(async()=>{
    for (let i=1;i<=25;i++){
      await fetch('/api/social/messages', {method:'POST',
        headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(prep.b)}},
        body: JSON.stringify({toId:'${ACC_A}', body:'布局回归垫料第 '+i+' 条：这条故意写长一点，好把聊天面板撑满'})});
    }
    return true;
  })()`);
  await openChatAt(1440, 900);
  if (!(await inputVisible())) throw new Error('输入框跑出视口了');
  const pageScrolls = await ev(`document.documentElement.scrollHeight > window.innerHeight + 1`);
  if (pageScrolls) throw new Error('整页在滚动（说明面板被内容顶高了）');
  return '输入框可见、页面不滚动';
});

await check('L2 打开会话自动贴在最新一条', async () => {
  const s = await ev(`(()=>{const b=document.querySelector('#chatMsgs');
    return {gap:Math.round(b.scrollHeight - b.clientHeight - b.scrollTop), scrollable:b.scrollHeight > b.clientHeight,
            rows:document.querySelectorAll('#main .chat-row').length};})()`);
  if (!s.scrollable) throw new Error('消息区没有内部滚动条（说明高度还是被内容撑开）');
  if (Math.abs(s.gap) > 3) throw new Error('没贴在底部，gap=' + s.gap);
  return `内部可滚动、gap=${s.gap}、${s.rows} 条`;
});

await check('L3 发送后仍贴在底部，输入框位置不变', async () => {
  const topBefore = await ev(`Math.round(document.querySelector('.chat-input').getBoundingClientRect().top)`);
  await ev(`(()=>{document.querySelector('#chatText').value='布局回归：发一条，输入框不能跑';
    document.querySelector('.chat-input button').click(); return true;})()`);
  await waitFor(`(S.chat.pending||[]).length === 0`, 'ack 回来', 15000);
  await sleep(400);
  const topAfter = await ev(`Math.round(document.querySelector('.chat-input').getBoundingClientRect().top)`);
  if (Math.abs(topBefore - topAfter) > 2) throw new Error(`输入框被顶动了：${topBefore} → ${topAfter}`);
  const st2 = await ev(`(()=>{const b=document.querySelector('#chatMsgs');
    return {gap:Math.round(b.scrollHeight-b.clientHeight-b.scrollTop), stick:S.chat.stick,
            saved:S.chat.scrollTop, real:Math.round(b.scrollTop), rows:document.querySelectorAll('#main .chat-row').length,
            wsMode: (typeof chatWsMode==='function'? chatWsMode() : 'n/a')};})()`);
  if (Math.abs(st2.gap) > 3) throw new Error('发完没贴到底 ' + JSON.stringify(st2));
  return `输入框 ${topBefore}→${topAfter}、gap=${st2.gap}、${st2.rows} 条`;
});

await check('L4 对方连发一堆消息后，输入框依然可见', async () => {
  await ev(`(async()=>{ for (let i=0;i<15;i++){
    chatOnIncomingMessage({id:90000+i, convId:S.chat.convId, fromId:'${ACC_B}', type:'TEXT',
      body:'压测第 '+(i+1)+' 条：故意发长一点，把列表撑高，看输入框会不会被挤走', createdAt:Date.now()});
  } render(); return true;})()`);
  await sleep(600);
  if (!(await inputVisible())) throw new Error('连发之后输入框又跑出视口了');
  const pageScrolls = await ev(`document.documentElement.scrollHeight > window.innerHeight + 1`);
  if (pageScrolls) throw new Error('连发之后整页又开始滚动');
  return '输入框稳定、页面不滚动';
});

await check('L5 往上翻历史时，新消息不抢滚动位置', async () => {
  // 先滚到中间（离开底部）
  await ev(`(()=>{const b=document.querySelector('#chatMsgs'); b.scrollTop = 200; return true;})()`);
  await sleep(400);
  const t0 = await ev(`Math.round(document.querySelector('#chatMsgs').scrollTop)`);
  // 来一条新消息：不该被拽到底部
  await ev(`(()=>{ chatOnIncomingMessage({id:99999, convId:S.chat.convId, fromId:'${ACC_B}', type:'TEXT',
    body:'翻历史时来的新消息', createdAt:Date.now()}); render(); return true;})()`);
  await sleep(500);
  const t1 = await ev(`Math.round(document.querySelector('#chatMsgs').scrollTop)`);
  if (Math.abs(t1 - t0) > 3) throw new Error(`滚动位置被抢走了：${t0} → ${t1}`);
  return `保持 ${t0}→${t1}`;
});

await check('L6 手机窄屏：单栏布局下输入框同样可见', async () => {
  await setViewport('mobile');
  await openChatAt(390, 844);
  if (!(await inputVisible())) throw new Error('手机端输入框不在视口内');
  const st = await ev(`(()=>{const side=document.querySelector('.chat-side');
    return {sideHidden: side ? getComputedStyle(side).display === 'none' : false,
            scrollable: (()=>{const b=document.querySelector('#chatMsgs');return b? b.scrollHeight > b.clientHeight : false;})()};})()`);
  if (!st.scrollable) throw new Error('手机端消息区没有内部滚动');
  await setViewport('desktop');   // 还原，后面的用例按宽屏跑
  return '输入框可见、单栏、消息区内滚';
});
// ==================== V4.2：未读与"回到消息页"的语义 ====================
//
// 用户实测反馈：有未读时点「消息」，界面显示了和第一个人的聊天记录，但未读没被清掉。
// 根因两条：① 判断"是否正在看这个会话"只比了 convId，没比 view（离开消息页后 convId 还在，
// 于是别处来的消息被自动标已读 —— 红点永远不亮）；② 回到消息页只刷新列表，不重拉当前会话也不标已读。

const unreadOf = async () => ev(`(async()=>{
  const r = await fetch('/api/social/unread-count', {headers:{Authorization:'Bearer '+localStorage.getItem('sy_jwt')}});
  const nav = [...document.querySelectorAll('#nav a')].find(a=>a.textContent.indexOf('消息')>=0);
  const b = nav ? nav.querySelector('.nav-badge') : null;
  return {server:(await r.json()).unread, badge: b?b.textContent:null, client:S.chat.unread};})()`);

const peerSends = async (toId, text) => ev(`(async()=>{
  const r = await fetch('/api/social/messages', {method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(prep.b)}},
    body: JSON.stringify({toId:${JSON.stringify('__TO__')}, body:${JSON.stringify('__TEXT__')}})});
  return r.status;})()`.replace('__TO__', toId).replace('__TEXT__', text));

await check('U1 在别的页面收到消息：红点要亮，且**不能**被自动标已读', async () => {
  await setViewport('desktop');
  await refriend();
  await beUser(prep.a, 'chat');
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, '会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await sleep(1200);
  const before = await unreadOf();
  if (Number(before.server) !== 0) throw new Error('前置状态不对（应已清零）：' + JSON.stringify(before));

  // 离开消息页，对方发一条
  await ev(`go('community')`); await sleep(900);
  const st = await peerSends(ACC_A, '你不在消息页时我发的');
  if (st !== 200) throw new Error('对方发送失败：' + st);
  await sleep(1500);

  const after = await unreadOf();
  if (Number(after.server) !== 1) throw new Error('未读没 +1（消息可能被静默标已读了）：' + JSON.stringify(after));
  if (after.badge !== '1') throw new Error('侧栏红点没亮：' + JSON.stringify(after));
  return 'server=1 红点=' + after.badge;
});

await check('U2 回到消息页：自动重新打开原会话、标已读、新消息可见', async () => {
  await ev(`[...document.querySelectorAll('#nav a')].find(a=>a.textContent.indexOf('消息')>=0).click()`);
  await sleep(2200);
  const st = await unreadOf();
  if (Number(st.server) !== 0) throw new Error('回来之后仍未读：' + JSON.stringify(st));
  if (st.badge) throw new Error('红点还在：' + st.badge);
  const shown = await ev(`(()=>{const b=document.querySelector('#chatMsgs');return b?b.innerText:''})()`);
  if (shown.indexOf('你不在消息页时我发的') < 0) throw new Error('新消息没显示出来（没重拉）：' + shown.slice(-80));
  return '已读清零、新消息可见';
});

await check('U3 刷新页面后（内存无会话）：点消息不误标，点开具体会话才清', async () => {
  // 先造一条未读：必须趁 A 不在消息页时发，否则会被正常标已读（那样就测不到"刷新后"了）
  await ev(`go('community')`); await sleep(900);
  await peerSends(ACC_A, '刷新之后到的这条');
  await sleep(1200);
  await beUser(prep.a, 'chat');          // 重新加载页面：S.chat.convId 归零
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, '会话列表', 15000);
  const listed = await unreadOf();
  if (Number(listed.server) < 1) throw new Error('刷新后未读不对：' + JSON.stringify(listed));
  const hasOpenPane = await ev(`!!document.querySelector('#chatMsgs')`);
  if (hasOpenPane) throw new Error('刷新后不该自动打开任何会话');

  // 点第一个会话 → 标已读
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await sleep(1800);
  const after = await unreadOf();
  if (Number(after.server) !== 0) throw new Error('点开会话后仍未读：' + JSON.stringify(after));
  if (after.badge) throw new Error('红点没清：' + after.badge);
  return '列表态不误标，点开即清';
});

await check('U4 看 A 会话时，B 会话来的消息仍算未读（不串）', async () => {
  // 造第三个账号并和 prep.a 建立第二个会话
  const stamp = Date.now().toString().slice(-6);
  const ACC_C = 'fc' + stamp;
  const cTok = await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${ACC_C}', password:'${PWD}'})});
    return (await r.json()).token;})()`);
  await ev(`(async()=>{
    await fetch('/api/social/friends/requests', {method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(prep.a)}},
      body: JSON.stringify({toId:'${ACC_C}'})});
    const r = await fetch('/api/social/friends/requests', {headers:{Authorization:'Bearer ' + ${JSON.stringify(cTok)}}});
    const j = await r.json();
    const hit = (j.items||[]).find(x => x.toId === undefined || true);
    if (hit) await fetch('/api/social/friends/requests/' + hit.requestId + '/accept',
      {method:'POST', headers:{Authorization:'Bearer ' + ${JSON.stringify(cTok)}}});
    await fetch('/api/social/messages', {method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(cTok)}},
      body: JSON.stringify({toId:'${ACC_A}', body:'我是第三个人，第一条'})});
    return true;})()`);

  // 打开与 B 的会话（列表第一行不一定是 B，按名字挑），然后让 C 发消息
  await ev(`go('chat')`); await sleep(1500);
  await ev(`(()=>{
    const rows=[...document.querySelectorAll('#main .chat-conv')];
    const hit=rows.find(r=>r.textContent.indexOf('${NAME_B}')>=0) || rows[0];
    hit.click(); return true;})()`);
  await sleep(1500);

  const st = await ev(`(async()=>{
    const r = await fetch('/api/social/messages', {method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer ' + ${JSON.stringify(cTok)}},
      body: JSON.stringify({toId:'${ACC_A}', body:'我是第三个人，第二条'})});
    const sent = r.status;
    await new Promise(res=>setTimeout(res,1200));
    const u = await fetch('/api/social/unread-count', {headers:{Authorization:'Bearer '+localStorage.getItem('sy_jwt')}});
    return {sent, server:(await u.json()).unread, badge:S.chat.unread};})()`);
  if (st.sent !== 200) throw new Error('C 发送失败：' + st.sent);
  if (Number(st.server) < 1) throw new Error('看着 B 的会话，C 的消息被误标已读了：' + JSON.stringify(st));
  return 'C 的未读保留（' + st.server + '）';
});
// ==================== V4.3：换账号不能串状态 ====================
//
// 用户实测：退出后用同一个标签页登录另一个账号，点「消息」→ 面板标题是自己的名字、
// 读的是上一个账号的会话（未读消不掉、发消息报失败）。
// 根因：登录/注册/退出都没有清 S.chat / S.social / ChatWs，旧账号的 convId 与 peer 被沿用。

const regAndPrepare = async (acc, name) => {
  return await ev(`(async()=>{
    const r = await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'${acc}', password:'${PWD}'})});
    const j = await r.json();
    if (j.token) await fetch('/api/auth/me', {method:'PATCH',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+j.token},
      body: JSON.stringify({name:'${name}'})});
    return j.token || null;})()`);
};

await check('U5 同一标签页换账号：旧会话不残留、标题不是自己、能正常发消息', async () => {
  const stamp = Date.now().toString().slice(-6);
  const ACC_D = 'wd' + stamp, ACC_E = 'we' + stamp;
  const tokD = await regAndPrepare(ACC_D, '丁同学');
  const tokE = await regAndPrepare(ACC_E, '戊同学');
  if (!tokD || !tokE) throw new Error('造账号失败');

  // E 加 D 为好友，D 给 E 发一条（E 有未读、有会话）
  await ev(`(async()=>{
    // 有的接口是 204 无 body，不能无脑 .json()
    const j = async (p, b, t) => {
      const r = await fetch(p, {method:'POST',
        headers: Object.assign({'Content-Type':'application/json'}, t?{Authorization:'Bearer '+t}:{}),
        body: JSON.stringify(b)});
      const txt = await r.text();
      return txt ? JSON.parse(txt) : {};
    };
    await j('/api/social/friends/requests', {toId:'${ACC_E}'}, ${JSON.stringify(tokD)});
    const list = await (await fetch('/api/social/friends/requests',
      {headers:{Authorization:'Bearer '+${JSON.stringify(tokE)}}})).json();
    const hit = (list.items||[])[0];
    if (hit) await j('/api/social/friends/requests/' + hit.requestId + '/accept', {}, ${JSON.stringify(tokE)});
    await j('/api/social/messages', {toId:'${ACC_E}', body:'来自丁同学的未读消息'}, ${JSON.stringify(tokD)});
    return true;})()`);

  // 当前还登录着 A，先在 A 的账号下打开一个会话（制造"上一个账号的残留"）
  await beUser(prep.a, 'chat');
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, 'A 的会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await sleep(1200);
  const oldConv = await ev(`S.chat.convId`);
  if (!oldConv) throw new Error('A 没打开成功会话');

  // 走真实 UI：退出 → 登录成 E（中途不刷新页面）
  await ev(`authLogout()`);
  await sleep(1200);
  await ev(`go('me')`); await sleep(900);
  await waitFor(`!!document.querySelector('#authAccount')`, '登录表单');
  await ev(`(()=>{document.querySelector('#authAccount').value='${ACC_E}';
                   document.querySelector('#authPassword').value='${PWD}'; return true;})()`);
  await ev(`authLogin()`);
  await waitFor(`S.user && S.user.id === '${ACC_E}'`, '登录成 E', 15000);

  // 关键断言 1：换账号后旧会话必须被清掉
  const after = await ev(`({convId:S.chat.convId, peer:S.chat.peer, items:(S.chat.items||[]).length,
                            convs:(S.chat.convs||[]).length, unread:S.chat.unread})`);
  if (after.convId || after.peer || after.items) throw new Error('换账号后旧会话状态还在：' + JSON.stringify(after));

  // 打开 E 自己的会话
  await ev(`go('chat')`); await sleep(1500);
  await waitFor(`document.querySelectorAll('#main .chat-conv').length > 0`, 'E 的会话列表', 15000);
  await ev(`document.querySelector('#main .chat-conv').click()`);
  await sleep(1800);

  // 关键断言 2：标题是丁同学，不是自己
  const st = await ev(`({peerId:(S.chat.peer||{}).id, me:S.user.id,
                        head:document.querySelector('.chat-head') ? document.querySelector('.chat-head').innerText : '',
                        serverUnread:S.chat.unread,
                        items:(S.chat.items||[]).length})`);
  if (st.peerId === st.me) throw new Error('对端是自己（旧 peer 残留）：' + JSON.stringify(st));
  if (st.peerId !== ACC_D) throw new Error('对端不是丁同学：' + JSON.stringify(st));
  if (st.head.indexOf('丁同学') < 0) throw new Error('标题不对：' + st.head);
  if (!st.items) throw new Error('历史没加载出来');

  // 关键断言 3：能正常发消息（修复前会因为"发给自己"被拒）
  await ev(`(()=>{document.querySelector('#chatText').value='换账号后也能正常发';
                   document.querySelector('.chat-input button').click(); return true;})()`);
  await waitFor(`(S.chat.pending||[]).length === 0`, '发送成功（pending 清空）', 15000);
  await sleep(600);
  const sent = await ev(`(()=>{const t=document.querySelector('#chatMsgs').innerText;
    return {has: t.indexOf('换账号后也能正常发') >= 0,
            failed: t.indexOf('发送失败') >= 0};})()`);
  if (!sent.has) throw new Error('消息没出现在界面上');
  if (sent.failed) throw new Error('显示了「发送失败」');

  // 关键断言 4：E 的未读已清零
  const u = await ev(`(async()=>{
    const r = await fetch('/api/social/unread-count', {headers:{Authorization:'Bearer '+localStorage.getItem('sy_jwt')}});
    return (await r.json()).unread;})()`);
  if (Number(u) !== 0) throw new Error('未读没清零：' + u);
  return '旧状态已清、标题正确、发送成功、未读清零';
});

await check('U6 打开会话时会丢掉上一次的对端，不会对着错的人发', async () => {
  // 人为把 peer 污染成"自己"，再看 chatOpen 是否纠正
  const st = await ev(`(async()=>{
    S.chat.peer = {id: S.user.id, name: S.user.name};
    await chatOpen(S.chat.convId || (S.chat.convs[0] && S.chat.convs[0].convId));
    return {peerId:(S.chat.peer||{}).id, me:S.user.id, err:S.chat.error};})()`);
  if (st.err) throw new Error('加载失败：' + st.err);
  if (st.peerId === st.me) throw new Error('peer 没被纠正，还是自己：' + JSON.stringify(st));
  return 'peer 已纠正为 ' + st.peerId;
});
await check('S9 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter(x => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
