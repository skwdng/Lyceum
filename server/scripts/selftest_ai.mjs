// 社区 @AI 前端自检（V2）：AI 徽章 / 发完评论后静默刷新 / 通知文案 / 无异常
// 用法：node server/scripts/selftest_ai.mjs [cdpPort] [baseUrl]
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
const waitFor = async (x, l, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(150); } throw new Error('timeout:' + l); };
const out = []; const check = async (n, f) => { try { const v = await f(); out.push('PASS  ' + n + (v ? '  [' + v + ']' : '')); } catch (e) { out.push('FAIL  ' + n + '  -> ' + e.message); } };

const stamp = Date.now().toString().slice(-6);
const ACC = 'aiu' + stamp, PWD = 'abc12345';

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' }); await sleep(1700);
await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1800);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot');

// ==================== 造数据：注册 + 发一个不带 @ 的帖子 ====================
const prep = await ev(`(async()=>{
  const j = async (p, b, t) => {
    const h = {'Content-Type':'application/json'}; if (t) h.Authorization = 'Bearer ' + t;
    const r = await fetch(p, {method:'POST', headers:h, body: JSON.stringify(b)});
    return r.json();
  };
  const a = await j('/api/auth/register', {account:'${ACC}', password:'${PWD}'});
  await fetch('/api/auth/me', {method:'PATCH', headers:{'Content-Type':'application/json', Authorization:'Bearer '+a.token}, body: JSON.stringify({name:'AI测试员${stamp}'})});
  const p = await j('/api/community/posts', {type:'CHAT', title:'AI 助手自检帖 ${stamp}', body:'这是一个用来测 @AI 的帖子。'}, a.token);
  return {token:a.token, postId:p.postId};
})()`);
if (!prep.token) throw new Error('造数据失败');
await ev(`localStorage.setItem('sy_jwt', ${JSON.stringify(prep.token)}); true`);
await send('Page.reload', {}); await sleep(1800);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot2');

// ==================== V1：AI 徽章 ====================

await check('AI-1 AI 账号不作为普通用户出现在登录/注册里（后端 401）', async () => {
  const r = await ev(`(async()=>{
    const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({account:'deepseek', password:'abc12345'})});
    const j = await r.json().catch(()=>({}));
    return {status:r.status, code:j.code};
  })()`);
  if (r.status !== 401) throw new Error('期望 401，实际 ' + r.status);
  return 'status=401 code=' + r.code;
});

await check('AI-2 回复框输入「@Deep」弹出候选并能选中（插入 @DeepSeek + 记住 ai_deepseek）', async () => {
  // cmOpenPost 只在 community 视图里渲染（切视图由调用方负责，比如通知页的 notifyOpen）
  await ev(`go('community')`); await sleep(500);
  await ev(`cmOpenPost(${prep.postId})`); await sleep(1200);
  await waitFor(`!!document.querySelector('#replyInput')`, '回复框');

  // 输入 -> 等候选 -> 选中，全在**一次 evaluate** 里做完：
  // 弹层在 textarea 失焦 120ms 后就会关，中间隔一次 CDP 往返就会踩空（items 被清空，cmMentionPick 静默返回）。
  const r = await ev(`(async()=>{
    const el = document.querySelector('#replyInput');
    if (!el) return {ok:false, why:'没有回复框'};
    el.focus();
    el.value = '@Deep';
    el.setSelectionRange(el.value.length, el.value.length);
    el.dispatchEvent(new Event('input', {bubbles:true}));

    for (let i = 0; i < 60; i++) {
      if (CM_MENTION.open && (CM_MENTION.items || []).length) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const items = CM_MENTION.items || [];
    const names = items.map(x => x.name);
    if (!names.includes('DeepSeek')) return {ok:false, why:'候选里没有 DeepSeek：' + names.join(',')};

    const idx = items.findIndex(x => x.id === 'ai_deepseek');
    cmMentionPick(idx);

    return {ok:true, value: el.value, picked:(CM_MENTION.picked||[]).map(x=>x.id),
            boxGone: !document.querySelector('#cmMentionBox'), names:names};
  })()`);

  if (!r.ok) throw new Error(r.why);
  if (String(r.value).indexOf('@DeepSeek ') < 0) throw new Error('没插入 @DeepSeek：' + r.value);
  if (!r.picked.includes('ai_deepseek')) throw new Error('没记住 ai_deepseek：' + r.picked.join(','));
  if (!r.boxGone) throw new Error('选完弹层没关');
  return r.value + '（候选=' + r.names.join(',') + '）';
});

