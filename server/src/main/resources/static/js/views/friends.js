/* 好友（V1）：好友列表 / 搜人添加 / 待处理请求
 * 归属：见 docs/协作规范.md 接口点表
 *
 * 约定：
 *   · 身份一律由后端从令牌取，前端不传 userId（除了「加谁」这个业务参数）
 *   · 状态由后端给（isFriend / hasPendingRequest / pendingIn），前端**不自己推断**按钮该显示什么
 *   · 写操作成功后就地刷新列表，不做乐观更新（好友关系是低频动作，简单比花哨重要）
 */

async function loadFriends(){
  if (!S.user) { S.social.friends = []; S.social.requests = []; return; }
  S.social.error = null;
  try {
    const [f, r] = await Promise.all([
      api('/api/social/friends'),
      api('/api/social/friends/requests')
    ]);
    S.social.friends = (f && f.items) || [];
    S.social.requests = (r && r.items) || [];
  } catch (e) {
    S.social.error = (e && e.message) || '加载失败';
  }
  if (S.view === 'friends') render();
}

function viewFriends(){
  const s = S.social;
  if (s.error) {
    return `<h1 class="pg">好友</h1><div class="card"><div class="empty">${esc(s.error)}</div></div>`;
  }

  const reqBlock = s.requests.length ? `
    <div class="card">
      <div class="card-h">待处理请求 <span class="sub">${s.requests.length}</span></div>
      ${s.requests.map(friendRequestRow).join('')}
    </div>` : '';

  const friendBlock = s.friends.length
    ? `<div class="card" style="padding:0;overflow:hidden">${s.friends.map(friendRow).join('')}</div>`
    : `<div class="card"><div class="empty">还没有好友，先在上面搜一个人加吧</div></div>`;

  return `
  <h1 class="pg">好友</h1>
  <p class="sub">好友之间才能私聊 · 对方会收到一条好友请求通知</p>

  <div class="card">
    <div class="card-h">加好友</div>
    <div class="fr-search">
      <input id="frQuery" class="inp" placeholder="输入账号或昵称，如 wandou" value="${esc(s.q || '')}"
             onkeydown="if(event.key==='Enter'){friendsSearch();}">
      <button class="btn primary" onclick="friendsSearch()">搜索</button>
    </div>
    ${s.searched ? (s.search.length
      ? `<div style="margin-top:10px">${s.search.map(friendSearchRow).join('')}</div>`
      : `<div class="sub" style="margin-top:10px">没找到这个人（账号要完全一致，昵称可以是片段）</div>`) : ''}
  </div>

  ${reqBlock}

  <div class="card-h" style="margin:18px 0 8px">我的好友 <span class="sub">${s.friends.length}</span></div>
  ${friendBlock}`;
}

/** 搜索结果的一行：按钮文案完全由后端给的三个布尔决定 */
function friendSearchRow(u){
  let btn;
  if (u.isSelf) {
    btn = `<span class="sub">这是你自己</span>`;
  } else if (u.isFriend) {
    btn = `<button class="btn ghost" disabled>已是好友</button>`;
  } else if (u.pendingIn) {
    btn = `<button class="btn primary" onclick="friendAcceptByUser(${jsq(u.id)})">接受对方请求</button>`;
  } else if (u.hasPendingRequest) {
    btn = `<button class="btn ghost" disabled>已发送</button>`;
  } else {
    btn = `<button class="btn primary" onclick="friendAsk(${jsq(u.id)})">加好友</button>`;
  }

  const noteBox = S.social.noteFor === u.id
    ? `<div class="fr-note">
         <input id="frNote" class="inp" maxlength="100" placeholder="附言（可选，最多 100 字）"
                onkeydown="if(event.key==='Enter'){friendSend(${jsq(u.id)});}">
         <button class="btn primary" onclick="friendSend(${jsq(u.id)})">发送</button>
         <button class="btn ghost" onclick="friendCancelNote()">取消</button>
       </div>`
    : '';

  return `<div class="fr-row">
    <div class="fr-av">${esc(String(u.name || '?').slice(0, 1))}</div>
    <div class="fr-main">
      <div class="fr-name">${esc(u.name)}</div>
      <div class="fr-id">@${esc(u.id)}</div>
    </div>
    <div class="fr-act">${btn}</div>
  </div>${noteBox}`;
}

function friendRequestRow(r){
  return `<div class="fr-row">
    <div class="fr-av">${esc(String(r.fromName || '?').slice(0, 1))}</div>
    <div class="fr-main">
      <div class="fr-name">${esc(r.fromName)} <span class="fr-id">@${esc(r.fromId)}</span></div>
      ${r.note ? `<div class="fr-note-text">「${esc(r.note)}」</div>` : ''}
    </div>
    <div class="fr-act">
      <button class="btn primary" onclick="friendAccept(${Number(r.requestId)})">接受</button>
      <button class="btn ghost" onclick="friendReject(${Number(r.requestId)})">拒绝</button>
    </div>
  </div>`;
}

