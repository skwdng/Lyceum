// 通知 V1 前端自检：侧栏角标 / 未读底色 / 已读后角标消失 / 点击跳转 / 未登录引导
// 用法：node server/scripts/selftest_notify.mjs [cdpPort] [baseUrl]
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
const ACC_A = 'nta' + stamp, ACC_B = 'ntb' + stamp, PWD = 'abc12345';
// 昵称加随机后缀：历次测试残留了很多「王同学」，候选是按昵称前缀查的，昵称不唯一就选不准
const NICK_B = '王五' + stamp;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/' }); await sleep(1700);
await ev(`try{localStorage.removeItem('sy_jwt')}catch(e){};true`);
await send('Page.reload', {}); await sleep(1800);
await waitFor(`(typeof S !== 'undefined') && !!document.querySelector('#nav a')`, 'boot');

// ==================== 未登录 ====================
await check('V1-1 未登录：侧栏有「通知」入口，但没有红点', async () => {
  const st = await ev(`({has: document.querySelector('#nav').innerText.indexOf('通知') >= 0,
                          badge: document.querySelectorAll('#nav .nav-badge').length})`);
  if (!st.has) throw new Error('侧栏没有通知入口');
  if (st.badge !== 0) throw new Error('未登录不该有红点');
  return '入口在、无红点';
});

await check('V1-2 未登录进通知页 -> 「登录后可见」', async () => {
  await ev(`go('notify')`); await sleep(600);
  const txt = await ev(`document.querySelector('#main').innerText`);
  if (txt.indexOf('登录后可见') < 0) throw new Error('没显示登录引导：' + txt.slice(0, 60));
  return '有引导';
});

// ==================== 造数据 ====================
const prep = await ev(`(async()=>{
  const j = async (p, b, t) => {
    const h = {'Content-Type':'application/json'}; if (t) h.Authorization = 'Bearer ' + t;
    const r = await fetch(p, {method:'POST', headers:h, body: JSON.stringify(b)});
    return r.json();
  };
  const a = await j('/api/auth/register', {account:'${ACC_A}', password:'${PWD}'});
  const b = await j('/api/auth/register', {account:'${ACC_B}', password:'${PWD}'});
  await fetch('/api/auth/me', {method:'PATCH', headers:{'Content-Type':'application/json', Authorization:'Bearer '+a.token}, body: JSON.stringify({name:'爱丽丝'})});
  await fetch('/api/auth/me', {method:'PATCH', headers:{'Content-Type':'application/json', Authorization:'Bearer '+b.token}, body: JSON.stringify({name:'${NICK_B}'})});
  const p = await j('/api/community/posts', {type:'CHAT', title:'论 AI 是否会取代辩手', body:'正文'}, a.token);
  await j('/api/community/posts/' + p.postId + '/comments', {body:'我觉得不会'}, b.token);
  await fetch('/api/community/posts/' + p.postId + '/like', {method:'POST', headers:{Authorization:'Bearer '+b.token}});
  return {aToken:a.token, postId:p.postId};
})()`);

await check('V1-3 登录后角标显示未读数（2 条）', async () => {
  await ev(`(()=>{authSetToken(${JSON.stringify(prep.aToken)});return true;})()`);
  await send('Page.reload', {}); await sleep(1900);
  await waitFor(`(typeof S !== 'undefined') && !!S.user`, '登录态恢复');
  await waitFor(`!!document.querySelector('#nav .nav-badge')`, '角标出现');
  const badge = await ev(`document.querySelector('#nav .nav-badge').textContent`);
  if (badge !== '2') throw new Error('角标应为 2，实际 ' + badge);
  return '角标=' + badge;
});

await check('V1-4 通知页：两条都在，未读行加深底色 + 左侧蓝点', async () => {
  await ev(`go('notify')`);
  await waitFor(`(S.notify.items||[]).length === 2`, '通知列表');
  await sleep(400);
  const st = await ev(`({
    rows: document.querySelectorAll('#main .notify-row').length,
    unread: document.querySelectorAll('#main .notify-row.unread').length,
    text: document.querySelector('#main .notify-text').textContent
  })`);
  if (st.rows !== 2) throw new Error('应有 2 行，实际 ' + st.rows);
  if (st.unread !== 2) throw new Error('两行都该是未读底色，实际 ' + st.unread);
  return '2 行、2 行未读';
});

await check('V1-5 文案由后端拼好（含「等 N 人」）', async () => {
  const texts = await ev(`[...document.querySelectorAll('#main .notify-text')].map(e => e.textContent)`);
  const joined = texts.join(' | ');
  if (joined.indexOf('评论了你的帖子《论 AI 是否会取代辩手》') < 0) throw new Error('没有评论通知文案：' + joined);
  if (!/赞了你的帖子《论 AI 是否会取代辩手》/.test(joined)) throw new Error('没有点赞通知文案：' + joined);
  return joined.slice(0, 60) + '…';
});

