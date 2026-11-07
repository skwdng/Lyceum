/* 聊天（V2）：会话列表 + 聊天窗（先走 HTTP，V3 接 WebSocket 后自动优先用 WS）
 * 归属：见 docs/协作规范.md 接口点表
 *
 * 约定：
 *   · 未读来自后端缓存（Redis），前端不自己数消息；标已读只发「读到哪条」
 *   · 会话列表按后端给的顺序渲染（last_msg_id 倒序），前端不再排序
 *   · 首次和某个好友聊天时还没有会话 id → 先记 pendingPeer，发第一条由后端建会话并返回 convId
 */

/** 当前会话一页多少条（与后端 PAGE_SIZE 对齐） */
const CHAT_PAGE = 20;

async function loadChat(){
  if (!S.user) { S.chat.convs = []; S.chat.unread = 0; return; }
  try {
    const r = await api('/api/social/conversations');
    S.chat.convs = (r && r.items) || [];
    S.chat.unread = Number(r && r.unreadTotal) || 0;

    // 当前打开的会话如果不在列表里（换了账号 / 会话已不存在），必须作废，
    // 否则会继续拿着别的账号的 convId 去拉消息、标已读、发消息
    if (S.chat.convId && !S.chat.convs.some(x => Number(x.convId) === Number(S.chat.convId))) {
      S.chat.convId = null;
      S.chat.peer = null;
      S.chat.items = [];
      S.chat.error = null;
    }
  } catch (e) {
    S.chat.error = (e && e.message) || '加载失败';
  }
  if (S.view === 'chat') render();
}

/** 只刷新角标（轮询用）：一次请求、不拉列表 */
async function refreshChatUnread(){
  if (!S.user) { if (S.chat.unread) { S.chat.unread = 0; reNav(); } return 0; }
  try {
    const r = await api('/api/social/unread-count');
    const n = Number(r && r.unread) || 0;
    if (n !== S.chat.unread) { S.chat.unread = n; reNav(); }
    return n;
  } catch (e) { return S.chat.unread; }
}

// ==================== 视图 ====================

function viewChat(){
  const c = S.chat;
  if (c.error) {
    return `<h1 class="pg">消息</h1><div class="card"><div class="empty">${esc(c.error)}</div></div>`;
  }
  return `<div class="soc-chat${c.convId || c.pendingPeer ? ' has-open' : ''}">
    ${chatListPane()}
    ${c.convId || c.pendingPeer ? chatMainPane() : chatEmptyPane()}
  </div>`;
}

function chatListPane(){
  const list = S.chat.convs || [];
  return `<div class="chat-side">
    <div class="chat-side-h">
      <b>消息</b>
      <button class="btn ghost sm" onclick="go('friends')">+ 好友</button>
    </div>
    ${list.length ? list.map(chatConvRow).join('')
      : `<div class="empty" style="padding:24px 12px">还没有会话<br><span class="sub">先加好友，然后在「好友」里点发消息</span></div>`}
  </div>`;
}

function chatConvRow(it){
  const peer = it.peer || {};
  const last = it.last;
  const on = Number(S.chat.convId) === Number(it.convId);
  const unread = Number(it.unread) || 0;
  return `<div class="chat-conv${on ? ' on' : ''}" onclick="chatOpen(${Number(it.convId)})">
    <div class="fr-av">${esc(String(peer.name || '?').slice(0, 1))}</div>
    <div class="chat-conv-main">
      <div class="chat-conv-top">
        <span class="chat-conv-name">${esc(peer.name)}</span>
        <span class="chat-conv-time">${chatShortTime(it.lastMsgAt)}</span>
      </div>
      <div class="chat-conv-sub">${last ? (last.fromMe ? '我：' : '') + esc(last.preview) : '<i>还没有消息</i>'}</div>
    </div>
    ${unread > 0 ? `<span class="nav-badge" style="margin-left:6px">${unread > 99 ? '99+' : unread}</span>` : ''}
  </div>`;
}

