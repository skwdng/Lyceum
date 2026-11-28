package com.siyige.auth;

/**
 * 认证模块的请求 / 响应对象。
 *
 * <p><b>安全要求（违反即返工）</b>：所有带密码的 DTO，{@code toString()} 只允许打印 account，
 * 绝不能把 password 带进日志、异常或调试输出。
 */
public final class AuthDtos {

    private AuthDtos() { }

    /**
     * 注册入参。
     *
     * <p>{@code phone} 自 2026-11-28 起**必填**（中国大陆 11 位手机号），
     * 本期只做「必填 + 存下来 + 不重复」，不收验证码、不接短信。
     *
     * <p>{@code toString()} 仍然只打 account：手机号也是个人敏感信息，
     * 日志里只允许出现脱敏形态（AuthService#maskPhone）。
     */
    public record RegisterRequest(String account, String password, String phone) {
        @Override
        public String toString() {
            return "RegisterRequest[account=" + account + "]";
        }
    }

    /** 登录入参。 */
    public record LoginRequest(String account, String password) {
        @Override
        public String toString() {
            return "LoginRequest[account=" + account + "]";
        }
    }

    /**
     * 改密入参。
     *
     * <p><b>安全要求</b>：{@code toString()} **绝不能**带出密码——日志里出现一个就够致命。
     */
    public record ChangePasswordRequest(String oldPassword, String newPassword) {
        @Override
        public String toString() {
            return "ChangePasswordRequest[<redacted>]";
        }
    }
    /** 改昵称入参。 */
    public record UpdateNameRequest(String name) {
        @Override
        public String toString() {
            return "UpdateNameRequest[name=" + name + "]";
        }
    }

    /**
     * 对外暴露的用户视图：id / account / name / phone。
     *
     * <p>绝不含 password_hash、status 等内部字段——它会被直接序列化进响应体。
     *
     * <p>{@code phone}：**自己的资料按原样返回**（不脱敏，前端要能显示/复制），
     * 存量老账号没有手机号，这里是 {@code null}。
     */
    public record AuthUser(String id, String account, String name, String phone) { }
}
