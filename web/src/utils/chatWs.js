/**
 * 私聊 WebSocket 客户端（移植自旧 `js/chat-ws.js`，行为逐条对齐）。
 *
 * 职责仍然只有四件事：
 *   1. 连接与鉴权（令牌走 ?token=，浏览器 WS 不能设请求头）
 *   2. 心跳 25s（小于 Nginx 默认 60s 空闲超时，连接不会被莫名掐断）
 *   3. 重连：指数退避 1→30s，连上后按 afterId 补拉，一条不落
 *   4. **轮询兜底**：连续失败 3 次切到 3s 轮询；WS 恢复后自动切回
 *
 * ⚠️ 迁移期硬约束（坑 #4）：**同一时间只允许一条 WS 连接**。
 * 本客户端是"单例"（模块级），start() 幂等；旧前端的 chat 入口已切到新版
 * （见 core.js 的 go('chat') 重定向），旧页因此不再建立 WS。
 *
 * 与 store 的关系：本文件不 import store（避免循环依赖），
 * 由 `stores/chat.js` 在 init 时注入回调。
 */

const BACKOFF_MAX = 30000;
const HB_MS = 25000;
const POLL_MS = 3000;
const FAIL_TO_DEGRADE = 3;

const state = {
  ws: null,
  /** idle | connecting | open | degraded */
  status: 'idle',
  failCount: 0,
  backoff: 1000,
  hbTimer: null,
  pollTimer: null,
  reconnectTimer: null,
  pongSeen: true
};

const handlers = {
  /** 收到一帧（已解析） */
  onEvent: () => {},
  /** 通道状态变化：live / polling / connecting */
  onModeChange: () => {},
  /** 降级轮询每 3 秒触发一次（由 store 决定拉什么） */
  onPollTick: () => {},
  /** 重连成功后补拉 */
  onResync: () => {}
};

export function configureChatWs(h) {
  Object.assign(handlers, h || {});
}

/** WS 地址：**必须和 API_BASE 用同一套前缀**（线上是 /siyige） */
function wsUrl() {
  const { API_BASE, getToken } = apiRef;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return proto + '://' + location.host + API_BASE + '/ws/chat?token=' + encodeURIComponent(getToken() || '');
}

// 避免 chatWs ↔ api.js 的循环 import：由 init 注入 API_BASE 与取 token 的方法
const apiRef = { API_BASE: '', getToken: () => '' };
export function setChatWsEnv(env) {
  Object.assign(apiRef, env || {});
}

export function isOpen() {
  return state.status === 'open' && state.ws && state.ws.readyState === 1;
}

/** 事实意义上的通道：polling > live > connecting（重连中的摇摆状态不对外暴露） */
export function mode() {
  if (state.pollTimer) return 'polling';
  if (isOpen()) return 'live';
  return 'connecting';
}

function clearTimers() {
  if (state.hbTimer) {
    clearInterval(state.hbTimer);
    state.hbTimer = null;
  }
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

export function start() {
  if (state.status === 'open' || state.status === 'connecting') return;
  connect();
}

export function stop() {
  clearTimers();
  if (state.ws) {
    try {
      state.ws.onclose = null;
      state.ws.close();
    } catch (e) {
      /* 忽略 */
    }
    state.ws = null;
  }
  state.status = 'idle';
  state.failCount = 0;
  state.backoff = 1000;
  handlers.onModeChange(mode());
}

function connect() {
  clearTimers();
  state.status = 'connecting';
  let ws;
  try {
    ws = new WebSocket(wsUrl());
  } catch (e) {
    onDown('构造失败');
    return;
  }
  state.ws = ws;

  ws.onopen = () => {
    state.status = 'open';
    state.failCount = 0;
    state.backoff = 1000;
    state.pongSeen = true;
    stopPolling();
    startHeartbeat();
    handlers.onModeChange(mode());
    handlers.onResync();      // 断线期间可能漏消息
  };

  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch (err) {
      return;
    }
    if (m && m.type === 'pong') state.pongSeen = true;
    handlers.onEvent(m);
  };

  ws.onerror = () => {
    // onerror 之后一定跟 onclose，统一在那里处理
  };

  ws.onclose = () => {
    state.ws = null;
    if (state.status !== 'idle') onDown('连接断开');
  };
}

function onDown(why) {
  state.failCount += 1;
  state.status = 'connecting';
  if (state.hbTimer) {
    clearInterval(state.hbTimer);
    state.hbTimer = null;
  }
  handlers.onModeChange(mode());

  if (state.failCount >= FAIL_TO_DEGRADE) startPolling();   // 先用轮询把聊天跑起来

  const wait = Math.min(BACKOFF_MAX, state.backoff);
  state.backoff = Math.min(BACKOFF_MAX, state.backoff * 2);
  state.reconnectTimer = setTimeout(connect, wait);
  console.debug('[chat-ws] ' + why + '，' + wait + 'ms 后重连（第 ' + state.failCount + ' 次）');
}

function startHeartbeat() {
  if (state.hbTimer) clearInterval(state.hbTimer);
  state.hbTimer = setInterval(() => {
    if (!isOpen()) return;
    // 上一轮心跳没回 pong：连接假死（切网常见），主动断开触发重连
    if (!state.pongSeen) {
      try {
        state.ws.close();
      } catch (e) {
        /* 忽略 */
      }
      return;
    }
    state.pongSeen = false;
    sendRaw({ type: 'ping' });
  }, HB_MS);
}

function startPolling() {
  // 先置状态再判重：否则 status 会停在 connecting（旧版自检 W7 抓到过）
  state.status = 'degraded';
  handlers.onModeChange(mode());
  if (state.pollTimer) return;
  state.pollTimer = setInterval(() => handlers.onPollTick(), POLL_MS);
  console.debug('[chat-ws] 已降级为 3 秒轮询');
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  if (state.status === 'degraded') state.status = 'open';
  handlers.onModeChange(mode());
}

export function sendRaw(obj) {
  if (!isOpen()) return false;
  try {
    state.ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

/** 发消息：WS 通就走 WS，否则返回 false（调用方回落 HTTP，用户无感） */
export function sendMessage(toId, body, clientMsgId) {
  if (!isOpen()) return false;
  return sendRaw({ type: 'send', toId, body, clientMsgId });
}

export function sendRead(convId, lastMsgId) {
  if (!isOpen() || !convId) return false;
  return sendRaw({ type: 'read', convId: Number(convId), lastMsgId: lastMsgId || null });
}
