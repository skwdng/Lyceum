package com.siyige.social.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.social.ChatPusher;
import com.siyige.social.ChatService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 私聊的 WebSocket 处理器：连接登记 / 收帧分发 / 推送 / 断开清理。
 *
 * <h3>为什么用 TextWebSocketHandler</h3>
 * 它已经处理了二进制帧、分片帧的边界，我们只需要关心「收到一段文本 JSON」。
 *
 * <h3>一个用户可能有多个连接</h3>
 * 手机 + 电脑同时在线是常态（验收 #27 明确要求两端都能收到），
 * 所以 Map 的值是 Set，推送时给每一端都发一份。
 *
 * <h3>三个必须做对的细节</h3>
 * <ol>
 *   <li><b>装饰器</b>：原生 {@code WebSocketSession} 不是线程安全的，两个线程同时 send 会抛
 *       {@code IllegalStateException: TEXT_PARTIAL_WRITING}。必须用
 *       {@link ConcurrentWebSocketSessionDecorator} 包一层（内部有锁 + 排队）。</li>
 *   <li><b>ack 走装饰器</b>：{@code handleTextMessage} 拿到的 session 是原始对象
 *       （容器回调传的），回 ack 时也要发到装饰器上，否则又绕开了锁。
 *       所以这里额外维护 {@code sessionId → 装饰器}。</li>
 *   <li><b>断开清理</b>：{@code afterConnectionClosed} 收到的仍是原始 session，
 *       要用 id 找到装饰器再移除，否则连接泄漏（验收 #29 连续开关 10 次连接数要归零）。</li>
 * </ol>
 *
 * <h3>协议</h3>
 * <pre>
 * 客户端 → 服务端：{"type":"send","toId","body","clientMsgId"} / {"type":"read","convId","lastMsgId"} / {"type":"ping"}
 * 服务端 → 客户端：{"type":"ack","clientMsgId","messageId","convId","createdAt"} /
 *                  {"type":"msg","message":{...}} / {"type":"read","convId","lastMsgId"} /
 *                  {"type":"pong"} / {"type":"error","code":"NOT_FRIEND"}
 * </pre>
 *
 * <p>本类实现 {@link ChatPusher}：这样 {@code ChatService} 与 Handler 之间隔着一层接口，
 * 不会形成构造器循环依赖（Service 要推送 → 依赖 Pusher；Handler 收到帧 → 依赖 Service）。
 */
@Component
public class ChatWsHandler extends TextWebSocketHandler implements ChatPusher {

    private static final Logger log = LoggerFactory.getLogger(ChatWsHandler.class);

    /** 发送超时 5 秒、单连接缓冲上限 128KB（消息本身限 2000 字，远小于此）。 */
    static final int SEND_TIME_LIMIT_MS = 5000;
    static final int SEND_BUFFER_LIMIT = 128 * 1024;

    /** userId → 该用户的所有在线连接（装饰器包装后的） */
    private final Map<String, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    /** sessionId → 同一个装饰器（原始 session 回调时用来找回它） */
    private final Map<String, WebSocketSession> decorators = new ConcurrentHashMap<>();

    private final ObjectMapper json;
    private final ChatService chat;

    public ChatWsHandler(ObjectMapper json, ChatService chat) {
        this.json = json;
        this.chat = chat;
    }