function chatMainPane(){
  const c = S.chat;
  const peer = c.peer || {};
  const items = c.items || [];

  // 加载失败：显示可重试的错误态，而不是拿旧数据糊弄（旧数据会让人对着错误的人发消息）
  if (c.error) {
    return `<div class="chat-main">
      <div class="chat-head">
        <button class="btn ghost sm chat-back" onclick="chatBack()">‹</button>
        <b>会话加载失败</b>
      </div>
      <div class="chat-msgs" style="align-items:center;justify-content:center">
        <div class="empty">${esc(c.error)}<br>
          <button class="btn ghost sm" style="margin-top:10px" onclick="chatRetry()">重新加载</button></div>
      </div>
    </div>`;
  }

  const peerBroken = !peer.id || String(peer.id) === String((S.user && S.user.id) || '');
  return `<div class="chat-main">
    <div class="chat-head">
      <button class="btn ghost sm chat-back" onclick="chatBack()">‹</button>
      <b>${esc(peer.name || peer.id || '会话')}</b>
      <span class="fr-id">@${esc(peer.id || '')}</span>
    </div>
    ${peerBroken ? `<div class="chat-warn">对方信息异常（可能刚切换过账号），
      <a style="color:#2F5BEA;cursor:pointer" onclick="chatRetry()">点此重新加载会话</a></div>` : ''}
    <div class="chat-msgs" id="chatMsgs" onscroll="chatOnScroll(this)">
      ${c.hasMore ? `<div class="chat-more"><button class="btn ghost sm" onclick="chatLoadMore()">加载更早的消息</button></div>` : ''}
      ${items.length ? items.map(chatBubble).join('') : `<div class="empty" style="padding:30px">还没有消息，说点什么吧</div>`}
      ${(c.pending || []).map(chatPendingBubble).join('')}
    </div>
    <div class="chat-input">
      <textarea id="chatText" maxlength="2000" placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                onkeydown="chatKey(event)"></textarea>
      <button class="btn primary" onclick="chatSend()">发送</button>
    </div>
  </div>`;
}

function chatEmptyPane(){
  return `<div class="chat-main chat-blank"><div class="empty">选一个会话开始聊天<br>
    <span class="sub">只有好友之间才能发消息</span></div></div>`;
}

function chatBubble(m){
  const mine = String(m.fromId) === String((S.user && S.user.id) || '');
  if (String(m.type) === 'INVITE') return chatInviteBubble(m, mine);
  return `<div class="chat-row${mine ? ' mine' : ''}" data-mid="${Number(m.id) || ''}">
    <div class="chat-bubble">${esc(m.body)}</div>
    <div class="chat-time">${chatShortTime(m.createdAt)}</div>
  </div>`;
}

/** payload 可能是字符串（HTTP 原样返回）也可能是对象，两种都吃 */
function chatInvitePayload(m){
  const raw = m && m.payload;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)) || {}; } catch (e) { return {}; }
}

/**
 * 邀请组队卡片（V4）。
 *
 * <p>为什么用卡片而不是纯文字：房间号要能被"点"，而不是让人对着 `SY-8F3K`
 * 手打到「多人辩论 → 房间号加入」里。卡片直接调 joinRoom（与手动加入同一条路径）。
 */
function chatInviteBubble(m, mine){
  const p = chatInvitePayload(m);
  const code = String(p.roomCode || '');
  const title = String(p.topicTitle || '');
  return `<div class="chat-row${mine ? ' mine' : ''}">
    <div class="chat-invite">
      <div class="chat-invite-h">${mine ? '你发出了组队邀请' : '邀请你加入辩论房间'}</div>
      <div class="chat-invite-code mono">${esc(code)}</div>
      ${title ? `<div class="chat-invite-topic">${esc(title)}</div>` : ''}
      ${code ? `<button class="btn primary sm" onclick="chatJoinInvite(${jsq(code)})">加入房间</button>`
             : '<div class="chat-time">这张邀请已失效</div>'}
    </div>
    <div class="chat-time">${chatShortTime(m.createdAt)}</div>
  </div>`;
}

/** 点卡片上的「加入房间」：复用房间页的 joinRoom，成功后再切视图 */
async function chatJoinInvite(code){
  if (!code) return;
  await joinRoom(code);
  if (S.roomCode) go('room');
}

/**
 * 「发送中 / 发送失败」的气泡。
 *
 * <p>为什么要有它：WS 发出去到收到 ack 之间有一小段真空期，
 * 没有这个占位用户会以为"点了没反应"，于是重复点发送。
 */
