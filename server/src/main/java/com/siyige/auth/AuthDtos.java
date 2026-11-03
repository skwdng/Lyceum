package com.siyige.auth;

/**
 * 认证模块的请求 / 响应对象。
 *
 * <p><b>安全要求（违反即返工）</b>：所有带密码的 DTO，{@code toString()} 只允许打印 account，
 * 绝不能把 password 带进日志、异常或调试输出。
 */
public final class AuthDtos {

    private AuthDtos() { }

    /** 注册入参。 */
    public record RegisterRequest(String account, String password) {
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

    /** 改昵称入参。 */
    public record UpdateNameRequest(String name) {
        @Override
        public String toString() {
            return "UpdateNameRequest[name=" + name + "]";
        }
    }

    /**
     * 对外暴露的用户视图：只有 id / account / name。
     *
     * <p>绝不含 password_hash、status 等内部字段——它会被直接序列化进响应体。
     */
    public record AuthUser(String id, String account, String name) { }
}