    // ==================== 生命周期 ====================

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String userId = (String) session.getAttributes().get("userId");
        if (userId == null) {
            // 理论上不可能：拦截器不放行就不会走到这
            closeQuietly(session, CloseStatus.POLICY_VIOLATION);
            return;
        }
        WebSocketSession safe = decorate(session);
        decorators.put(session.getId(), safe);
        sessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(safe);
        log.info("WS 已连接 userId={} 该用户当前连接数={}", userId, sessions.get(userId).size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String userId = (String) session.getAttributes().get("userId");
        WebSocketSession out = decorators.getOrDefault(session.getId(), session);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> in = json.readValue(message.getPayload(), Map.class);
            String type = String.valueOf(in.get("type"));
            switch (type) {
                // 心跳：只回 pong，不落库。前端 25 秒一次，用来保活 + 探测假死
                case "ping" -> send(out, Map.of("type", "pong"));

                // 发消息：业务在 ChatService（与 HTTP 通道共用同一套事务）
                case "send" -> {
                    Map<String, Object> msg = chat.sendFromFrame(userId, in);
                    Map<String, Object> ack = new LinkedHashMap<>();
                    ack.put("type", "ack");
                    ack.put("clientMsgId", in.get("clientMsgId"));
                    ack.put("messageId", msg.get("messageId"));
                    ack.put("convId", msg.get("convId"));
                    ack.put("createdAt", msg.get("createdAt"));
                    send(out, ack);
                }

                // 已读回执：写库 + 推给对方（对方页面显示「已读」）
                case "read" -> {
                    long convId = num(in.get("convId"));
                    Long lastMsgId = in.get("lastMsgId") == null ? null : num(in.get("lastMsgId"));
                    chat.markRead(userId, convId, lastMsgId);
                }

                // 未知类型：回错误但不关连接（关连接会让前端以为掉线了）
                default -> send(out, Map.of("type", "error", "code", "UNKNOWN_TYPE"));
            }
        } catch (IllegalArgumentException e) {
            // 业务拒绝（非好友 / 内容不合法 / 越权）：把 code 原样回给前端
            String code = codeOf(e.getMessage());
            log.info("WS 业务拒绝 userId={} code={}", userId, code);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("type", "error");
            err.put("code", code);
            err.put("clientMsgId", clientMsgIdSafe(message.getPayload()));
            send(out, err);
        } catch (Exception e) {
            // 单条消息出错不能影响连接本身
            log.warn("WS 消息处理失败 userId={} 原因={}", userId, e.toString());
            send(out, Map.of("type", "error", "code", "BAD_MESSAGE"));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = (String) session.getAttributes().get("userId");
        WebSocketSession safe = decorators.remove(session.getId());
        if (userId != null) {
            Set<WebSocketSession> set = sessions.get(userId);
            if (set != null) {
                // 移除的必须是装饰器对象：上面 add 的就是它
                if (safe != null) set.remove(safe);
                set.removeIf(s -> !s.isOpen());     // 兜一层：顺手清掉已关闭的
                if (set.isEmpty()) sessions.remove(userId);
            }
        }
        log.info("WS 已断开 userId={} code={} 剩余连接={}", userId,
                status == null ? "-" : status.getCode(),
                userId == null ? 0 : sessions.getOrDefault(userId, Set.of()).size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("WS 传输错误（连接会自行关闭）: {}", exception.toString());
    }

    // ==================== 推送（实现 ChatPusher） ====================

    /**
     * 给某个用户的所有端推一条事件。用户不在线就什么都不做——
     * 消息已经进库，下次上线靠 afterId 补拉（决策 2 的兜底）。
     */
    @Override
    public void push(String userId, Map<String, Object> event) {
        if (userId == null) return;
        Set<WebSocketSession> set = sessions.get(userId);
        if (set == null || set.isEmpty()) return;
        for (WebSocketSession s : set) send(s, event);
    }

    /** 在线连接数（运维 / 自检用：连续开关页面后它必须归零）。 */
    public int onlineConnections() {
        return sessions.values().stream().mapToInt(Set::size).sum();
    }

    /** 当前有多少个用户在线。 */
    public int onlineUsers() {
        return sessions.size();
    }

    // ==================== 内部 ====================

    private void send(WebSocketSession s, Map<String, Object> event) {
        try {
            if (s.isOpen()) s.sendMessage(new TextMessage(json.writeValueAsString(event)));
        } catch (Exception e) {
            // 推不出去只可能是连接已断，交给 afterConnectionClosed 清理，这里不抛
            log.debug("WS 推送失败（连接可能已断）: {}", e.toString());
        }
    }

    /** 单独抽出来便于单测替换（测试里用 mock session 包一层即可）。 */
    WebSocketSession decorate(WebSocketSession session) {
        return new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT);
    }

    private static void closeQuietly(WebSocketSession s, CloseStatus status) {
        try {
            s.close(status);
        } catch (Exception ignore) {
            // 关闭失败无所谓，容器最终会清理
        }
    }

    /** 从 "CODE: 中文" 里取错误码；取不到就 INVALID_PARAM。 */
    private static String codeOf(String msg) {
        if (msg == null) return "INVALID_PARAM";
        int i = msg.indexOf(':');
        String code = i > 0 ? msg.substring(0, i).trim() : msg.trim();
        return code.matches("[A-Z][A-Z0-9_]*") ? code : "INVALID_PARAM";
    }

    /** 失败帧也把 clientMsgId 带回去，前端才能把那条气泡标成「发送失败」（而不是永远转圈）。 */
    private String clientMsgIdSafe(String payload) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> in = json.readValue(payload, Map.class);
            return in.get("clientMsgId") == null ? null : String.valueOf(in.get("clientMsgId"));
        } catch (Exception e) {
            return null;
        }
    }

    private static long num(Object o) {
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            return 0;
        }
    }
}
