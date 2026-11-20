import { defineStore } from 'pinia';
import { chatApi, socialApi, ApiError, API_BASE, getToken } from '../api.js';
import { useAuthStore } from './auth.js';
import {
  configureChatWs,
  setChatWsEnv,
  start as wsStart,
  stop as wsStop,
  isOpen as wsIsOpen,
  mode as wsMode,
  sendMessage as wsSendMessage,
  sendRead as wsSendRead
} from '../utils/chatWs.js';
import { toast } from '../utils/toast.js';

/** 一次拉多少条历史（与后端 PAGE_SIZE 对齐） */
export const CHAT_PAGE = 20;

/**
 * 私聊。
 *
 * 从旧 `chat.js` + `chat-ws.js` 移植，几条关键行为照抄，都是有 bug 换来的：
 *
 * 1. **未读由后端算**（Redis），前端不自己数；「标已读」只上报"读到哪条"。
 * 2. 「正在看」必须是 *停在消息页* 且 *打开的就是这个会话*。
 *    只比 convId 不够：离开消息页后 convId 仍保留，对方发来的消息会被当成已读 —— 红点永远不亮。
 * 3. 打开会话前**先把对端与消息清空**：残留会让标题显示成别人、发消息报失败。
 * 4. 发消息先试 WS（有 ack，气泡先"发送中"），WS 不可用回落 HTTP，用户无感。
 * 5. 换账号必须整个 reset（角标/会话/已读位置），否则串号。
 */
