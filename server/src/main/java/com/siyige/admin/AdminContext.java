package com.siyige.admin;

import com.siyige.auth.AuthException;

/**
 * 当前请求的管理员身份（ThreadLocal）。
 *
 * <p>由 {@link AdminAuthFilter} 在请求进入时写入、结束时清理；
 * 管理端 Controller 从这里取 `handled_by`，**绝不**从请求头或 body 里取管理员 id。
 */
public final class AdminContext {

    private static final ThreadLocal<Long> ID = new ThreadLocal<>();
    private static final ThreadLocal<String> ACCOUNT = new ThreadLocal<>();

    private AdminContext() { }

    public static void set(Long id, String account) {
        ID.set(id);
        ACCOUNT.set(account);
    }

    /** 当前管理员 id；未登录返回 null。 */
    public static Long id() {
        return ID.get();
    }

    public static String account() {
        return ACCOUNT.get();
    }

    /** 已登录返回 id；否则抛 403 NOT_ADMIN（正常情况下过滤器已拦，这里兜底）。 */
    public static long requireId() {
        Long id = ID.get();
        if (id == null) throw AuthException.notAdmin();
        return id;
    }

    public static boolean isLoggedIn() {
        return ID.get() != null;
    }

    /** 请求结束必须调用，避免线程复用导致身份串号。 */
    public static void clear() {
        ID.remove();
        ACCOUNT.remove();
    }
}
