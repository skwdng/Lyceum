package com.siyige.auth;

import org.springframework.http.HttpStatus;

/**
 * 认证模块的业务异常：带机读 {@code code} 与 HTTP 状态，由 AuthErrors 统一翻译。
 *
 * <p>错误码集合（见 docs/认证接口契约.md）：
 * <ul>
 *   <li>{@code INVALID_PARAM} 400 —— 用户名/密码/昵称不合法</li>
 *   <li>{@code ACCOUNT_TAKEN} 409 —— 注册时用户名已存在</li>
 *   <li>{@code BAD_CREDENTIALS} 401 —— 用户名或密码错误（**不区分**账号不存在）</li>
 *   <li>{@code UNAUTHORIZED} 401 —— 未登录 / token 失效 / 已登出</li>
 *   <li>{@code TOO_MANY_ATTEMPTS} 429 —— 触发失败次数限制</li>
 *   <li>{@code SERVICE_UNAVAILABLE} 503 —— Redis 不可用（登录/限流/黑名单依赖它）</li>
 * </ul>
 *
 * <p>注意：异常 message 里**永远不含密码**，只允许出现账号名。
 */
public class AuthException extends RuntimeException {

    private final String code;
    private final HttpStatus status;

    public AuthException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String code() { return code; }

    public HttpStatus status() { return status; }

    // ---------- 常用工厂 ----------

    public static AuthException invalidParam(String message) {
        return new AuthException("INVALID_PARAM", HttpStatus.BAD_REQUEST, "INVALID_PARAM: " + message);
    }

    public static AuthException accountTaken() {
        return new AuthException("ACCOUNT_TAKEN", HttpStatus.CONFLICT, "ACCOUNT_TAKEN: 该用户名已被占用");
    }

    /** 登录失败统一文案（安全要求：不区分"账号不存在"与"密码错误"）。 */
    public static AuthException badCredentials() {
        return new AuthException("BAD_CREDENTIALS", HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS: 用户名或密码错误");
    }

    public static AuthException unauthorized() {
        return new AuthException("UNAUTHORIZED", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED: 未登录或登录已过期");
    }

    public static AuthException tooManyAttempts(String message) {
        return new AuthException("TOO_MANY_ATTEMPTS", HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS: " + message);
    }

    public static AuthException serviceUnavailable(String message) {
        return new AuthException("SERVICE_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE,
                "SERVICE_UNAVAILABLE: " + message);
    }

    // ---------- 治理相关（举报 / 禁言 / 管理员） ----------

    /**
     * 管理员令牌被拿去访问社区接口：401 `NOT_ADMIN`。
     *
     * <p>为什么不"当匿名放行"：出示了一个**类型不对**的身份，跟没出示不是一回事；
     * 放行等于允许管理员以普通用户身份发帖、点赞，权限就串了。
     */
    public static AuthException notAdminOnCommunity() {
        return new AuthException("NOT_ADMIN", HttpStatus.UNAUTHORIZED,
                "NOT_ADMIN: 这是管理员令牌，不能用于普通用户接口");
    }

    /** 普通用户令牌访问管理端接口：403 `NOT_ADMIN`。 */
    public static AuthException notAdmin() {
        return new AuthException("NOT_ADMIN", HttpStatus.FORBIDDEN,
                "NOT_ADMIN: 需要管理员权限");
    }

    /** 令牌签发于改密之前：改完密码，该账号所有旧令牌立刻失效。 */
    public static AuthException tokenStale() {
        return new AuthException("TOKEN_STALE", HttpStatus.UNAUTHORIZED,
                "TOKEN_STALE: 密码已更新，请重新登录");
    }

    /** 全站封禁：登录接口与 JwtAuthFilter 共用。 */
    public static AuthException accountDisabled() {
        return new AuthException("ACCOUNT_DISABLED", HttpStatus.UNAUTHORIZED,
                "ACCOUNT_DISABLED: 账号已被封禁，请联系管理员");
    }

    /** 社区禁言：message 里带到期时间，前端直接展示。 */
    public static AuthException muted(String untilText) {
        return new AuthException("MUTED", HttpStatus.FORBIDDEN,
                "MUTED: 你已被禁言至 " + untilText);
    }

    // ---------- 辩论侧（对局归属 / 令牌类型） ----------

    /**
     * 登录了，但这场对局不是你的：403 `FORBIDDEN`。
     *
     * <p>与 401 严格分工：401 = 你没登录（过滤器负责）；403 = 你登录了但无权（{@link MatchAccess} 负责）。
     */
    public static AuthException forbidden(String message) {
        return new AuthException("FORBIDDEN", HttpStatus.FORBIDDEN, "FORBIDDEN: " + message);
    }

    /** 管理员令牌被拿去访问对局接口：401 `NOT_ADMIN`（同社区侧理由，不能当匿名放行）。 */
    public static AuthException notAdminOnDebate() {
        return new AuthException("NOT_ADMIN", HttpStatus.UNAUTHORIZED,
                "NOT_ADMIN: 这是管理员令牌，不能用于对局接口");
    }
}