export const useChatStore = defineStore('chat', {
  state: () => ({
    convs: [],            // 后端返回的会话（有消息才有会话，顺序由后端给）
    friends: [],          // 好友列表：用来把「还没聊过」的好友补进消息列表
    unread: 0,            // 总未读（侧栏角标）
    convId: null,         // 当前打开的会话
    peer: null,           // 当前会话的对端
    pendingPeer: null,    // 还没有会话时（第一次聊天）先记住对方
    items: [],            // 当前会话的消息
    pending: [],          // 发送中/失败的占位气泡
    hasMore: false,
    loadingMore: false,
    error: '',
    stick: true,          // 是否贴着底部（翻历史时不能自动滚）
    scrollTop: 0,
    ignoreScrollUntil: 0,
    peerRead: {},         // convId → 对方读到的最后一条 id
    mode: 'connecting',   // live | polling | connecting
    lastSeen: {},           // convId → 最后一条消息 id（补拉用）
    onChatPage: false,      // 是否停在消息页（判断「正在看」用，见文件头注释 2）
    inited: false
  }),

  getters: {
    currentConv: (s) => (s.convs || []).find((c) => Number(c.convId) === Number(s.convId)) || null,

    /**
     * 会话列表 = 真会话（有消息的，按后端顺序） + 还没聊过的好友（合成行）。
     *
     * 为什么要合成：后端只在「第一条消息」时才建会话，所以刚加好友的人在「消息」里根本看不见，
     * 用户以为功能坏了（实际要去好友页点发消息）。后端不能改，就在前端把好友补进来，
     * 点开即进入 pendingPeer 状态，发第一条时由后端建会话。
     */
    listItems: (s) => {
      const real = (s.convs || []).map((c) => ({ ...c, synthetic: false }));
      const hasConvWith = new Set(real.map((c) => String((c.peer || {}).id || '')));
      const fake = (s.friends || [])
        .filter((f) => !hasConvWith.has(String(f.id)))
        .map((f) => ({
          convId: null,
          peer: { id: f.id, name: f.name },
          last: null,
          lastMsgAt: 0,
          unread: 0,
          synthetic: true
        }));
      return real.concat(fake);
    },
    myId: () => {
      const auth = useAuthStore();
      return (auth.user && auth.user.id) || '';
    },
    isMine: (s) => (m) => String(m.fromId) === String((useAuthStore().user || {}).id || '')
  },

  actions: {
    /** 只做一次的初始化（注入 WS 环境 + 回调）。由 App.vue 在启动时调用。 */
    init() {
      if (this.inited) return;
      this.inited = true;
      setChatWsEnv({ API_BASE, getToken });
      configureChatWs({
        onEvent: (m) => this.onEvent(m),
        onModeChange: (mo) => {
          this.mode = mo;
        },
        onPollTick: () => this.pollTick(),
        onResync: () => this.resync()
      });
    },

    /** 登录后调用：拉会话列表 + 建 WS（幂等） */
    async connect() {
      const auth = useAuthStore();
      if (!auth.user) return;
      this.init();
      await this.load();
      wsStart();
      this.mode = wsMode();
    },

    async load() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.convs = [];
        this.unread = 0;
        return;
      }
      try {
        // 会话与好友并行拉：好友用来补「还没聊过」的合成行（见 listItems 注释）
        const [r, fr] = await Promise.all([
          chatApi.conversations(),
          socialApi.friends().catch(() => null)
        ]);
        this.convs = (r && r.items) || [];
        this.unread = Number(r && r.unreadTotal) || 0;
        this.friends = (fr && fr.items) || [];
        // 当前会话不在列表里（换账号 / 会话已不存在）→ 作废，
        // 否则会拿着别的账号的 convId 去拉消息、标已读、发消息
        if (this.convId && !this.convs.some((x) => Number(x.convId) === Number(this.convId))) {
          this.convId = null;
          this.peer = null;
          this.items = [];
          this.error = '';
        }
      } catch (e) {
        this.error = errText(e);
      }
    },

    /** 只刷角标（轮询用） */
    async refreshUnread() {
      const auth = useAuthStore();
      if (!auth.user) {
        this.unread = 0;
        return 0;
      }
      try {
        const r = await chatApi.unreadCount();
        this.unread = Number(r && r.unread) || 0;
        return this.unread;
      } catch (e) {
        return this.unread;
      }
    },

    /** 进入消息页（侧栏点「消息」） */
    async enter() {
      await this.load();
      if (this.convId) await this.open(this.convId);   // 重拉最新 + 标已读
    },

    /** 打开已有会话 */
    async open(convId) {
      this.convId = Number(convId);
      this.pendingPeer = null;
      this.stick = true;
      this.error = '';
      // 对端与消息都不允许从上一次残留（旧版这里踩过：标题是别人、发消息失败、红点消不掉）
      const hit = (this.convs || []).find((x) => Number(x.convId) === Number(convId));
      this.peer = hit ? hit.peer : null;
      this.items = [];
      await this.loadMessages();
      if (this.error) return;
      await this.markRead();
    },

    /** 还没有会话时先记住对方（从好友页「发消息」进来） */
    openWith(userId, name) {
      this.convId = null;
      this.peer = { id: userId, name: name || userId };
      this.pendingPeer = { id: userId, name: name || userId };
      this.items = [];
      this.hasMore = false;
      this.stick = true;
    },

    async loadMessages(beforeId) {
      if (!this.convId) {
        this.items = [];
        return;
      }
      try {
        const r = await chatApi.messages(this.convId, beforeId);
        if (beforeId) {
          this.items = ((r && r.items) || []).concat(this.items || []);
        } else {
          this.items = (r && r.items) || [];
          if (r && r.peer) this.peer = r.peer;
        }
        this.hasMore = !!(r && r.hasMore);
        const last = this.items[this.items.length - 1];
        if (last) this.markSeen(this.convId, last.id);
        this.error = '';

        // 一致性兜底：列表说"有最近一条消息"，服务端却给空历史 → 本地列表过时了，重拉一次
        if (!beforeId && !this.items.length) {
          const row = (this.convs || []).find((x) => Number(x.convId) === Number(this.convId));
          if (row && row.last) await this.load();
        }
      } catch (e) {
        if (!beforeId) this.items = [];   // 失败不能留着上一条会话的消息当历史
        this.error = errText(e);
        toast(this.error);
      }
    },

    async loadMore() {
      const first = (this.items || [])[0];
      if (!first || this.loadingMore) return;
      this.loadingMore = true;
      this.stick = false;                  // 正在翻历史，别自动贴底
      await this.loadMessages(Number(first.id));
      this.loadingMore = false;
    },

    markSeen(convId, msgId) {
      const id = Number(msgId) || 0;
      if (!convId) return;
      if (!this.lastSeen[convId] || id > this.lastSeen[convId]) this.lastSeen[convId] = id;
    },

    async markRead() {
      if (!this.convId) return;
      const last = (this.items || [])[this.items.length - 1];
      try {
        const viaWs = wsSendRead(this.convId, last ? last.id : null);
        if (!viaWs) await chatApi.markRead(this.convId, last ? last.id : null);
        // 本地立刻反映：这个会话清零、总角标相应减少
        const conv = (this.convs || []).find((c) => Number(c.convId) === Number(this.convId));
        if (conv && conv.unread) {
          this.unread = Math.max(0, (this.unread || 0) - Number(conv.unread));
          conv.unread = 0;
        }
      } catch (e) {
        /* 已读失败不影响读消息 */
      }
    },

    /** 发消息：先 WS，失败回落 HTTP */
    async send(body) {
      const text = String(body || '').trim();
      if (!text) return false;
      if (text.length > 2000) {
        toast('单条消息最多 2000 字');
        return false;
      }
      const toId = (this.peer || {}).id;
      // 对端缺失 / 等于自己：绝不能发（服务端也会拒），先自愈一次
      if (!toId || String(toId) === String(this.myId)) {
        toast('会话信息异常，正在重新加载…');
        await this.load();
        if (this.convId) await this.open(this.convId);
        return false;
      }

      const clientMsgId = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      if (wsSendMessage(toId, text, clientMsgId)) {
        this.pending.push({ clientMsgId, body: text, state: 'sending', at: Date.now() });
        this.stick = true;
        return true;
      }

      // WS 不可用 → HTTP 兜底，用户无感
      try {
        const r = await chatApi.send(toId, text);
        if (r && r.convId && !this.convId) {
          this.convId = Number(r.convId);
          this.pendingPeer = null;
          await this.load();
          await this.loadMessages();
        } else {
          this.items.push({
            id: r.messageId,
            convId: r.convId,
            fromId: r.fromId,
            body: r.body,
            type: r.type,
            createdAt: r.createdAt
          });
          this.convs = this.convs.map((c) =>
            Number(c.convId) === Number(r.convId)
              ? { ...c, last: { id: r.messageId, fromMe: true, preview: r.body, type: r.type }, lastMsgAt: r.createdAt, unread: 0 }
              : c
          );
        }
        this.stick = true;
        return true;
      } catch (e) {
        toast(errText(e));
        return false;
      }
    },

    // ==================== WS / 轮询事件 ====================

    /** 收到一帧 */
    onEvent(m) {
      if (!m || !m.type) return;
      switch (m.type) {
        case 'msg':
          if (m.message) this.incoming(m.message);
          break;
        case 'ack':
          this.onAck(m);
          break;
        case 'read':
          this.peerRead[Number(m.convId)] = Number(m.lastMsgId) || 0;
          break;
        case 'error':
          if (m.clientMsgId) this.onSendFailed(m.clientMsgId, m.code);
          else toast('消息发送失败：' + (m.code || '未知错误'));
          break;
        case 'friend_request':
        case 'friend_accepted':
          this.refreshUnread();
          if (m.type === 'friend_accepted') toast('你们已经成为好友');
          break;
        default:
          break;
      }
    },

    /** 收到新消息 */
    incoming(m) {
      if (!m || !m.convId) return;
      const convId = Number(m.convId);
      this.markSeen(convId, m.id || m.messageId);
      const mine = String(m.fromId) === String(this.myId);
      // 「正在看」= 停在消息页 且 打开的就是这个会话（见文件头注释 2）
      const viewing = this.onChatPage && Number(this.convId) === convId;

      if (viewing) {
        const id = m.id || m.messageId;
        if (!(this.items || []).some((x) => Number(x.id) === Number(id))) {
          this.items.push({
            id,
            convId,
            fromId: m.fromId,
            type: m.type || 'TEXT',
            body: m.body,
            payload: m.payload,
            createdAt: m.createdAt
          });
        }
        if (!mine) this.markRead();     // 正在看 → 立刻标已读，不给自己亮红点
      }

      const conv = (this.convs || []).find((x) => Number(x.convId) === convId);
      if (conv) {
        conv.last = { id: m.id || m.messageId, fromMe: mine, preview: m.body, type: m.type || 'TEXT' };
        conv.lastMsgAt = m.createdAt;
        if (!mine && !viewing) conv.unread = (Number(conv.unread) || 0) + 1;
        this.convs = [conv].concat(this.convs.filter((x) => Number(x.convId) !== convId));
      } else {
        this.load();     // 新会话（对方第一次给我发消息）→ 重拉列表
      }
      this.unread = this.convs.reduce((s, x) => s + (Number(x.unread) || 0), 0);
    },

    /** 发送回执：把「发送中」换成真消息 */
    async onAck(m) {
      const p = this.pending.find((x) => x.clientMsgId === m.clientMsgId);
      // 首次和某人聊天：convId 只在这个 ack 里第一次出现，不接住就会一直停在 pendingPeer
      if (!this.convId && m.convId) {
        this.convId = Number(m.convId);
        this.pendingPeer = null;
        this.markSeen(this.convId, m.messageId);
        this.pending = this.pending.filter((x) => x.clientMsgId !== m.clientMsgId);
        await this.load();
        await this.loadMessages();
        this.stick = true;
        return;
      }
      this.markSeen(m.convId, m.messageId);
      if (Number(this.convId) === Number(m.convId)) {
        if (!(this.items || []).some((x) => Number(x.id) === Number(m.messageId))) {
          this.items.push({
            id: m.messageId,
            convId: m.convId,
            fromId: this.myId,
            type: 'TEXT',
            body: (p && p.body) || '',
            createdAt: m.createdAt
          });
        }
      }
      this.pending = this.pending.filter((x) => x.clientMsgId !== m.clientMsgId);
      this.stick = true;
    },

    /** 发送失败：保留气泡标红，不自动重试（避免用户不知情地发两遍） */
    onSendFailed(clientMsgId, code) {
      const p = this.pending.find((x) => x.clientMsgId === clientMsgId);
      if (!p) return;
      this.pending = this.pending.filter((x) => x.clientMsgId !== clientMsgId);
      this.pending.push({ clientMsgId, body: p.body, state: 'failed', at: Date.now() });
      toast(errText({ message: JSON.stringify({ code }) }));
    },

    /** 降级轮询：只拉当前会话的新消息 + 角标 */
    async pollTick() {
      this.refreshUnread();
      if (!this.convId) return;
      try {
        const after = this.lastSeen[this.convId] || 0;
        const r = await chatApi.messagesAfter(this.convId, after);
        const items = (r && r.items) || [];
        for (const m of items) this.incoming(m);
      } catch (e) {
        /* 轮询失败静默，下一轮再试 */
      }
    },

    /** 重连成功：补拉当前会话 + 刷新列表 */
    async resync() {
      if (this.convId) {
        try {
          const after = this.lastSeen[this.convId] || 0;
          const r = await chatApi.messagesAfter(this.convId, after);
          for (const m of (r && r.items) || []) this.incoming(m);
        } catch (e) {
          /* 忽略 */
        }
      }
      await this.load();
    },

    stop() {
      wsStop();
    },

    /** 换账号 / 退出：一切归零（由 auth.resetAll 调用） */
    reset() {
      wsStop();
      this.convs = [];
      this.friends = [];
      this.unread = 0;
      this.convId = null;
      this.peer = null;
      this.pendingPeer = null;
      this.items = [];
      this.pending = [];
      this.hasMore = false;
      this.error = '';
      this.peerRead = {};
      this.lastSeen = {};
      this.mode = 'connecting';
    }
  }
});

/** 后端错误体 {code,message} → 人话 */
function errText(e) {
  const code = e instanceof ApiError ? e.code : '';
  const raw = String((e && e.message) || '');
  let parsed = '';
  try {
    parsed = JSON.parse(raw).code || '';
  } catch (ignore) {
    parsed = '';
  }
  const key = code || parsed;
  const map = {
    NOT_FRIEND: '你们不是好友，不能发消息',
    INVALID_BODY: '消息不能为空',
    BODY_TOO_LONG: '单条消息最多 2000 字',
    NOT_MEMBER: '你不在这个会话里',
    CONV_NOT_FOUND: '会话不存在',
    USER_NOT_FOUND: '这个人不存在'
  };
  if (map[key]) return map[key];
  if (raw.indexOf('NOT_FRIEND') >= 0) return '你们不是好友，不能发消息';
  return '操作失败：' + (key || raw);
}
