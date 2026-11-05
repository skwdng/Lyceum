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
    /** 认证状态（封禁 + 改密时间）：/api/auth 自己不经过滤器，这里也要判「改密后旧令牌失效」。 */
    private final UserStatusSource userStatus;

    public AuthController(AuthService auth, JwtService jwt, TokenBlacklist blacklist,
                          LoginRateLimiter limiter, UserStatusSource userStatus) {
        this.auth = auth;
        this.jwt = jwt;
        this.blacklist = blacklist;
        this.limiter = limiter;
        this.userStatus = userStatus;
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

    /**
     * 改密码：`{oldPassword,newPassword}` → **204**。
     *
     * <p>改完该账号**所有旧令牌立刻失效**（含当前这一个）——前端收到 204 后应清本地令牌、
     * 回登录页重新登录。错误：400 `INVALID_PARAM`（旧密码不正确 / 新密码不合规 / 新旧相同）
     * 或 401（未登录 / 令牌已失效）。
     */
    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) AuthDtos.ChangePasswordRequest req) {
        JwtService.ParsedToken token = requireToken(authorization);
        auth.changePassword(token.userId(),
                req == null ? null : req.oldPassword(),
                req == null ? null : req.newPassword());
        return ResponseEntity.noContent().build();
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
        AuthState state = userStatus.authState(parsed.userId());
        // 全站封禁：与 JwtAuthFilter 保持一致——封禁后连 /me、改名、退出都不许
        if (state.disabled()) throw AuthException.accountDisabled();
        // 改密后旧令牌在这里也要失效——否则它能继续调 /me、/me(PATCH)、甚至再改一次密码
        if (state.isTokenStale(parsed.issuedAt())) {
            throw AuthException.tokenStale();
        }
        return parsed;
    }

    /** 取客户端 IP（实现见 {@link ClientIp}；管理端登录复用同一份逻辑）。 */
    static String clientIp(HttpServletRequest req) {
        return ClientIp.of(req);
    }
}
