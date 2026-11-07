/* 私聊 WebSocket 连接管理（V3）
 * 归属：见 docs/协作规范.md 接口点表
 *
 * 职责只有四件事：
 *   1. 连接与鉴权（令牌走 ?token=，浏览器 WS 不能设置请求头）
 *   2. 心跳（25 秒）—— 小于 Nginx 默认 60 秒空闲超时，连接不会被"莫名其妙"掐断
 *   3. 重连（指数退避 1→30 秒）+ 重连后按 afterId 补拉，一条不落
 *   4. **轮询兜底**：连续失败 3 次就切到每 3 秒拉一次；WS 恢复后自动切回
 *
 * 为什么必须有第 4 条（决策 2）：本地开发不受 Nginx 影响；线上在改好 Nginx 之前，
 * 靠轮询也能把聊天跑起来，延迟 ≤3 秒。此时**发送走 HTTP**（POST /api/social/messages），
 * 所以"收"和"发"两条腿都在。
 */

const ChatWs = {
  ws: null,
  /** idle | connecting | open | degraded */
  state: 'idle',
  /** 连续失败次数：到 3 就降级轮询 */
  failCount: 0,
  /** 当前退避间隔（毫秒） */
  backoff: 1000,
  hbTimer: null,
  pollTimer: null,
  reconnectTimer: null,
  /** 心跳发出后是否收到 pong（判断假死） */
  pongSeen: true,
  /** 每个会话最后一条消息 id：重连/轮询补拉用 */
  lastSeen: {},
  /** 已发出但还没 ack 的消息：clientMsgId → {toId, body, at} */
  pending: {}
};

const CHAT_WS_BACKOFF_MAX = 30000;
const CHAT_WS_HB_MS = 25000;
const CHAT_POLL_FALLBACK_MS = 3000;
const CHAT_WS_FAIL_TO_DEGRADE = 3;

/** 拼接 WS 地址：**必须和 API_BASE 用同一套前缀**（线上是 /siyige） */
function chatWsUrl(){
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = localStorage.getItem('sy_jwt') || '';
  return proto + '://' + location.host + API_BASE + '/ws/chat?token=' + encodeURIComponent(token);
}

/**
 * 当前实际用的是哪条通道（给 UI / 自检用）。
 *
 * <p>为什么不直接看 {@code state}：重连过程中它会在 connecting/degraded 之间来回变，
 * 外部拿它做判断会闪。这里按"事实"给结论：轮询定时器活着 = 正在靠轮询。
 *
 * @returns 'live'（WebSocket 通） | 'polling'（降级轮询中） | 'connecting'
 */
function chatWsMode(){
  if (ChatWs.pollTimer) return 'polling';
  if (chatWsIsOpen()) return 'live';
  return 'connecting';
}

function chatWsIsOpen(){
  return ChatWs.state === 'open' && ChatWs.ws && ChatWs.ws.readyState === 1;
}

/** 登录后启动（render() 每次都调，幂等）；登出时 stop。 */
function chatWsStart(){
  if (!S.user) { chatWsStop(); return; }
  if (ChatWs.state === 'open' || ChatWs.state === 'connecting') return;
  chatWsConnect();
}

function chatWsStop(){
  chatWsClearTimers();
  if (ChatWs.ws) {
    try { ChatWs.ws.onclose = null; ChatWs.ws.close(); } catch (e) {}
    ChatWs.ws = null;
  }
  ChatWs.state = 'idle';
  ChatWs.failCount = 0;
  ChatWs.backoff = 1000;
}

function chatWsClearTimers(){
  if (ChatWs.hbTimer) { clearInterval(ChatWs.hbTimer); ChatWs.hbTimer = null; }
  if (ChatWs.pollTimer) { clearInterval(ChatWs.pollTimer); ChatWs.pollTimer = null; }
  if (ChatWs.reconnectTimer) { clearTimeout(ChatWs.reconnectTimer); ChatWs.reconnectTimer = null; }
}

function chatWsConnect(){
  if (!S.user) return;
  chatWsClearTimers();
  ChatWs.state = 'connecting';
  let ws;
  try {
    ws = new WebSocket(chatWsUrl());
  } catch (e) {
    chatWsOnDown('构造失败');
    return;
  }
  ChatWs.ws = ws;

  ws.onopen = function(){
    ChatWs.state = 'open';
    ChatWs.failCount = 0;
    ChatWs.backoff = 1000;
    ChatWs.pongSeen = true;
    chatWsStopPolling();          // 恢复实时：把兜底轮询关掉
    chatWsStartHeartbeat();
    chatWsResync();               // 断线期间可能漏消息 → 按 afterId 补齐
    if (S.view === 'chat') render();
  };

  ws.onmessage = function(e){
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    chatWsOnEvent(m);
  };

  ws.onerror = function(){
    // onerror 之后一定会跟 onclose，统一在 onclose 里处理
  };

  ws.onclose = function(){
    ChatWs.ws = null;
    if (ChatWs.state !== 'idle') chatWsOnDown('连接断开');
  };
}

/** 连不上 / 断开：计数 + 退避重连 + 必要时降级轮询 */
function chatWsOnDown(why){
  ChatWs.failCount += 1;
  ChatWs.state = 'connecting';
  if (ChatWs.hbTimer) { clearInterval(ChatWs.hbTimer); ChatWs.hbTimer = null; }
  if (S.view === 'chat') render();

  if (ChatWs.failCount >= CHAT_WS_FAIL_TO_DEGRADE) {
    chatWsStartPolling();         // 连续 3 次失败：先用轮询把聊天跑起来
  }
  const wait = Math.min(CHAT_WS_BACKOFF_MAX, ChatWs.backoff);
  ChatWs.backoff = Math.min(CHAT_WS_BACKOFF_MAX, ChatWs.backoff * 2);
  ChatWs.reconnectTimer = setTimeout(chatWsConnect, wait);
  console.debug('[chat-ws] ' + why + '，' + wait + 'ms 后重连（第 ' + ChatWs.failCount + ' 次）');
}