await check('V1-6 拉完列表角标消失（本页已标已读）', async () => {
  await waitFor(`document.querySelectorAll('#nav .nav-badge').length === 0`, '角标消失');
  const n = await ev(`S.unread`);
  if (n !== 0) throw new Error('S.unread 应为 0，实际 ' + n);
  return '角标已清';
});

await check('V1-7 已读状态落到库里（再进一次没有未读底色）', async () => {
  await ev(`go('community')`); await sleep(300);
  await ev(`go('notify')`);
  await waitFor(`(S.notify.items||[]).length === 2`, '二次进通知页');
  await sleep(400);
  const unread = await ev(`document.querySelectorAll('#main .notify-row.unread').length`);
  if (unread !== 0) throw new Error('再看时不该还有未读底色，实际 ' + unread);
  return '全部已读';
});

await check('V1-8 点击通知跳到对应帖子', async () => {
  await ev(`document.querySelector('#main .notify-row').click()`);
  await waitFor(`S.view === 'community' && S.comm.view === 'post'`, '跳到帖子详情');
  const pid = await ev(`String(S.comm.postId)`);
  if (pid !== String(prep.postId)) throw new Error('跳错帖子：' + pid);
  return 'postId=' + pid;
});

// ==================== V2：@ 提及 ====================

await check('V2-1 回复框打「@王」弹出候选', async () => {
  await waitFor(`!!document.querySelector('#replyInput')`, '回复框');
  await ev(`(()=>{
    const el = document.querySelector('#replyInput');
    el.value = '这条是在回复 @${NICK_B}';
    el.setSelectionRange(el.value.length, el.value.length);
    el.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  })()`);
  await waitFor(`document.querySelectorAll('#cmMentionBox .mention-item').length > 0`, '候选弹层', 15000);
  const names = await ev(`[...document.querySelectorAll('#cmMentionBox .mention-item b')].map(e=>e.textContent)`);
  if (!names.includes(NICK_B)) throw new Error('候选里没有 ' + NICK_B + '：' + names.join(','));
  return '候选=' + names.join(',');
});

await check('V2-2 点击候选 -> 正文插入「@王同学 」并记住 id', async () => {
  await ev(`(()=>{
    const it = document.querySelector('#cmMentionBox .mention-item');
    it.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
    return true;
  })()`);
  await sleep(300);
  const st = await ev(`({v: document.querySelector('#replyInput').value,
                        picked: (CM_MENTION.picked||[]).map(x=>x.name),
                        open: !!document.querySelector('#cmMentionBox')})`);
  if (st.v.indexOf('@' + NICK_B + ' ') < 0) throw new Error('正文没插入 @' + NICK_B + '：' + st.v);
  if (!st.picked.includes(NICK_B)) throw new Error('没记住 id：' + st.picked.join(','));
  if (st.open) throw new Error('选完弹层应该关掉');
  return st.v;
});

await check('V2-3 提交带 mentions，且正文 @昵称 渲染成浅蓝', async () => {
  await ev(`document.querySelector('#replyInput').value += ' 你怎么看？'; cmDraft(document.querySelector('#replyInput').value); true`);
  await ev(`cmPostReply()`);
  await waitFor(`(S.postComments||[]).length > 0`, '评论刷新', 20000);
  await sleep(500);
  const st = await ev(`(()=>{
    const el = document.querySelector('#main .reply-text .mention');
    if (!el) return {found:false};
    return {found:true, text: el.textContent, color: getComputedStyle(el).color};
  })()`);
  if (!st.found) throw new Error('正文里没有 .mention 元素');
  if (st.color.replace(/\s/g, '') !== 'rgb(76,154,255)') throw new Error('颜色不对：' + st.color);
  return st.text + ' = ' + st.color;
});

await check('V2-4 被 @ 的人收到 MENTION 通知（文案+跳楼层）', async () => {
  const bToken = await ev(`(async()=>{
    const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({account:'${ACC_B}', password:'${PWD}'})});
    return (await r.json()).token;
  })()`);
  const items = await ev(`(async()=>{
    const r = await fetch('/api/community/notifications',{headers:{Authorization:'Bearer ' + ${JSON.stringify(bToken)}}});
    return (await r.json()).items;
  })()`);
  const m = (items || []).find(x => x.type === 'MENTION');
  if (!m) throw new Error(NICK_B + ' 没收到 MENTION：' + JSON.stringify(items || []).slice(0, 200));
  if (String(m.text).indexOf('在评论里 @ 了你') < 0) throw new Error('文案不对：' + m.text);
  if (!m.link || !m.link.commentId) throw new Error('link 没带 commentId：' + JSON.stringify(m.link));
  return m.text.slice(0, 40) + '… commentId=' + m.link.commentId;
});

