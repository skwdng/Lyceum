package com.siyige.auth;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * T4：认证五接口 + 错误体 + 限流接线。
 *
 * <p>Controller 用真实实现（含真实 JwtService），Service / 黑名单 / 限流用 mock，
 * 这样能覆盖"接口形状 + 错误码 + 调用时序"，又不依赖数据库和 Redis。
 */
class AuthControllerTest {

    private static final String SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";

    private final AuthService auth = mock(AuthService.class);
    private final JwtService jwt = new JwtService(SECRET);
    private final TokenBlacklist blacklist = mock(TokenBlacklist.class);
    private final LoginRateLimiter limiter = mock(LoginRateLimiter.class);

    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new AuthController(auth, jwt, blacklist, limiter))
            .setControllerAdvice(new AuthErrors())
            .build();

    private static AuthDtos.AuthUser user() {
        return new AuthDtos.AuthUser("zhang", "zhang", "老张");
    }

    private String validToken() {
        return jwt.issue("zhang", "zhang");
    }

    // ==================== 注册 ====================

    @Test
    void 注册成功返回token与user() throws Exception {
        when(auth.register(any())).thenReturn(user());

        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"abc12345\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.id").value("zhang"))
                .andExpect(jsonPath("$.user.account").value("zhang"))
                .andExpect(jsonPath("$.user.name").value("老张"))
                // 绝不能把密码/哈希带出来
                .andExpect(jsonPath("$.user.password").doesNotExist())
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
    }

    @Test
    void 注册密码不合规返回400_INVALID_PARAM() throws Exception {
        when(auth.register(any())).thenThrow(AuthException.invalidParam("密码至少 8 位"));

        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"abc123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    void 注册重复账号返回409_ACCOUNT_TAKEN() throws Exception {
        when(auth.register(any())).thenThrow(AuthException.accountTaken());

        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"abc12345\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ACCOUNT_TAKEN"));
    }

    // ==================== 登录 ====================

    @Test
    void 登录成功返回token_并清掉失败计数() throws Exception {
        when(auth.login(any())).thenReturn(user());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"Zhang\",\"password\":\"abc12345\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.name").value("老张"));

        // 账号应被规范化成小写后再去查限流/清计数
        verify(limiter).assertAllowed(eq("zhang"), anyString());
        verify(limiter).onSuccess("zhang");
        verify(limiter, never()).onFailure(anyString(), anyString());
    }

    @Test
    void 登录失败返回401且累计失败次数() throws Exception {
        when(auth.login(any())).thenThrow(AuthException.badCredentials());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"wrong12345\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("BAD_CREDENTIALS: 用户名或密码错误"));

        verify(limiter).onFailure(eq("zhang"), anyString());
        verify(limiter, never()).onSuccess(anyString());
    }

    @Test
    void 达到失败上限返回429() throws Exception {
        doThrow(AuthException.tooManyAttempts("尝试次数过多，请 15 分钟后再试"))
                .when(limiter).assertAllowed(anyString(), any());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"abc12345\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));

        verify(auth, never()).login(any());   // 被锁时不应再去校验密码
    }

    @Test
    void Redis故障时登录返回503_不放行() throws Exception {
        doThrow(AuthException.serviceUnavailable("登录服务暂时不可用（Redis）"))
                .when(limiter).assertAllowed(anyString(), any());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"account\":\"zhang\",\"password\":\"abc12345\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("SERVICE_UNAVAILABLE"));
    }

    // ==================== 登出 ====================

    @Test
    void 登出把jti写进黑名单并返回204() throws Exception {
        String token = validToken();
        when(blacklist.contains(anyString())).thenReturn(false);

        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        ArgumentCaptor<String> jti = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Duration> ttl = ArgumentCaptor.forClass(Duration.class);
        verify(blacklist).add(jti.capture(), ttl.capture());
        assertEquals(jwt.parse(token).jti(), jti.getValue());
        assertTrue(ttl.getValue().toMinutes() <= 120 && ttl.getValue().toMinutes() >= 118,
                "TTL 应约等于 token 剩余有效期，实际 " + ttl.getValue());
    }

    @Test
    void 登出没有token返回401() throws Exception {
        mvc.perform(post("/api/auth/logout"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void 登出坏token返回401() throws Exception {
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer nonsense"))
                .andExpect(status().isUnauthorized());
    }

    // ==================== 我 ====================

    @Test
    void 查询我自己返回用户信息() throws Exception {
        when(auth.me("zhang")).thenReturn(user());
        when(blacklist.contains(anyString())).thenReturn(false);

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + validToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("zhang"))
                .andExpect(jsonPath("$.account").value("zhang"))
                .andExpect(jsonPath("$.name").value("老张"));
    }

    @Test
    void 查询我自己的401场景_无token与已登出() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());

        when(blacklist.contains(anyString())).thenReturn(true);   // 模拟已登出
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + validToken()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void 改昵称成功() throws Exception {
        when(blacklist.contains(anyString())).thenReturn(false);
        when(auth.updateName("zhang", "新昵称")).thenReturn(new AuthDtos.AuthUser("zhang", "zhang", "新昵称"));

        mvc.perform(patch("/api/auth/me")
                        .header("Authorization", "Bearer " + validToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"新昵称\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("新昵称"))
                .andExpect(jsonPath("$.account").value("zhang"));
    }

    @Test
    void 改昵称为空返回400() throws Exception {
        when(blacklist.contains(anyString())).thenReturn(false);
        when(auth.updateName(anyString(), any())).thenThrow(AuthException.invalidParam("昵称不能为空"));

        mvc.perform(patch("/api/auth/me")
                        .header("Authorization", "Bearer " + validToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    // ==================== 其它 ====================

    @Test
    void 请求体不是合法JSON返回400而不是500() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    void 客户端IP优先取XForwardedFor第一跳() {
        var req = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/auth/login");
        req.addHeader("X-Forwarded-For", "203.0.113.9, 10.0.0.1");
        assertEquals("203.0.113.9", AuthController.clientIp(req));

        var direct = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/auth/login");
        direct.setRemoteAddr("127.0.0.1");
        assertEquals("127.0.0.1", AuthController.clientIp(direct));
    }
}
