package com.siyige.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 认证接口（独立模块，不并入社区包；契约见 docs/认证接口契约.md）。
 *
 * <pre>
 *   POST  /api/auth/register  {account,password}      -> {token, user:{id,account,name}}
 *   POST  /api/auth/login     {account,password}      -> {token, user:{id,account,name}}
 *   POST  /api/auth/logout    Authorization: Bearer   -> 204
 *   GET   /api/auth/me        Authorization: Bearer   -> {id,account,name}
 *   PATCH /api/auth/me        {name}                  -> {id,account,name}
 * </pre>
 *
 * <p>本控制器**不经过** JwtAuthFilter（过滤器只挂 /api/community/*），
 * 所以 me / logout 自己校验 Bearer —— 否则登录接口会被"需要登录"挡住。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final String BEARER = "Bearer ";

    private final AuthService auth;
    private final JwtService jwt;
    private final TokenBlacklist blacklist;
    private final LoginRateLimiter limiter;

    public AuthController(AuthService auth, JwtService jwt, TokenBlacklist blacklist, LoginRateLimiter limiter) {
        this.auth = auth;
        this.jwt = jwt;
        this.blacklist = blacklist;
        this.limiter = limiter;
    }

    // ==================== 注册 / 登录 ====================

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody(required = false) AuthDtos.RegisterRequest req) {
        AuthDtos.AuthUser user = auth.register(req);
        return withToken(user);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody(required = false) AuthDtos.LoginRequest req,
                                     HttpServletRequest http) {
        String account = AuthService.normalizeAccount(req == null ? null : req.account());
        String ip = clientIp(http);

        // 先看是否已被锁（Redis 不可用 -> 503）
        limiter.assertAllowed(account, ip);

        try {
            AuthDtos.AuthUser user = auth.login(req);
            limiter.onSuccess(account);
            log.info("登录成功 account={} ip={}", account, ip);
            return withToken(user);
        } catch (AuthException e) {
            if ("BAD_CREDENTIALS".equals(e.code())) {
                limiter.onFailure(account, ip);
            }
            throw e;
        }
    }

    // ==================== 登出 / 我 ====================

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        JwtService.ParsedToken token = requireToken(authorization);
        blacklist.add(token.jti(), token.remaining());
        log.info("登出 account={}", token.account());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        JwtService.ParsedToken token = requireToken(authorization);
        return userView(auth.me(token.userId()));
    }

    @PatchMapping("/me")
    public Map<String, Object> updateName(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) AuthDtos.UpdateNameRequest req) {
        JwtService.ParsedToken token = requireToken(authorization);
        return userView(auth.updateName(token.userId(), req == null ? null : req.name()));
    }

    // ==================== 内部 ====================

    private Map<String, Object> withToken(AuthDtos.AuthUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", jwt.issue(user.id(), user.account()));
        out.put("user", userView(user));
        return out;
    }

    private static Map<String, Object> userView(AuthDtos.AuthUser user) {
        Map<String, Object> u = new LinkedHashMap<>();
        u.put("id", user.id());
        u.put("account", user.account());
        u.put("name", user.name());
        return u;
    }

    /** auth 侧自己校验 Bearer（过滤器不覆盖 /api/auth/**）。 */
    private JwtService.ParsedToken requireToken(String authorization) {
        if (authorization == null) throw AuthException.unauthorized();
        String raw = authorization.trim();
        if (raw.length() <= BEARER.length() || !raw.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            throw AuthException.unauthorized();
        }
        JwtService.ParsedToken parsed = jwt.parse(raw.substring(BEARER.length()).trim());
        if (parsed == null) throw AuthException.unauthorized();
        if (blacklist.contains(parsed.jti())) throw AuthException.unauthorized();
        return parsed;
    }

    /** 取客户端 IP：优先 X-Forwarded-For 第一跳（反向代理后面才有意义）。 */
    static String clientIp(HttpServletRequest req) {
        if (req == null) return null;
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return req.getRemoteAddr();
    }
}