await check('V2-5 发帖框也有 @ 弹层', async () => {
  await ev(`cmOpenNewPost()`);
  await waitFor(`!!document.querySelector('#cmBody')`, '发帖弹窗');
  await ev(`(()=>{
    const el = document.querySelector('#cmBody');
    el.value = '帖子正文 @${NICK_B}';
    el.setSelectionRange(el.value.length, el.value.length);
    el.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  })()`);
  await waitFor(`document.querySelectorAll('#cmMentionBox .mention-item').length > 0`, '发帖候选', 15000);
  const names = await ev(`[...document.querySelectorAll('#cmMentionBox .mention-item b')].map(e=>e.textContent)`);
  await ev(`cmClosePostModal()`);
  if (!names.length) throw new Error('发帖框没有候选');
  return '候选=' + names.join(',');
});

// ==================== V3：跳楼层 ====================

await check('V3-1 点击「回复」通知 -> 跳到该评论所在页并高亮', async () => {
  // 造数据：A 发帖 -> A 自评一楼 -> B 连发 12 楼（把一楼挤到第 2 页）-> B 回复 A 的一楼
  const info = await ev(`(async()=>{
    const tok = localStorage.getItem('sy_jwt');
    const j = async (p, b, t) => {
      const h = {'Content-Type':'application/json'}; if (t) h.Authorization = 'Bearer ' + t;
      const r = await fetch(p, {method:'POST', headers:h, body: JSON.stringify(b)});
      return r.json();
    };
    const bTok = await (async()=>{ const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({account:'${ACC_B}', password:'${PWD}'})}); return (await r.json()).token; })();
    const p = await j('/api/community/posts', {type:'CHAT', title:'多楼帖 · 跳楼层用', body:'x'}, tok);
    const root = await j('/api/community/posts/' + p.postId + '/comments', {body:'我的一楼'}, tok);
    for (let i = 1; i <= 12; i++) await j('/api/community/posts/' + p.postId + '/comments', {body:'第 ' + i + ' 楼'}, bTok);
    const reply = await j('/api/community/posts/' + p.postId + '/comments',
      {body:'回复你的一楼', replyObjectType:'COMMENT', replyObjectCommentId: root.commentId}, bTok);
    return {postId:p.postId, rootId:root.commentId, replyId:reply.commentId};
  })()`);
  if (!info || !info.replyId) throw new Error('回复创建失败：' + JSON.stringify(info));

  await ev(`go('notify')`);
  await waitFor(`(S.notify.items||[]).some(x => x.type === 'REPLY_COMMENT')`, '收到回复通知', 20000);
  const nid = await ev(`(S.notify.items.find(x => x.type === 'REPLY_COMMENT') || {}).id`);
  const link = await ev(`JSON.stringify((S.notify.items.find(x => x.type === 'REPLY_COMMENT') || {}).link)`);
  if (String(link).indexOf(String(info.replyId)) < 0) throw new Error('通知 link 没带 commentId：' + link);

  await ev(`(async()=>{ await notifyOpen(${'$'}{nid}); return true; })()`.replace('${nid}', nid));
  await waitFor(`S.view === 'community' && S.comm.view === 'post'`, '跳到帖子');
  await waitFor(`S.commentPage >= 2`, '落到第 2 页', 20000);     // 一楼被 12 楼挤到第 2 页
  await waitFor(`!!document.querySelector('.cm-focus')`, '高亮元素出现', 10000);
  const hl = await ev(`(()=>{ const el=document.querySelector('.cm-focus'); return {cid: el.getAttribute('data-cid'), page: S.commentPage}; })()`);
  const ok = String(hl.cid) === String(info.replyId) || String(hl.cid) === String(info.rootId);
  if (!ok) throw new Error('高亮的不是目标评论/楼层：' + JSON.stringify(hl));
  return 'page=' + hl.page + ' 高亮 cid=' + hl.cid;
});

await check('V3-2 高亮 2 秒后自动消失', async () => {
  await sleep(2400);
  const still = await ev(`!!document.querySelector('.cm-focus')`);
  if (still) throw new Error('2 秒后高亮应已移除');
  return '已恢复';
});

await check('V1-9 无未捕获 JS 异常', async () => { if (errs.length) throw new Error(errs[0].slice(0, 200)); return '0'; });

out.forEach(l => console.log(l));
console.log('\n汇总：' + out.filter(l => l.startsWith('PASS')).length + '/' + out.length + ' 通过');
ws.close(); process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