function chatPendingBubble(p){
  const failed = p.state === 'failed';
  return `<div class="chat-row mine pending${failed ? ' failed' : ''}">
    <div class="chat-bubble">${esc(p.body)}</div>
    <div class="chat-time">${failed ? '发送失败，请重试' : '发送中…'}</div>
  </div>`;
}

// ==================== WS 事件回调（由 chat-ws.js 调用） ====================

/** 收到一条新消息：加进当前会话、更新会话列表、必要时标已读 */
function chatOnIncomingMessage(m){
  if (!m || !m.convId) return;
  const convId = Number(m.convId);
  chatMarkSeen(convId, m.id || m.messageId);
  const mine = String(m.fromId) === String((S.user && S.user.id) || '');

  // 「正在看」= 停在消息页 且 打开的就是这个会话。
  // 只比 convId 是不够的：离开消息页后 S.chat.convId 仍然保留，
  // 那样对方发来的消息会被当成"你看过了"而自动标已读 —— 红点永远不亮、消息被静默读掉。
  const viewing = S.view === 'chat' && Number(S.chat.convId) === convId;

  if (viewing) {
    const exists = (S.chat.items || []).some(x => Number(x.id) === Number(m.id || m.messageId));
    if (!exists) S.chat.items.push({
      id: m.id || m.messageId, convId: convId, fromId: m.fromId,
      type: m.type || 'TEXT', body: m.body, payload: m.payload, createdAt: m.createdAt
    });
    // 我正在看这个会话 → 立刻标已读（否则自己的角标会莫名亮起来）
    if (!mine) chatMarkRead();
  }

  // 会话列表：把这条会话顶到最前并更新摘要
  const conv = (S.chat.convs || []).find(x => Number(x.convId) === convId);
  if (conv) {
    conv.last = {id: m.id || m.messageId, fromMe: mine, preview: m.body, type: m.type || 'TEXT'};
    conv.lastMsgAt = m.createdAt;
    if (!mine && !viewing) conv.unread = (Number(conv.unread) || 0) + 1;
    S.chat.convs = [conv].concat((S.chat.convs || []).filter(x => Number(x.convId) !== convId));
  } else if (S.chat.convs) {
    // 新会话（对方第一次给我发消息）→ 直接重拉列表
    loadChat();
  }

  S.chat.unread = (S.chat.convs || []).reduce((s, x) => s + (Number(x.unread) || 0), 0);
  reNav();
}

/** 发送成功：把「发送中」那条换成真正的消息 */
async function chatOnAck(m){
  const item = {id: m.messageId, convId: m.convId, fromId: (S.user && S.user.id) || '',
                type: 'TEXT', body: (ChatWs.pending[m.clientMsgId] || {}).body,
                createdAt: m.createdAt};

  // 首次和某人聊天时（从「好友」页点进来的），convId 只在这个 ack 里才第一次出现。
  // 不接住的话界面会一直停在 "pendingPeer" 状态，后续拉历史/标已读都没有会话可用。
  if (!S.chat.convId && m.convId) {
    S.chat.convId = Number(m.convId);
    S.chat.pendingPeer = null;
    S.chat.items = S.chat.items || [];
    chatMarkSeen(S.chat.convId, m.messageId);
    await loadChat();
    await chatLoadMessages();
    S.chat.pending = (S.chat.pending || []).filter(x => x.clientMsgId !== m.clientMsgId);
    delete ChatWs.pending[m.clientMsgId];
    S.chat.pending = (S.chat.pending || []).filter(x => x.clientMsgId !== m.clientMsgId);
    S.chat.stick = true;
    if (S.view === 'chat') render();
    return;
  }
  chatMarkSeen(m.convId, m.messageId);
  if (Number(S.chat.convId) === Number(m.convId)) {
    const exists = (S.chat.items || []).some(x => Number(x.id) === Number(m.messageId));
    if (!exists) S.chat.items.push(item);
  }
  delete ChatWs.pending[m.clientMsgId];
  // 「发送中」的气泡要一起摘掉：ChatWs.pending 是待确认的 Map，S.chat.pending 才是界面上的占位气泡
  S.chat.pending = (S.chat.pending || []).filter(x => x.clientMsgId !== m.clientMsgId);
  S.chat.stick = true;
  if (S.view === 'chat') render();
}

