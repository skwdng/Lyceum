package com.siyige.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * T3：过滤器权限矩阵。
 *
 * <p>用 spring-test 的 MockHttpServletRequest/Response 直接驱动过滤器，不起 Spring 容器。
 */
class JwtAuthFilterTest {

    private static final String SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";

    private final JwtService jwt = new JwtService(SECRET);
    private final TokenBlacklist blacklist = mock(TokenBlacklist.class);
    private final JwtAuthFilter filter = new JwtAuthFilter(jwt, blacklist);

    /** 记录下游是否被调用、以及调用时 UserContext 里是谁。 */
    private static final class Capture {
        boolean called;
        String userIdInsideChain;
    }

    private Capture run(String method, String uri, String bearer) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (bearer != null) req.addHeader("Authorization", "Bearer " + bearer);
        MockHttpServletResponse res = new MockHttpServletResponse();
        Capture cap = new Capture();
        filter.doFilter(req, res, (rq, rs) -> {
            cap.called = true;
            cap.userIdInsideChain = UserContext.current();
        });
        cap.userIdInsideChain = cap.userIdInsideChain;   // 保持可读
        return cap;
    }

    private MockHttpServletResponse runForResponse(String method, String uri, String bearer) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (bearer != null) req.addHeader("Authorization", "Bearer " + bearer);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, (rq, rs) -> { });
        return res;
    }

    // ---------- 匿名 ----------

    @Test
    void 匿名GET列表放行() throws Exception {
        Capture c = run("GET", "/api/community/posts", null);

        assertTrue(c.called, "匿名读必须放行");
        assertNull(c.userIdInsideChain, "匿名时 UserContext 应为空（liked 恒 false 的依据）");
    }

    @Test
    void 匿名GET详情与评论都放行() throws Exception {
        assertTrue(run("GET", "/api/community/posts/7", null).called);
        assertTrue(run("GET", "/api/community/posts/7/comments", null).called);
        assertTrue(run("GET", "/api/community/comments/3/replies", null).called);
    }

    @Test
    void 匿名发帖返回401() throws Exception {
        MockHttpServletResponse res = runForResponse("POST", "/api/community/posts", null);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("\"code\":\"UNAUTHORIZED\""), res.getContentAsString());
    }

    @Test
    void 匿名改帖删帖点赞发评论一律401() throws Exception {
        String[][] cases = {
                {"PATCH", "/api/community/posts/7"},
                {"DELETE", "/api/community/posts/7"},
                {"POST", "/api/community/posts/7/like"},
                {"DELETE", "/api/community/posts/7/like"},
                {"POST", "/api/community/comments/3/like"},
                {"DELETE", "/api/community/comments/3"},
                {"POST", "/api/community/posts/7/comments"},
        };
        for (String[] c : cases) {
            MockHttpServletResponse res = runForResponse(c[0], c[1], null);
            assertEquals(401, res.getStatus(), c[0] + " " + c[1] + " 应 401");
        }
    }

    // ---------- 浏览计数：匿名也放行 ----------

    @Test
    void 匿名浏览计数放行_由Controller决定不计数() throws Exception {
        Capture c = run("POST", "/api/community/posts/7/view", null);

        assertTrue(c.called, "匿名 /view 必须放行（返回 204，但不计数）");
        assertNull(c.userIdInsideChain, "匿名不应有身份，Controller 据此跳过计数");
    }

    // ---------- 已登录 ----------

    @Test
    void 登录后写操作放行且UserContext可见() throws Exception {
        when(blacklist.contains(anyString())).thenReturn(false);
        String token = jwt.issue("zhang", "zhang");

        Capture c = run("POST", "/api/community/posts", token);

        assertTrue(c.called);
        assertEquals("zhang", c.userIdInsideChain, "下游应能看到当前用户");
    }

    @Test
    void 登录后GET也带身份_用于liked() throws Exception {
        when(blacklist.contains(anyString())).thenReturn(false);
        String token = jwt.issue("zhang", "zhang");

        Capture c = run("GET", "/api/community/posts", token);

        assertTrue(c.called);
        assertEquals("zhang", c.userIdInsideChain);
    }

    @Test
    void 请求结束后UserContext被清理_防线程复用串号() throws Exception {
        when(blacklist.contains(anyString())).thenReturn(false);
        String token = jwt.issue("zhang", "zhang");

        run("GET", "/api/community/posts", token);

        assertNull(UserContext.current(), "请求结束必须 clear，否则线程复用时身份会串");
    }

    // ---------- 坏 token ----------

    @Test
    void 无效token一律401_哪怕是GET() throws Exception {
        MockHttpServletResponse res = runForResponse("GET", "/api/community/posts", "bad.token.value");

        assertEquals(401, res.getStatus(), "出示了坏身份和没出示身份不是一回事");
    }

    @Test
    void 过期token返回401() throws Exception {
        String expired = jwt.issue("zhang", "zhang", Duration.ofSeconds(-5));

        assertEquals(401, runForResponse("GET", "/api/community/posts", expired).getStatus());
    }

    @Test
    void 已登出的token返回401() throws Exception {
        String token = jwt.issue("zhang", "zhang");
        when(blacklist.contains(anyString())).thenReturn(true);

        MockHttpServletResponse res = runForResponse("POST", "/api/community/posts", token);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("UNAUTHORIZED"));
    }

    // ---------- Redis 故障：fail-closed ----------

    @Test
    void 黑名单存储不可用时返回503而不是放行() throws Exception {
        String token = jwt.issue("zhang", "zhang");
        when(blacklist.contains(anyString())).thenThrow(AuthException.serviceUnavailable("Redis down"));

        MockHttpServletResponse res = runForResponse("POST", "/api/community/posts", token);

        assertEquals(503, res.getStatus(), "查不到黑名单就不能放行（Q1 决策）");
        assertTrue(res.getContentAsString().contains("SERVICE_UNAVAILABLE"));
    }

    @Test
    void 没有token时不会去查黑名单_匿名不受Redis影响() throws Exception {
        run("GET", "/api/community/posts", null);

        verifyNoInteractions(blacklist);
    }

    // ---------- 规则函数本身 ----------

    @Test
    void 需要登录的判定规则() {
        assertFalse(JwtAuthFilter.requiresLogin("GET", "/api/community/posts"));
        assertFalse(JwtAuthFilter.requiresLogin("POST", "/api/community/posts/7/view"));
        assertTrue(JwtAuthFilter.requiresLogin("POST", "/api/community/posts"));
        assertTrue(JwtAuthFilter.requiresLogin("POST", "/api/community/posts/7/comments"));
        assertTrue(JwtAuthFilter.requiresLogin("DELETE", "/api/community/comments/3"));
        assertTrue(JwtAuthFilter.requiresLogin("PATCH", "/api/community/posts/7"));
    }

    @Test
    void 带contextPath时路径判定仍然正确() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/siyige/api/community/posts/7/view");
        req.setContextPath("/siyige");

        assertEquals("/api/community/posts/7/view", JwtAuthFilter.pathOf(req));
    }
}
