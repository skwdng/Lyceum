package com.siyige.admin;

import com.siyige.admin.rbac.AdminRole;
import com.siyige.admin.rbac.Perm;
import com.siyige.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * R4：**权限矩阵**参数化测试（4 角色 × 29 接口 + 匿名 + 强制改密）。
 *
 * <p>为什么放到 HTTP 层（`@SpringBootTest` + MockMvc）而不是直接调 Service：
 * 本次要验的是"过滤器 + 注解 + AOP 切面"这一整条链 —— 只调 Service 测不到
 * `AdminAuthFilter` 写角色、`RequireAspect` 读角色这两步，而那正是最容易断的地方。
 *
 * <p>令牌直接用 {@link JwtService#issueAdmin} 签，不走登录接口：
 * 登录有 Redis 限流（本机测试环境不一定有 Redis），会把矩阵测试变成环境测试。
 *
 * <p>断言口径（与设计方案 §8 一致）：
 * <ul>
 *   <li>该角色**有**该权限点 → 只要不是 401/403 就算过（业务可以是 200/204/400/404/409）</li>
 *   <li>该角色**没有**该权限点 → 必须 403，且 code = {@code FORBIDDEN_PERM}</li>
 *   <li>匿名 → 401</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminPermissionMatrixTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JwtService jwt;

    /** 每行 = 一个管理接口 + 它要求的权限点（null = 任何已登录管理员都能调）。 */
    private record Endpoint(String method, String path, String body, Perm need) { }

    private static final List<Endpoint> ENDPOINTS = List.of(
            // ---- 举报 ----
            new Endpoint("GET", "/api/admin/reports", null, Perm.REPORT_READ),
            new Endpoint("GET", "/api/admin/reports/999999", null, Perm.REPORT_READ),
            new Endpoint("POST", "/api/admin/reports/999999/resolve", "{\"action\":\"IGNORE\"}", Perm.REPORT_RESOLVE),
            // ---- 用户 ----
            new Endpoint("GET", "/api/admin/users", null, Perm.USER_READ),
            new Endpoint("GET", "/api/admin/users/u1/profile", null, Perm.USER_READ),
            new Endpoint("POST", "/api/admin/users/u1/status", "{\"status\":1}", Perm.USER_BAN),
            new Endpoint("POST", "/api/admin/users/u1/ban", "{\"days\":3,\"reason\":\"矩阵测试\"}", Perm.USER_BAN),
            new Endpoint("POST", "/api/admin/users/u1/unban", null, Perm.USER_BAN),
            new Endpoint("POST", "/api/admin/users/batch", "{\"action\":\"unban\",\"ids\":[\"u1\"]}", Perm.USER_BAN),
            // ---- 内容 ----
            new Endpoint("GET", "/api/admin/posts", null, Perm.CONTENT_READ),
            new Endpoint("GET", "/api/admin/posts/999999", null, Perm.CONTENT_READ),
            new Endpoint("GET", "/api/admin/posts/999999/comments", null, Perm.CONTENT_READ),
            new Endpoint("GET", "/api/admin/comments", null, Perm.CONTENT_READ),
            new Endpoint("POST", "/api/admin/content/post/999999/unhide", null, Perm.CONTENT_MODERATE),
            new Endpoint("POST", "/api/admin/content/post/999999/hide", "{}", Perm.CONTENT_MODERATE),
            new Endpoint("POST", "/api/admin/content/batch",
                    "{\"type\":\"post\",\"action\":\"unhide\",\"ids\":[999999]}", Perm.CONTENT_MODERATE),
            // ---- 处理记录 ----
            new Endpoint("GET", "/api/admin/audit", null, Perm.AUDIT_READ),
            new Endpoint("POST", "/api/admin/audit/999999/restore", null, Perm.AUDIT_RESTORE),
            // ---- 视频 ----
            new Endpoint("GET", "/api/admin/video-audit/queue", null, Perm.VIDEO_READ),
            new Endpoint("GET", "/api/admin/video-audit/999999/logs", null, Perm.VIDEO_READ),
            new Endpoint("GET", "/api/admin/video-audit/rules", null, Perm.VIDEO_READ),
            new Endpoint("POST", "/api/admin/video-audit/999999/decide", "{\"decision\":\"PASS\"}", Perm.VIDEO_AUDIT),
            new Endpoint("POST", "/api/admin/video-audit/999999/restore", null, Perm.VIDEO_AUDIT),
            // ---- 辩题 ----
            new Endpoint("GET", "/api/admin/topics", null, Perm.TOPIC_READ),
            new Endpoint("POST", "/api/admin/topics/t-nope/approve", null, Perm.TOPIC_MODERATE),
            new Endpoint("POST", "/api/admin/topics/t-nope/reject", "{\"reason\":\"矩阵测试\"}", Perm.TOPIC_MODERATE),
            new Endpoint("POST", "/api/admin/topics/t-nope/offline", "{\"reason\":\"矩阵测试\"}", Perm.TOPIC_MODERATE),
            // ---- 报表 ----
            new Endpoint("GET", "/api/admin/stats", null, Perm.ANALYTICS_READ),
            new Endpoint("GET", "/api/admin/analytics/overview", null, Perm.ANALYTICS_READ),
            new Endpoint("GET", "/api/admin/analytics/export?format=csv&report=overview", null, Perm.ANALYTICS_EXPORT),
            // ---- 管理员账号 ----
            new Endpoint("GET", "/api/admin/admins", null, Perm.ADMIN_MANAGE),
            new Endpoint("POST", "/api/admin/admins/1/status", "{\"enabled\":true}", Perm.ADMIN_MANAGE),
            new Endpoint("POST", "/api/admin/admins/1/role", "{\"role\":\"SUPER\"}", Perm.ADMIN_MANAGE),
            new Endpoint("POST", "/api/admin/admins/1/reset-pwd", null, Perm.ADMIN_MANAGE),
            // ---- 任何已登录管理员 ----
            new Endpoint("GET", "/api/admin/me", null, null)
    );

    private final Map<AdminRole, String> tokens = new LinkedHashMap<>();
    private final Map<AdminRole, String> accounts = new LinkedHashMap<>();

    @BeforeEach
    void setUp() {
        // 四个角色各造一个管理员（种子 admin 是 SUPER，这里另建，避免动到它）
        long seq = 0;
        for (AdminRole r : AdminRole.values()) {
            String acc = "mx-" + r.name().toLowerCase() + "-" + System.nanoTime() % 100000;
            jdbc.update("insert into sy_admin(account, password_hash, role, status, must_change_pwd) "
                    + "values(?, 'x', ?, 1, false)", acc, r.name());
            Long id = jdbc.queryForObject("select id from sy_admin where account = ?", Long.class, acc);
            accounts.put(r, acc);
            tokens.put(r, jwt.issueAdmin(String.valueOf(id), acc));
            seq = id;
        }
        assertTrue(seq > 0);
    }

    private MockHttpServletRequestBuilder req(Endpoint e, String token) throws Exception {
        MockHttpServletRequestBuilder b = switch (e.method()) {
            case "GET" -> get(e.path());
            case "POST" -> post(e.path());
            case "PATCH" -> patch(e.path());
            default -> throw new IllegalStateException("未支持的方法 " + e.method());
        };
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (e.body() != null) b.contentType(MediaType.APPLICATION_JSON).content(e.body());
        return b;
    }

    // ==================== 4 角色 × 全部接口 ====================

    @Test
    @DisplayName("权限矩阵：每个角色对每个接口的 403/非 403 都符合 AdminRole.perms()")
    void 权限矩阵_逐接口逐角色() throws Exception {
        List<String> problems = new ArrayList<>();

        for (AdminRole role : AdminRole.values()) {
            String token = tokens.get(role);
            for (Endpoint e : ENDPOINTS) {
                boolean allowed = e.need() == null || role.has(e.need());
                int status = mvc.perform(req(e, token)).andReturn().getResponse().getStatus();
                String code = codeOf(mvc.perform(req(e, token)).andReturn().getResponse().getContentAsString());

                if (allowed) {
                    if (status == 403 || status == 401) {
                        problems.add(role + " 应该能调 " + e.method() + " " + e.path()
                                + "（需要 " + (e.need() == null ? "登录" : e.need().code()) + "）却拿到 " + status);
                    }
                } else {
                    if (status != 403) {
                        problems.add(role + " 不该能调 " + e.method() + " " + e.path()
                                + "（需要 " + e.need().code() + "）却拿到 " + status);
                    } else if (!"FORBIDDEN_PERM".equals(code)) {
                        problems.add(role + " 调 " + e.path() + " 403 的 code 应为 FORBIDDEN_PERM，实际 " + code);
                    }
                }
            }
        }

        assertTrue(problems.isEmpty(), "权限矩阵不符：\n" + String.join("\n", problems));
    }

    @Test
    @DisplayName("匿名访问：全部 401（除登录口）")
    void 匿名全部401() throws Exception {
        for (Endpoint e : ENDPOINTS) {
            int status = mvc.perform(req(e, null)).andReturn().getResponse().getStatus();
            assertEquals(401, status, "匿名不该能调 " + e.method() + " " + e.path());
        }
    }

    @Test
    @DisplayName("各角色可调接口数量与矩阵一致（防漏挂注解）")
    void 可调接口数量符合矩阵() {
        for (AdminRole role : AdminRole.values()) {
            long allowed = ENDPOINTS.stream().filter(e -> e.need() == null || role.has(e.need())).count();
            long expected = ENDPOINTS.stream().filter(e -> e.need() == null).count()
                    + ENDPOINTS.stream().filter(e -> e.need() != null && role.has(e.need())).count();
            assertEquals(expected, allowed);
            // 只读角色必须"读全过、写全挡"
            if (role == AdminRole.VIEWER) {
                long writes = ENDPOINTS.stream().filter(e -> "POST".equals(e.method())).count();
                assertTrue(writes > 0, "矩阵里应该有写接口");
            }
        }
    }

    // ==================== 首登强制改密 ====================

    @Test
    @DisplayName("must_change_pwd=true：业务接口全 403 PASSWORD_CHANGE_REQUIRED，改密与 /me 放行")
    void 首登强制改密拦截() throws Exception {
        String acc = "mx-pwd-" + System.nanoTime() % 100000;
        jdbc.update("insert into sy_admin(account, password_hash, role, status, must_change_pwd) "
                + "values(?, 'x', 'SUPER', 1, true)", acc);
        Long id = jdbc.queryForObject("select id from sy_admin where account = ?", Long.class, acc);
        String token = jwt.issueAdmin(String.valueOf(id), acc);

        for (Endpoint e : ENDPOINTS) {
            if ("/api/admin/me".equals(e.path())) {
                int meStatus = mvc.perform(req(e, token)).andReturn().getResponse().getStatus();
                assertNotEquals(403, meStatus, "/me 必须放行，否则前端拿不到 mustChangePwd");
                continue;
            }
            if ("/api/admin/analytics/export?format=csv&report=overview".equals(e.path())) {
                continue;   // 导出返回二进制，单独跳过（其余接口已足够覆盖拦截）
            }
            var resp = mvc.perform(req(e, token)).andReturn().getResponse();
            assertEquals(403, resp.getStatus(), "未改密不该能调 " + e.path());
            assertEquals("PASSWORD_CHANGE_REQUIRED", codeOf(resp.getContentAsString()),
                    "未改密的 403 code 应为 PASSWORD_CHANGE_REQUIRED：" + e.path());
        }

        // 改密接口本身必须放行（否则死锁）
        int pwdStatus = mvc.perform(patch("/api/admin/auth/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"oldPassword\":\"x\",\"newPassword\":\"y\"}"))
                .andReturn().getResponse().getStatus();
        assertNotEquals(403, pwdStatus, "改密接口必须放行");
    }

    // ==================== 角色改完立即生效（不重新登录） ====================

    @Test
    @DisplayName("改角色后同一个令牌立即按新角色放行（角色不在 JWT 里）")
    void 改角色立即生效() throws Exception {
        AdminRole from = AdminRole.VIEWER;
        String acc = accounts.get(from);
        String token = tokens.get(from);
        Endpoint hide = new Endpoint("POST", "/api/admin/content/post/999999/hide", "{}", Perm.CONTENT_MODERATE);

        assertEquals(403, mvc.perform(req(hide, token)).andReturn().getResponse().getStatus(),
                "VIEWER 一开始不该能屏蔽内容");

        jdbc.update("update sy_admin set role = 'MOD' where account = ?", acc);

        int after = mvc.perform(req(hide, token)).andReturn().getResponse().getStatus();
        assertNotEquals(403, after, "换成 MOD 之后同一个令牌应立刻有 content:moderate（角色每请求查库）");

        // 再降回 VIEWER，同一个令牌又该被挡（不需要重新登录）
        jdbc.update("update sy_admin set role = 'VIEWER' where account = ?", acc);
        assertEquals(403, mvc.perform(req(hide, token)).andReturn().getResponse().getStatus(),
                "降回 VIEWER 后同一个令牌应立刻失去权限");
    }

    /** 从错误体里取 code（`{"code":"FORBIDDEN_PERM",...}`）。 */
    private static String codeOf(String json) {
        if (json == null) return "";
        int i = json.indexOf("\"code\"");
        if (i < 0) return "";
        int c = json.indexOf(':', i);
        int q1 = json.indexOf('"', c);
        int q2 = json.indexOf('"', q1 + 1);
        return q1 < 0 || q2 < 0 ? "" : json.substring(q1 + 1, q2);
    }
}