/** 发送失败：保留气泡但标红（不自动重试，避免用户不知情地发两遍） */
function chatOnSendFailed(clientMsgId, code){
  const p = ChatWs.pending[clientMsgId];
  if (!p) return;
  delete ChatWs.pending[clientMsgId];
  S.chat.pending = (S.chat.pending || []).filter(x => x.clientMsgId !== clientMsgId);
  S.chat.pending.push({clientMsgId: clientMsgId, body: p.body, state: 'failed', at: Date.now()});
  toast(chatErrText({message: JSON.stringify({code: code})}));
  if (S.view === 'chat') render();
}

/** 对方读了：留给"已读"标记（本期只在会话列表里体现，气泡上不做小字） */
function chatOnPeerRead(convId, lastMsgId){
  S.chat.peerRead = S.chat.peerRead || {};
  S.chat.peerRead[Number(convId)] = Number(lastMsgId) || 0;
}

/**
 * 进入消息页（侧栏点「消息」都走这里）。
 *
 * <p>为什么要重新 `chatOpen` 而不是只刷新列表：`S.chat.convId` 会跨页面保留
 * （方便你回来还在原来的对话里）。但只刷新列表的话，界面会拿**旧的内存消息**渲染出
 * "和第一个人的聊天记录"，看起来像看过了，实际上既没拉新消息、也没标已读 —— 红点消不掉。
 */
async function chatEnter(){
  await loadChat();
  if (S.chat.convId) {
    await chatOpen(S.chat.convId);      // 重拉最新 + 标已读 + 渲染
  } else if (S.view === 'chat') {
    render();
  }
}

// ==================== 动作 ====================

/** 打开已有会话 */
async function chatOpen(convId){
  S.chat.convId = Number(convId);
  S.chat.pendingPeer = null;
  S.chat.stick = true;              // 打开会话就该看到最新一条
  S.chat.error = null;

  // 先把旧会话的痕迹清干净：对端与消息**都不允许**从上一次残留下来。
  // 之前这里用 `hit ? hit.peer : S.chat.peer`，一旦列表里查不到就保留旧 peer ——
  // 表现为"标题是别的（甚至自己）""发消息报失败""未读消不掉"。
  const hit = (S.chat.convs || []).find(x => Number(x.convId) === Number(convId));
  S.chat.peer = hit ? hit.peer : null;
  S.chat.items = [];

  await chatLoadMessages();
  if (S.chat.error) {                // 加载失败：把错误显示出来，别再往下标已读
    if (S.view === 'chat') render();
    return;
  }
  await chatMarkRead();
  if (S.view === 'chat') render();   // 滚到底由 chatAfterRender 在渲染后完成
}

/**
 * 从「好友」页发消息：此时可能还没有会话，先记下对方，
 * 发第一条时由后端建会话（响应里带 convId，再切到真会话）。
 */
function chatOpenWith(userId, name){
  S.chat.convId = null;
  S.chat.peer = { id: userId, name: name || userId };
  S.chat.pendingPeer = { id: userId, name: name || userId };
  S.chat.items = [];
  S.chat.hasMore = false;
  S.chat.stick = true;
  go('chat');
}

/** 重新加载当前会话（错误态、对端异常、发消息被拒时都走它） */
async function chatRetry(){
  if (!S.chat.convId) { await loadChat(); if (S.view === 'chat') render(); return; }
  await chatOpen(S.chat.convId);
}

/** 手机端返回列表 */
function chatBack(){
  S.chat.convId = null;
  S.chat.pendingPeer = null;
  S.chat.items = [];
  render();
}

