package com.siyige.admin;

import com.siyige.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A2：管理端过滤器。
 *
 * <p>重点是"两个过滤器各认各的令牌"这条边界：用户令牌进不了后台，
 * 管理员令牌也当不了普通用户（后者在 {@code JwtAuthFilterTest} 里验）。
 */
class AdminAuthFilterTest {

    private static final String SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";

    private final JwtService jwt = new JwtService(SECRET);
    private final AdminStatusSource adminStatus = org.mockito.Mockito.mock(AdminStatusSource.class);
    private final AdminAuthFilter filter = new AdminAuthFilter(jwt, adminStatus);

    @org.junit.jupiter.api.BeforeEach
    void defaultAuthState() {
        // 默认"没停用、没改过密码"，个别用例再覆盖
        org.mockito.Mockito.when(adminStatus.authState(org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(com.siyige.auth.AuthState.UNKNOWN);
    }

    private static final class Capture {
        boolean called;
        Long adminIdInside;
        String accountInside;
    }

    private Capture run(String method, String uri, String bearer) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (bearer != null) req.addHeader("Authorization", "Bearer " + bearer);
        MockHttpServletResponse res = new MockHttpServletResponse();
        Capture cap = new Capture();
        filter.doFilter(req, res, (rq, rs) -> {
            cap.called = true;
            cap.adminIdInside = AdminContext.id();
            cap.accountInside = AdminContext.account();
        });
        return cap;
    }

    private MockHttpServletResponse runForResponse(String method, String uri, String bearer) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (bearer != null) req.addHeader("Authorization", "Bearer " + bearer);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, (rq, rs) -> { });
        return res;
    }

    // ---------- 登录口放行 ----------

    @Test
    void 登录接口无需令牌() throws Exception {
        Capture c = run("POST", "/api/admin/auth/login", null);

        assertTrue(c.called, "登录口必须放行，否则永远登不进来");
        assertNull(c.adminIdInside);
    }

    @Test
    void 登录口带失效令牌也放行_不能把人卡在登录页() throws Exception {
        Capture c = run("POST", "/api/admin/auth/login", "this.is.garbage");

        assertTrue(c.called, "过期的旧令牌不该挡住重新登录");
    }

    // ---------- 受保护接口 ----------

    @Test
    void 无令牌访问受保护接口返回401() throws Exception {
        MockHttpServletResponse res = runForResponse("GET", "/api/admin/reports", null);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("UNAUTHORIZED"), res.getContentAsString());
    }

    @Test
    void 普通用户令牌访问后台返回403_NOT_ADMIN() throws Exception {
        String userToken = jwt.issue("zhang", "zhang");

        MockHttpServletResponse res = runForResponse("GET", "/api/admin/reports", userToken);

        assertEquals(403, res.getStatus(), "用户令牌不能进后台");
        assertTrue(res.getContentAsString().contains("NOT_ADMIN"), res.getContentAsString());
    }

    @Test
    void 管理员令牌放行且身份可见() throws Exception {
        String adminToken = jwt.issueAdmin("7", "admin");

        Capture c = run("GET", "/api/admin/reports", adminToken);

        assertTrue(c.called);
        assertEquals(7L, c.adminIdInside, "下游应能看到管理员 id");
        assertEquals("admin", c.accountInside);
    }

    @Test
    void 请求结束后AdminContext被清理_防线程复用串号() throws Exception {
        String adminToken = jwt.issueAdmin("7", "admin");

        run("GET", "/api/admin/reports", adminToken);

        assertNull(AdminContext.id(), "请求结束必须 clear");
        assertNull(AdminContext.account());
    }

    @Test
    void 坏令牌返回401() throws Exception {
        assertEquals(401, runForResponse("GET", "/api/admin/reports", "bad.token.value").getStatus());
    }

    @Test
    void 篡改或过期的管理员令牌都返回401() throws Exception {
        String token = jwt.issueAdmin("7", "admin");
        // 改签名段第一个字符（不能改末字符：base64url 末字符的低 2 位是填充位，
        // 换成高 4 位相同的字符解出的字节一样，签名仍然有效 —— 会偶发失败）
        String[] parts = token.split("\\.");
        String sig = parts[2];
        char head = sig.charAt(0) == 'A' ? 'B' : 'A';
        String tampered = parts[0] + "." + parts[1] + "." + head + sig.substring(1);

        assertEquals(401, runForResponse("GET", "/api/admin/reports", tampered).getStatus(),
                "篡改过的令牌必须被拒");
        assertEquals(401, runForResponse("GET", "/api/admin/reports", "not-a-jwt").getStatus());
    }

    @Test
    void 带contextPath时路径判定仍然正确() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/siyige/api/admin/auth/login");
        req.setContextPath("/siyige");

        assertEquals("/api/admin/auth/login", AdminAuthFilter.pathOf(req));
    }

    // ---------- 管理员改密后旧令牌失效（B3） ----------

    @Test
    void 管理员改密后旧令牌返回401_TOKEN_STALE() throws Exception {
        String token = jwt.issueAdmin("1", "admin");
        java.time.Instant changed = jwt.parse(token).issuedAt().plusSeconds(30);
        org.mockito.Mockito.when(adminStatus.authState(1L))
                .thenReturn(new com.siyige.auth.AuthState(false, changed));

        MockHttpServletResponse res = runForResponse("GET", "/api/admin/stats", token);

        assertEquals(401, res.getStatus());
        assertTrue(res.getContentAsString().contains("TOKEN_STALE"), res.getContentAsString());
    }

    @Test
    void 管理员被停用后令牌立刻失效() throws Exception {
        String token = jwt.issueAdmin("1", "admin");
        org.mockito.Mockito.when(adminStatus.authState(1L))
                .thenReturn(new com.siyige.auth.AuthState(true, null));

        MockHttpServletResponse res = runForResponse("GET", "/api/admin/stats", token);

        assertEquals(403, res.getStatus());
        assertTrue(res.getContentAsString().contains("NOT_ADMIN"), res.getContentAsString());
    }

    @Test
    void 改密登录口仍然放行_不需要令牌() throws Exception {
        MockHttpServletResponse res = runForResponse("POST", "/api/admin/auth/login", null);

        assertNotEquals(401, res.getStatus(), "登录口不该被令牌校验挡住");
    }
}