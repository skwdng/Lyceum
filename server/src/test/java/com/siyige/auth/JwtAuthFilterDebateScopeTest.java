package com.siyige.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * D1：辩论侧过滤器策略（{@link JwtAuthFilter.Scope#DEBATE} / {@link JwtAuthFilter.Scope#DEBATE_WRITE}）。
 *
 * <p>社区策略的既有用例在 {@link JwtAuthFilterTest}，这里只测新增的两种 scope，
 * 以及 SSE 的 `?token=` 回退。
 */
class JwtAuthFilterDebateScopeTest {

    private static final String SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";

    private final JwtService jwt = new JwtService(SECRET);
    private final TokenBlacklist blacklist = mock(TokenBlacklist.class);
    private final UserStatusSource userStatus = mock(UserStatusSource.class);

    private final JwtAuthFilter debate =
            new JwtAuthFilter(jwt, blacklist, userStatus, JwtAuthFilter.Scope.DEBATE);
    private final JwtAuthFilter debateWrite =
            new JwtAuthFilter(jwt, blacklist, userStatus, JwtAuthFilter.Scope.DEBATE_WRITE);

    @BeforeEach
    void defaultAuthState() {
        when(userStatus.authState(anyString())).thenReturn(AuthState.UNKNOWN);
        when(blacklist.contains(anyString())).thenReturn(false);
    }

    /** 跑一次过滤器；返回响应，同时把"下游是否被调用 / 下游看到的 userId"记在 ctx 里。 */
    private static final class Out {
        MockHttpServletResponse res;
        boolean chainCalled;
        String userIdInsideChain;
    }

    private Out run(JwtAuthFilter filter, String method, String uri, String bearer, String queryToken)
            throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        if (bearer != null) req.addHeader("Authorization", "Bearer " + bearer);
        if (queryToken != null) req.setParameter("token", queryToken);

        Out out = new Out();
        out.res = new MockHttpServletResponse();
        filter.doFilter(req, out.res, (rq, rs) -> {
            out.chainCalled = true;
            out.userIdInsideChain = UserContext.current();
        });
        return out;
    }

    private String json(MockHttpServletResponse res) throws Exception {
        return res.getContentAsString();
    }

    // ---------- DEBATE：连 GET 都要登录 ----------

    @Test
    void 未登录看对局详情要401_与社区GET放行不同() throws Exception {
        Out o = run(debate, "GET", "/api/matches/m1", null, null);

        assertEquals(401, o.res.getStatus());
        assertFalse(o.chainCalled);
        assertTrue(json(o.res).contains("UNAUTHORIZED"));
    }

    @Test
    void 未登录看战绩诊断也要401() throws Exception {
        assertEquals(401, run(debate, "GET", "/api/records", null, null).res.getStatus());
        assertEquals(401, run(debate, "GET", "/api/diag", null, null).res.getStatus());
    }

    @Test
    void 未登录建房也要401() throws Exception {
        assertEquals(401, run(debate, "POST", "/api/matches", null, null).res.getStatus());
    }

    @Test
    void 已登录后放行且UserContext就绪() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");

        Out o = run(debate, "GET", "/api/matches/m1", token, null);

        assertEquals(200, o.res.getStatus());
        assertTrue(o.chainCalled);
        assertEquals("zhang01", o.userIdInsideChain, "下游必须能直接拿到身份");
    }

    // ---------- SSE：?token= 回退 ----------

    @Test
    void SSE用查询参数令牌能连上() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");

        Out o = run(debate, "GET", "/api/matches/m1/events", null, token);

        assertEquals(200, o.res.getStatus(), "EventSource 带不了请求头，必须认 ?token=");
        assertTrue(o.chainCalled);
        assertEquals("zhang01", o.userIdInsideChain);
    }

    @Test
    void SSE不带令牌要401() throws Exception {
        Out o = run(debate, "GET", "/api/matches/m1/events", null, null);

        assertEquals(401, o.res.getStatus());
        assertFalse(o.chainCalled);
    }

    @Test
    void SSE带坏令牌也要401() throws Exception {
        Out o = run(debate, "GET", "/api/matches/m1/events", null, "not-a-jwt");

        assertEquals(401, o.res.getStatus());
        assertFalse(o.chainCalled);
    }

    @Test
    void 查询参数令牌只对events生效_其它接口不认() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");

        // 同一个令牌，走 /api/matches/m1（非 events）时不该被接受
        Out o = run(debate, "GET", "/api/matches/m1", null, token);

        assertEquals(401, o.res.getStatus(), "令牌只能走请求头；URL 传令牌只给 SSE 开口子");
        assertFalse(o.chainCalled);
    }

    @Test
    void 请求头优先于查询参数() throws Exception {
        String headerToken = jwt.issue("zhang01", "zhang01");
        String badQueryToken = "not-a-jwt";

        Out o = run(debate, "GET", "/api/matches/m1/events", headerToken, badQueryToken);

        assertEquals(200, o.res.getStatus(), "有请求头时不应再去看查询参数");
        assertEquals("zhang01", o.userIdInsideChain);
    }

    // ---------- 令牌类型 / 状态 ----------

    @Test
    void 管理员令牌用于对局接口_401且提示对局() throws Exception {
        String adminToken = jwt.issueAdmin("1", "admin");

        Out o = run(debate, "GET", "/api/matches/m1", adminToken, null);

        assertEquals(401, o.res.getStatus());
        assertTrue(json(o.res).contains("NOT_ADMIN"));
        assertTrue(json(o.res).contains("对局接口"), json(o.res));
    }

    @Test
    void 被封禁用户的令牌_401_ACCOUNT_DISABLED() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");
        when(userStatus.authState("zhang01")).thenReturn(new AuthState(true, null));

        Out o = run(debate, "GET", "/api/matches/m1", token, null);

        assertEquals(401, o.res.getStatus());
        assertTrue(json(o.res).contains("ACCOUNT_DISABLED"));
    }

    @Test
    void 改密前的旧令牌_401_TOKEN_STALE() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");
        Instant changed = jwt.parse(token).issuedAt().plusSeconds(60);
        when(userStatus.authState("zhang01")).thenReturn(new AuthState(false, changed));

        Out o = run(debate, "GET", "/api/matches/m1", token, null);

        assertEquals(401, o.res.getStatus());
        assertTrue(json(o.res).contains("TOKEN_STALE"));
    }

    @Test
    void 已登出的令牌_401() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");
        when(blacklist.contains(anyString())).thenReturn(true);

        assertEquals(401, run(debate, "GET", "/api/matches/m1", token, null).res.getStatus());
    }

    // ---------- DEBATE_WRITE：只拦写 ----------

    @Test
    void 内容类写接口_匿名读放行_匿名写401() throws Exception {
        assertEquals(200, run(debateWrite, "GET", "/api/hot", null, null).res.getStatus(),
                "热榜是读接口，匿名要能看");
        assertEquals(401, run(debateWrite, "POST", "/api/hot/t1/boost", null, null).res.getStatus(),
                "热榜助力是写操作，要登录");
        assertEquals(401, run(debateWrite, "POST", "/api/topics/audit", null, null).res.getStatus(),
                "自定义辩题送审是写操作，要登录");
    }

    @Test
    void 内容类写接口_登录后写放行() throws Exception {
        String token = jwt.issue("zhang01", "zhang01");

        Out o = run(debateWrite, "POST", "/api/topics/audit", token, null);

        assertEquals(200, o.res.getStatus());
        assertTrue(o.chainCalled);
        assertEquals("zhang01", o.userIdInsideChain);
    }

    // ---------- 策略本身 ----------

    @Test
    void 三种scope的登录要求符合预期() {
        JwtAuthFilter community = new JwtAuthFilter(jwt, blacklist, userStatus);

        assertTrue(debate.needsLogin("GET", "/api/matches/m1"), "辩论主体：GET 详情也要登录");
        assertTrue(debate.needsLogin("POST", "/api/matches"), "辩论主体：建对局要登录");

        assertFalse(community.needsLogin("GET", "/api/community/posts"), "社区：读放行");
        assertTrue(community.needsLogin("POST", "/api/community/posts"), "社区：写要登录");

        assertFalse(debateWrite.needsLogin("GET", "/api/hot"), "内容类写接口：读放行");
        assertTrue(debateWrite.needsLogin("POST", "/api/hot/t1/boost"), "写要登录");
    }
}