async function chatLoadMessages(beforeId){
  if (!S.chat.convId) { S.chat.items = []; return; }
  try {
    const q = beforeId ? '&beforeId=' + beforeId : '';
    const r = await api('/api/social/messages?convId=' + S.chat.convId + q);
    if (beforeId) {
      S.chat.items = (r.items || []).concat(S.chat.items || []);
    } else {
      S.chat.items = (r && r.items) || [];
      if (r && r.peer) S.chat.peer = r.peer;
    }
    S.chat.hasMore = !!(r && r.hasMore);
    // 记住最后一条：WS 重连 / 轮询兜底都按这个 id 补拉
    const last = (S.chat.items || [])[(S.chat.items || []).length - 1];
    if (last) chatMarkSeen(S.chat.convId, last.id);

    S.chat.error = null;

    // 一致性兜底：列表里这一行显示「有最近一条消息」，服务端却返回空历史
    // → 说明本地列表过时了（典型是换过账号/刚被别人的消息创建），重拉一次列表纠正。
    // 只做一次，不循环。
    if (!beforeId && !S.chat.items.length) {
      const row = (S.chat.convs || []).find(x => Number(x.convId) === Number(S.chat.convId));
      if (row && row.last) await loadChat();
    }
  } catch (e) {
    // 加载失败不能留着上一条会话的消息当"历史"，否则用户看到的是别人的聊天记录
    if (!beforeId) S.chat.items = [];
    S.chat.error = chatErrText(e);
    toast(S.chat.error);
  }
}

async function chatLoadMore(){
  const first = (S.chat.items || [])[0];
  if (!first || S.chat.loadingMore) return;
  S.chat.loadingMore = true;
  const box = $('#chatMsgs');
  const h0 = box ? box.scrollHeight : 0;
  S.chat.stick = false;              // 正在往前翻历史，别自动贴底
  await chatLoadMessages(Number(first.id));
  render();
  // 保持视觉位置：加载更早的消息后不要跳到底部
  const box2 = $('#chatMsgs');
  if (box2) {
    box2.scrollTop = box2.scrollHeight - h0;   // 保持视觉位置：新加载的内容在上面，不要跳到底
    S.chat.scrollTop = box2.scrollTop;
    S.chat.ignoreScrollUntil = Date.now() + 150;
  }
  S.chat.loadingMore = false;
}

function chatOnScroll(el){
  // 记住位置与"是否贴底"：发消息/来消息时据此决定跟随还是原地不动
  S.chat.scrollTop = el.scrollTop;
  S.chat.stick = chatIsAtBottom(el);

  // 渲染后浏览器会补发一次 scroll（新元素从 0 开始），那不是"用户滚到顶"。
  // 不挡掉的话每次发消息都会误触发 chatLoadMore：视图被拽回旧位置，还白发一次历史请求。
  if (Date.now() < (S.chat.ignoreScrollUntil || 0)) return;

  if (el.scrollTop < 40 && S.chat.hasMore) chatLoadMore();
}

/** 现在是否"贴着底部"（差 48px 内都算）—— 用户往上翻历史时不能被新消息抢走滚动位置 */
function chatIsAtBottom(box){
  const b = box || $('#chatMsgs');
  if (!b) return true;
  return (b.scrollHeight - b.clientHeight - b.scrollTop) < 48;
}

function chatScrollBottom(){
  const box = $('#chatMsgs');
  if (box) box.scrollTop = box.scrollHeight;
}

/**
 * render() 换完 innerHTML 之后调用。
 *
 * <p>为什么必须放在渲染之后：换 innerHTML 会把滚动位置重置到 0，
 * 之前"打开会话 → 滚到底"是在 render 之前调的，等于白发功（容器还不能滚时看不出来，
 * 修好 flex 高度后才暴露）。
 *
 * <p>只有"该贴底"时才贴：用户翻历史翻到一半时，新消息不该把他拽回底部。
 */
function chatAfterRender(){
  const box = $('#chatMsgs');
  if (!box) return;
  // 贴底：滚到最新；不贴底（正在翻历史）：**恢复到渲染前的位置**。
  // 后者不能省：innerHTML 一换 scrollTop 就归零，等于用户正看着历史突然被弹回顶部。
  if (S.chat.stick === false) {
    box.scrollTop = S.chat.scrollTop || 0;
  } else {
    box.scrollTop = box.scrollHeight;
  }
  S.chat.scrollTop = box.scrollTop;
  // 150ms 内的 scroll 事件都是这次渲染引起的，不当作"用户翻到顶"
  S.chat.ignoreScrollUntil = Date.now() + 150;
}

function chatKey(e){
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); }
}

