package com.siyige.social.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.social.ChatService;
import com.siyige.social.SocialTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * WebSocket 处理器（验收 #24~#29）：收帧分发、多端推送、断开清理。
 *
 * <p>用 mock 的 {@link WebSocketSession} + 真实 H2 业务层：
 * 传输层（Spring 的 WS 容器）不参与，但「收到一段 JSON → 业务 → 回什么帧」这条链路是真的。
 */
class ChatWsHandlerTest {

    private SocialTestSupport db;
    private ChatWsHandler handler;
    private ChatService chat;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.repo.insertFriend("alice", "bob");

        // 被测对象是 handler，而 ChatService 里的 pusher 必须指向它 ——
        // 生产里靠 Spring 的 @Lazy 代理解决同一个环，这里用一个 holder 模拟。
        final ChatWsHandler[] holder = new ChatWsHandler[1];
        ChatService chat = new ChatService(db.repo, db.masker, db.unread,
                (userId, event) -> {
                    if (holder[0] != null) holder[0].push(userId, event);
                }, json);
        handler = new ChatWsHandler(json, chat);
        holder[0] = handler;
        this.chat = chat;
    }

    // ==================== 工具：假的连接 ====================

    /** 一个假 session，把发出去的所有帧记在 sent 里。 */
    private static final class FakeSession {
        WebSocketSession raw;
        final List<Map<String, Object>> sent = new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    private FakeSession connect(String userId, String sessionId) {
        FakeSession f = new FakeSession();
        WebSocketSession raw = mock(WebSocketSession.class);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put("userId", userId);

        when(raw.getId()).thenReturn(sessionId);
        when(raw.getAttributes()).thenReturn(attrs);
        when(raw.isOpen()).thenReturn(true);
        // 装饰器会读这两个上限，默认 0 会被当成"超限"而拒绝发送
        when(raw.getTextMessageSizeLimit()).thenReturn(8192);
        when(raw.getBinaryMessageSizeLimit()).thenReturn(8192);
        try {
            doAnswer(inv -> {
                TextMessage m = inv.getArgument(0);
                f.sent.add(json.readValue(m.getPayload(), Map.class));
                return null;
            }).when(raw).sendMessage(any(TextMessage.class));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }

        f.raw = raw;
        handler.afterConnectionEstablished(raw);
        return f;
    }

    private void frame(FakeSession f, String payload) {
        handler.handleTextMessage(f.raw, new TextMessage(payload));
    }

    private void sendFrame(FakeSession f, String toId, String body, String clientMsgId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "send");
        m.put("toId", toId);
        m.put("body", body);
        m.put("clientMsgId", clientMsgId);
        try {
            frame(f, json.writeValueAsString(m));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> lastOf(FakeSession f, String type) {
        for (int i = f.sent.size() - 1; i >= 0; i--) {
            if (type.equals(f.sent.get(i).get("type"))) return f.sent.get(i);
        }
        return null;
    }

    // ==================== 连接生命周期 ====================

    @Test
    void 连接后登记_断开后清理() {
        FakeSession a = connect("alice", "s-a1");
        assertEquals(1, handler.onlineConnections());
        assertEquals(1, handler.onlineUsers());

        handler.afterConnectionClosed(a.raw, CloseStatus.NORMAL);
        assertEquals(0, handler.onlineConnections(), "断开后必须归零，否则连接泄漏");
        assertEquals(0, handler.onlineUsers());
    }

    @Test
    void 连续开关十次_连接数归零() {
        for (int i = 0; i < 10; i++) {
            FakeSession f = connect("alice", "s-" + i);
            handler.afterConnectionClosed(f.raw, CloseStatus.NORMAL);
        }
        assertEquals(0, handler.onlineConnections(), "验收 #29：开关 10 次后连接数应为 0");
    }

    @Test
    void 同一个账号两端在线_连接数为2() {
        connect("alice", "s-1");
        connect("alice", "s-2");
        assertEquals(2, handler.onlineConnections());
        assertEquals(1, handler.onlineUsers(), "仍然是 1 个用户");
    }

    // ==================== 帧分发 ====================

    @Test
    void ping_回pong() {
        FakeSession a = connect("alice", "s-a1");
        frame(a, "{\"type\":\"ping\"}");
        assertEquals("pong", lastOf(a, "pong").get("type"));
    }

    @Test
    void send_回ack并推送对端() {
        FakeSession a = connect("alice", "s-a1");
        FakeSession b = connect("bob", "s-b1");

        sendFrame(a, "bob", "在吗", "c-8f2a");

        // 发送方：先收 msg（自己其它端同步用），再收 ack
        Map<String, Object> ack = lastOf(a, "ack");
        assertNotNull(ack, "必须回 ack，否则前端那条气泡永远转圈");
        assertEquals("c-8f2a", ack.get("clientMsgId"), "ack 要把 clientMsgId 原样带回");
        assertNotNull(ack.get("messageId"));
        assertNotNull(ack.get("convId"));

        // 接收方：收到 msg，且是同一个 messageId
        Map<String, Object> msg = lastOf(b, "msg");
        assertNotNull(msg);
        Map<?, ?> m = (Map<?, ?>) msg.get("message");
        assertEquals("在吗", m.get("body"));
        assertEquals("alice", m.get("fromId"));
        assertEquals(ack.get("messageId"), m.get("id"));
    }

    @Test
    void 接收方两个标签页_两端都收到() {
        FakeSession a = connect("alice", "s-a1");
        FakeSession b1 = connect("bob", "s-b1");
        FakeSession b2 = connect("bob", "s-b2");

        sendFrame(a, "bob", "两端都要收到", "c-1");

        assertNotNull(lastOf(b1, "msg"), "第一个标签页");
        assertNotNull(lastOf(b2, "msg"), "第二个标签页（验收 #27）");
    }

    @Test
    void read_写已读位置并通知对端() {
        FakeSession a = connect("alice", "s-a1");
        FakeSession b = connect("bob", "s-b1");
        sendFrame(a, "bob", "第一条", "c-1");

        long convId = ((Number) lastOf(a, "ack").get("convId")).longValue();
        long msgId = ((Number) lastOf(a, "ack").get("messageId")).longValue();

        frame(b, "{\"type\":\"read\",\"convId\":" + convId + ",\"lastMsgId\":" + msgId + "}");

        assertEquals(msgId, db.repo.readPosition(convId, "bob"));
        Map<String, Object> readEvent = lastOf(a, "read");
        assertNotNull(readEvent, "对端要收到「已读」事件");
        assertEquals(msgId, ((Number) readEvent.get("lastMsgId")).longValue());
        assertEquals(0, db.unread.of("bob", convId), "未读同时清零");
    }

    @Test
    void 非好友_回error_NOT_FRIEND且带clientMsgId() {
        FakeSession c = connect("carol", "s-c1");
        db.user("carol", "王小明");

        sendFrame(c, "bob", "我们还不是好友", "c-x");

        Map<String, Object> err = lastOf(c, "error");
        assertNotNull(err);
        assertEquals("NOT_FRIEND", err.get("code"));
        assertEquals("c-x", err.get("clientMsgId"), "前端要靠它把气泡标红");
    }

    @Test
    void 未知类型_回error但不关连接() {
        FakeSession a = connect("alice", "s-a1");
        frame(a, "{\"type\":\"whatever\"}");

        assertEquals("UNKNOWN_TYPE", lastOf(a, "error").get("code"));
        assertEquals(1, handler.onlineConnections(), "错误帧不能踢掉连接");
    }

    @Test
    void 坏JSON_回error且连接还在() {
        FakeSession a = connect("alice", "s-a1");
        frame(a, "{不是 json");

        assertEquals("BAD_MESSAGE", lastOf(a, "error").get("code"));
        assertEquals(1, handler.onlineConnections());
    }

    @Test
    void 推给不在线的人_什么也不发生() {
        // bob 没连；alice 发过去应该照常成功（消息入库，等 bob 上线补拉）
        FakeSession a = connect("alice", "s-a1");
        sendFrame(a, "bob", "你不在线我也发", "c-9");

        assertNotNull(lastOf(a, "ack"));
        assertEquals(1, db.count("select count(*) from sy_direct_message"));
    }
}