// ==================== 心跳 ====================

function chatWsStartHeartbeat(){
  if (ChatWs.hbTimer) clearInterval(ChatWs.hbTimer);
  ChatWs.hbTimer = setInterval(function(){
    if (!chatWsIsOpen()) return;
    // 上一轮心跳没回 pong：说明连接假死（网络切换常见），主动断开触发重连
    if (!ChatWs.pongSeen) {
      try { ChatWs.ws.close(); } catch (e) {}
      return;
    }
    ChatWs.pongSeen = false;
    chatWsSendRaw({type:'ping'});
  }, CHAT_WS_HB_MS);
}

// ==================== 轮询兜底 ====================

function chatWsStartPolling(){
  // 先置状态再判重：chatWsOnDown 里前面刚把 state 设成 'connecting'，
  // 如果这里被"定时器已存在"提前 return，state 就会停在 connecting（自检 W7 抓到过）。
  ChatWs.state = 'degraded';
  if (S.view === 'chat') render();
  if (ChatWs.pollTimer) return;
  ChatWs.pollTimer = setInterval(function(){
    refreshChatUnread();
    if (S.chat.convId) chatWsPollOpenConversation();
  }, CHAT_POLL_FALLBACK_MS);
  console.debug('[chat-ws] 已降级为 3 秒轮询');
}

function chatWsStopPolling(){
  if (ChatWs.pollTimer) { clearInterval(ChatWs.pollTimer); ChatWs.pollTimer = null; }
  if (ChatWs.state === 'degraded') ChatWs.state = 'open';
}

/** 轮询时只拉「当前打开的会话」的新消息（afterId），不拉全部历史 */
async function chatWsPollOpenConversation(){
  if (!S.chat.convId) return;
  try {
    const after = ChatWs.lastSeen[S.chat.convId] || 0;
    const r = await api('/api/social/messages?convId=' + S.chat.convId + '&afterId=' + after);
    const items = (r && r.items) || [];
    if (!items.length) return;
    for (const m of items) chatOnIncomingMessage(m);
    if (S.view === 'chat') render();
  } catch (e) { /* 轮询失败静默：下一轮再试 */ }
}

// ==================== 重连补拉 ====================

/** 重连成功后：当前会话按 afterId 补齐 + 刷新会话列表/角标 */
async function chatWsResync(){
  if (S.chat.convId) {
    try {
      const after = ChatWs.lastSeen[S.chat.convId] || 0;
      const r = await api('/api/social/messages?convId=' + S.chat.convId + '&afterId=' + after);
      for (const m of ((r && r.items) || [])) chatOnIncomingMessage(m);
    } catch (e) {}
  }
  await loadChat();
  if (S.view === 'chat') render();
}

// ==================== 发送 ====================

function chatWsSendRaw(obj){
  if (!chatWsIsOpen()) return false;
  try {
    ChatWs.ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 发消息：WS 开着就走 WS，否则返回 false（调用方回落 HTTP）。
 *
 * @param clientMsgId 前端生成的临时 id，ack 时用它把气泡从「发送中」翻成「已发送」
 */
function chatWsSend(toId, body, clientMsgId){
  if (!chatWsIsOpen()) return false;
  const ok = chatWsSendRaw({type:'send', toId:toId, body:body, clientMsgId:clientMsgId});
  if (ok) ChatWs.pending[clientMsgId] = {toId: toId, body: body, at: Date.now()};
  return ok;
}

function chatWsRead(convId, lastMsgId){
  if (!chatWsIsOpen() || !convId) return false;
  return chatWsSendRaw({type:'read', convId: Number(convId), lastMsgId: lastMsgId || null});
}

// ==================== 收帧 ====================

function chatWsOnEvent(m){
  if (!m || !m.type) return;
  switch (m.type) {
    case 'pong':
      ChatWs.pongSeen = true;
      break;

    case 'msg':
      if (m.message) {
        chatOnIncomingMessage(m.message);
        if (S.view === 'chat' && Number(m.message.convId) === Number(S.chat.convId)) chatScrollBottom();
        if (S.view === 'chat') render();
      }
      break;

    case 'ack':
      delete ChatWs.pending[m.clientMsgId];
      chatOnAck(m);
      break;

    case 'read':
      chatOnPeerRead(m.convId, m.lastMsgId);
      break;

    case 'error':
      // 发送失败：把那条气泡标成失败（不自动重试，让用户看得见、自己决定）
      if (m.clientMsgId) chatOnSendFailed(m.clientMsgId, m.code);
      else toast('消息发送失败：' + (m.code || '未知错误'));
      break;

    case 'friend_request':
    case 'friend_accepted':
      // 好友类事件：刷新角标与好友页（V1 的通知也会来一条，这里只是让界面立刻反映）
      refreshUnread();
      if (S.view === 'friends') loadFriends();
      if (m.type === 'friend_accepted') toast('你们已经成为好友');
      break;

    default:
      break;
  }
}

// ==================== 兼容：WS 不可用时也要能"收"（角标 30 秒轮询已在 core.js） ====================

/** 记录某个会话已看到的最新 id（重连补拉与轮询都用它） */
function chatMarkSeen(convId, msgId){
  const id = Number(msgId) || 0;
  if (!convId) return;
  if (!ChatWs.lastSeen[convId] || id > ChatWs.lastSeen[convId]) ChatWs.lastSeen[convId] = id;
}
