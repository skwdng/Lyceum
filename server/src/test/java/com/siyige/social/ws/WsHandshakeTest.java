package com.siyige.social.ws;

import com.siyige.auth.JwtService;
import com.siyige.auth.TokenBlacklist;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.net.URI;
import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 握手鉴权（验收 #22、#23）。
 *
 * <p>这是 WebSocket 唯一的安全边界：{@code /ws/**} 不注册任何 Servlet 过滤器
 * （红线要求，也不该注册），所以「没令牌 / 令牌无效 / 已登出 / 管理员令牌」
 * 全部只能在这里挡下来。挡不住就等于开了个匿名私聊通道。
 */
class WsHandshakeTest {

    private static final String SECRET = "test-secret-at-least-32-bytes-long-for-hmac!!";

    private JwtService jwt;
    private FakeBlacklist blacklist;
    private ChatHandshakeInterceptor interceptor;

    /** 极简黑名单：测试只关心 contains。 */
    static class FakeBlacklist implements TokenBlacklist {
        final Set<String> revoked = new HashSet<>();
        @Override public void add(String jti, Duration ttl) { revoked.add(jti); }
        @Override public boolean contains(String jti) { return revoked.contains(jti); }
    }

    @BeforeEach
    void setUp() {
        jwt = new JwtService(SECRET);
        blacklist = new FakeBlacklist();
        interceptor = new ChatHandshakeInterceptor(jwt, blacklist);
    }

    private ServerHttpRequest request(String query) {
        ServerHttpRequest req = mock(ServerHttpRequest.class);
        when(req.getURI()).thenReturn(URI.create("ws://localhost:8080/ws/chat" + (query == null ? "" : query)));
        return req;
    }

    /** 最近一次握手的响应对象：拒绝时要在上面断言 401。 */
    private ServerHttpResponse lastResponse;

    private boolean handshake(String query, Map<String, Object> attrs) {
        lastResponse = mock(ServerHttpResponse.class);
        return interceptor.beforeHandshake(request(query), lastResponse, mock(WebSocketHandler.class), attrs);
    }

    @Test
    void 没有token_拒绝握手() {
        Map<String, Object> attrs = new HashMap<>();
        assertFalse(handshake(null, attrs));
        assertFalse(handshake("?token=", attrs));
        assertFalse(attrs.containsKey("userId"));
        // 拒绝必须写成 401，不能留个空 200（否则 curl 排查时会以为握手成功了）
        verify(lastResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void 无效token_拒绝握手() {
        Map<String, Object> attrs = new HashMap<>();
        assertFalse(handshake("?token=not-a-jwt", attrs));
        assertFalse(attrs.containsKey("userId"));
        verify(lastResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void 有效token_通过并把userId塞进attributes() {
        String token = jwt.issue("alice", "alice");
        Map<String, Object> attrs = new HashMap<>();

        assertTrue(handshake("?token=" + token, attrs));
        assertEquals("alice", attrs.get("userId"), "Handler 全靠这个知道「当前是谁」");
        verify(lastResponse, never()).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void 已登出的token_拒绝握手() {
        String token = jwt.issue("alice", "alice");
        JwtService.ParsedToken parsed = jwt.parse(token);
        blacklist.add(parsed.jti(), Duration.ofHours(1));

        Map<String, Object> attrs = new HashMap<>();
        assertFalse(handshake("?token=" + token, attrs), "退出登录后不许再建连接");
        assertFalse(attrs.containsKey("userId"));
        verify(lastResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void 管理员令牌_拒绝握手() {
        String adminToken = jwt.issueAdmin("1", "admin");
        Map<String, Object> attrs = new HashMap<>();

        assertFalse(handshake("?token=" + adminToken, attrs), "管理员不能以用户身份连私聊");
        assertFalse(attrs.containsKey("userId"));
        verify(lastResponse).setStatusCode(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void token里带别的查询参数也认得出来() {
        String token = jwt.issue("bob", "bob");
        Map<String, Object> attrs = new HashMap<>();

        assertTrue(handshake("?foo=bar&token=" + token, attrs));
        assertEquals("bob", attrs.get("userId"));
    }
}