function friendRow(f){
  return `<div class="fr-row">
    <div class="fr-av">${esc(String(f.name || '?').slice(0, 1))}</div>
    <div class="fr-main">
      <div class="fr-name">${esc(f.name)} <span class="fr-id">@${esc(f.id)}</span></div>
    </div>
    <div class="fr-act">
      <button class="btn primary" onclick="friendChat(${jsq(f.id)}, ${jsq(f.name)})">发消息</button>
      <button class="btn ghost" onclick="friendDelete(${jsq(f.id)})">删除</button>
    </div>
  </div>`;
}

// ==================== 动作 ====================

async function friendsSearch(){
  const el = $('#frQuery');
  const q = String(el ? el.value : '').trim();
  S.social.q = q;
  S.social.searched = true;
  if (!q) { S.social.search = []; render(); return; }
  try {
    const r = await api('/api/social/users?q=' + encodeURIComponent(q));
    S.social.search = (r && r.items) || [];
  } catch (e) {
    S.social.search = [];
    toast('搜索失败：' + ((e && e.message) || ''));
  }
  render();
}

/** 点「加好友」→ 就地展开附言输入框（不弹 prompt，避免浏览器原生弹窗的样式与阻塞） */
function friendAsk(id){
  S.social.noteFor = id;
  render();
  const inp = $('#frNote'); if (inp) inp.focus();
}

function friendCancelNote(){
  S.social.noteFor = null;
  render();
}

async function friendSend(id){
  const el = $('#frNote');
  const note = el ? String(el.value || '').trim() : '';
  S.social.noteFor = null;
  try {
    const r = await api('/api/social/friends/requests', {method:'POST', body:{toId:id, note: note || null}});
    toast(r && r.status === 'ACCEPTED' ? '你们已经成为好友' : '请求已发送');
    await loadFriends();
    if (S.social.search.length) await friendsSearch();
  } catch (e) {
    toast(friendErrText(e));
    render();
  }
}

async function friendAccept(requestId){
  try {
    await api('/api/social/friends/requests/' + requestId + '/accept', {method:'POST'});
    toast('已加为好友');
    await loadFriends();
    if (S.social.searched) await friendsSearch();
  } catch (e) { toast(friendErrText(e)); }
}

async function friendReject(requestId){
  try {
    await api('/api/social/friends/requests/' + requestId + '/reject', {method:'POST'});
    toast('已拒绝');
    await loadFriends();
  } catch (e) { toast(friendErrText(e)); }
}

/** 搜索结果里点「接受对方请求」：先查出对方的 PENDING 请求 id，再接受 */
async function friendAcceptByUser(userId){
  try {
    const r = await api('/api/social/friends/requests');
    const hit = ((r && r.items) || []).find(x => x.fromId === userId);
    if (!hit) { toast('这条请求可能已被处理'); await loadFriends(); return; }
    await friendAccept(hit.requestId);
  } catch (e) { toast(friendErrText(e)); }
}

/** 从好友列表直接开聊：可能还没有会话，交给 chatOpenWith 处理 */
function friendChat(userId, name){
  chatOpenWith(userId, name);
}

async function friendDelete(userId){
  try {
    await api('/api/social/friends/' + encodeURIComponent(userId), {method:'DELETE'});
    toast('已删除好友');
    await loadFriends();
  } catch (e) { toast(friendErrText(e)); }
}

/** 后端的错误体是 {"code","message"}，这里把 code 翻译成一句人话 */
function friendErrText(e){
  const raw = String((e && e.message) || '');
  let code = '';
  try { code = JSON.parse(raw).code || ''; } catch (ignore) { code = ''; }
  const map = {
    CANT_ADD_SELF: '不能加自己为好友',
    USER_NOT_FOUND: '这个人不存在',
    ALREADY_FRIEND: '你们已经是好友了',
    PENDING_EXISTS: '已经发过请求，等对方处理',
    TARGET_IS_BOT: 'AI 账号不能加好友',
    NOT_FRIEND: '你们不是好友',
    REQUEST_NOT_PENDING: '这条请求已经处理过了',
    NOT_REQUEST_TARGET: '这条请求不是发给你的'
  };
  return map[code] || ('操作失败：' + (code || raw));
}

/**
 * 把字符串安全地塞进 inline `onclick="..."` 的参数里。
 *
 * <p>**不能用 JSON.stringify**：它产出的是双引号字符串，放进双引号包裹的 HTML 属性里会
 * 直接把属性截断（`onclick="friendAsk("bob")"`），浏览器连解析都过不去 ——
 * 第一次跑自检就是卡在这。这里统一用单引号，并把反斜杠与单引号转义掉。
 */
function jsq(s){
  return "'" + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
