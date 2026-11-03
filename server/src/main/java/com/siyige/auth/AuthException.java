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
}