/**
 * 发消息。
 *
 * <p>V3 会在 wsOpen 时改走 WebSocket（本函数保留为**兜底通道**）：
 * WS 连不上时前端降级轮询，发送仍然走这里，聊天不会因为没配 Nginx 就半残。
 */
async function chatSend(){
  const el = $('#chatText');
  const body = String(el ? el.value : '').trim();
  if (!body) return;
  if (body.length > 2000) return toast('单条消息最多 2000 字');

  const toId = (S.chat.peer || {}).id;
  // 对端缺失 / 等于自己：绝对不能发（服务端也会拒），直接自愈一次
  if (!toId || String(toId) === String((S.user && S.user.id) || '')) {
    toast('会话信息异常，正在重新加载…');
    chatRetry();
    if (el) el.value = body;
    return;
  }

  el.value = '';

  // ① 先试 WebSocket（实时、有 ack）：气泡先以「发送中」占位，ack 回来再落定
  const clientMsgId = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  if (typeof chatWsSend === 'function' && chatWsSend(toId, body, clientMsgId)) {
    S.chat.pending = S.chat.pending || [];
    S.chat.pending.push({clientMsgId: clientMsgId, body: body, state: 'sending', at: Date.now()});
    S.chat.stick = true;          // 自己发的消息一定滚到底（渲染后由 chatAfterRender 执行）
    render();
    return;
  }

  // ② WS 不可用（没连上 / 已降级）→ 走 HTTP 兜底通道，用户完全无感
  try {
    const r = await api('/api/social/messages', {method:'POST', body:{toId: toId, body: body}});
    // 首次发消息时后端才建会话：把 convId 接过来
    if (r && r.convId && !S.chat.convId) {
      S.chat.convId = Number(r.convId);
      S.chat.pendingPeer = null;
      await loadChat();
      await chatLoadMessages();
    } else {
      S.chat.items.push({id: r.messageId, convId: r.convId, fromId: r.fromId, body: r.body,
                         type: r.type, createdAt: r.createdAt});
      S.chat.convs = (S.chat.convs || []).map(c2 => Number(c2.convId) === Number(r.convId)
        ? Object.assign({}, c2, {last: {id: r.messageId, fromMe: true, preview: r.body, type: r.type},
                                 lastMsgAt: r.createdAt, unread: 0})
        : c2);
    }
    S.chat.stick = true;
    render();
  } catch (e) {
    if (el) el.value = body;     // 失败把字还给用户，不要吞掉
    toast(chatErrText(e));
  }
}

async function chatMarkRead(){
  if (!S.chat.convId) return;
  const last = (S.chat.items || [])[(S.chat.items || []).length - 1];
  try {
    const sentOverWs = (typeof chatWsRead === 'function') && chatWsRead(S.chat.convId, last ? last.id : null);
    if (!sentOverWs) {
      await api('/api/social/conversations/' + S.chat.convId + '/read',
        {method:'POST', body: last ? {lastMsgId: last.id} : {}});
    }
    // 本地立刻反映：这个会话清零、角标相应减少
    const conv = (S.chat.convs || []).find(c2 => Number(c2.convId) === Number(S.chat.convId));
    if (conv && conv.unread) {
      S.chat.unread = Math.max(0, (S.chat.unread || 0) - Number(conv.unread));
      conv.unread = 0;
      reNav();
    }
  } catch (e) { /* 已读失败不影响读消息 */ }
}

// ==================== 小工具 ====================

/** 会话列表右上角的时间：今天只显示时:分，更早显示月-日 */
function chatShortTime(ms){
  if (!ms) return '';
  const d = new Date(Number(ms));
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '-' + d.getDate();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function chatErrText(e){
  const raw = String((e && e.message) || '');
  let code = '';
  try { code = JSON.parse(raw).code || ''; } catch (ignore) { code = ''; }
  const map = {
    NOT_FRIEND: '你们不是好友，不能发消息',
    INVALID_BODY: '消息不能为空',
    BODY_TOO_LONG: '单条消息最多 2000 字',
    NOT_MEMBER: '你不在这个会话里',
    CONV_NOT_FOUND: '会话不存在'
  };
  if (map[code]) return map[code];
  if (raw.indexOf('NOT_FRIEND') >= 0) return '你们不是好友，不能发消息';
  return '操作失败：' + (code || raw);
}