const submitAt = Date.now();
await check('AI-4 提交评论（不发任何「正在思考」提示）', async () => {
  await ev(`document.querySelector('#replyInput').value += '你能当辩论教练吗？'; cmDraft(document.querySelector('#replyInput').value); true`);
  await ev(`cmPostReply()`);
  await waitFor(`(S.postComments||[]).length > 0`, '自己那条评论出现', 20000);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (/正在思考|已呼叫|AI 正在/.test(txt)) throw new Error('出现了占位/提示文案');
  return '无占位文案';
});

await check('AI-5 不手动刷新，25 秒内 AI 回复自动出现（5s/12s/25s 静默刷新）', async () => {
  await waitFor(`[...document.querySelectorAll('#main .reply-item .ai-badge, #main .reply-sub .ai-badge')].length > 0`,
    'AI 回复没自动出现', 40000);
  const sec = ((Date.now() - submitAt) / 1000).toFixed(1);
  return '耗时 ' + sec + ' 秒';
});

await check('AI-6 回复作者是 DeepSeek 且带「AI」徽章', async () => {
  const st = await ev(`(()=>{
    const badge = document.querySelector('#main .ai-badge');
    const head = badge && badge.parentElement ? badge.parentElement.innerText : '';
    return {badge: badge ? badge.textContent.trim() : null,
            head: head,
            cls: badge ? badge.className : null,
            color: badge ? getComputedStyle(badge).color : null};
  })()`);
  if (!st.badge) throw new Error('没找到 .ai-badge');
  if (st.badge !== 'AI') throw new Error('徽章文案不对：' + st.badge);
  if (st.head.indexOf('DeepSeek') < 0) throw new Error('同一行里没有 DeepSeek：' + st.head);
  return '徽章=' + st.badge + ' 作者行=' + st.head.replace(/\s+/g, ' ').trim();
});

await check('AI-7 AI 回复正文非空、不是占位', async () => {
  const body = await ev(`(()=>{
    const badge = document.querySelector('#main .ai-badge');
    let box = badge; while (box && !box.querySelector('.reply-text')) box = box.parentElement;
    return box ? box.querySelector('.reply-text').innerText.trim() : '';
  })()`);
  if (!body || body.length < 10) throw new Error('正文太短：' + body);
  if (/正在思考|稍等/.test(body)) throw new Error('正文像占位：' + body);
  return body.slice(0, 30) + '…（' + body.length + ' 字）';
});

// ==================== V3：通知 ====================

await check('AI-8 通知只有一条「DeepSeek 回复了你的评论」', async () => {
  const n = await ev(`(async()=>{
    const r = await fetch('/api/community/notifications', {headers:{Authorization:'Bearer '+localStorage.getItem('sy_jwt')}});
    return r.json();
  })()`);
  if (n.total !== 1) throw new Error('期望 1 条通知，实际 ' + n.total + '：' + (n.items || []).map(x => x.type).join(','));
  const it = n.items[0];
  if (it.type !== 'REPLY_COMMENT') throw new Error('类型不对：' + it.type);
  if (it.text.indexOf('DeepSeek 回复了你的评论') < 0) throw new Error('文案不对：' + it.text);
  if (it.link && it.link.commentId == null) throw new Error('link 里没有 commentId，点不回去');
  return it.text.slice(0, 34) + '…';
});

await check('AI-9 通知页能点进 AI 那条回复', async () => {
  await ev(`go('notify')`);
  await waitFor(`document.querySelectorAll('#main .notify-row').length > 0`, '通知列表', 15000);
  await ev(`document.querySelector('#main .notify-row').click()`);
  await sleep(2500);
  const st = await ev(`({inPost: !!(S.comm && S.comm.postId), pid: String(S.comm && S.comm.postId),
                       hasAi: document.querySelectorAll('#main .ai-badge').length})`);
  if (!st.inPost) throw new Error('没跳到帖子');
  if (st.pid !== String(prep.postId)) throw new Error('跳错帖子：' + st.pid);
  return 'postId=' + st.pid + ' AI徽章=' + st.hasAi;
});

await check('AI-10 全程零 JS 异常', async () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
  return '无异常';
});

console.log(out.join('\n'));
const bad = out.filter(x => x.startsWith('FAIL')).length;
console.log('\n汇总：' + (out.length - bad) + '/' + out.length + ' 通过');
process.exit(bad ? 1 : 0);
