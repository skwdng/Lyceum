package com.siyige.auth;

/**
 * 当前请求的登录身份（ThreadLocal）。
 *
 * <p>由 {@link JwtAuthFilter} 在请求进入时写入、请求结束时清理；社区 Controller / Service 只读它，
 * 不再从 {@code X-User-Id} 头或 body 里取身份（那套可伪造，已废弃）。
 *
 * <p>语义分两种：
 * <ul>
 *   <li>{@link #current()} —— 可能为 null，读接口用它（匿名可读，liked 恒 false）</li>
 *   <li>{@link #require()} —— 写接口用它，为空即 401 UNAUTHORIZED</li>
 * </ul>
 */
public final class UserContext {

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private UserContext() { }

    public static void set(String userId) {
        CURRENT.set(userId);
    }

    /** 当前登录用户 id；未登录返回 null。 */
    public static String current() {
        return CURRENT.get();
    }

    /** 已登录返回 id；未登录抛 401。 */
    public static String require() {
        String id = CURRENT.get();
        if (id == null || id.isBlank()) throw AuthException.unauthorized();
        return id;
    }

    /**
     * 当前登录用户 id —— **全项目取身份的唯一入口**（JWT 的 {@code sub}）。
     *
     * <p>与 {@link #require()} 完全等价，只是把名字写明白：调用点一眼就知道"这是在取 userId"，
     * 不会误以为是"取某个可选用户"。
     *
     * <p>为什么另起一个名字而不改名：{@code community/} 包里有 12 处在用 {@code require()}，
     * 而本期红线禁止改社区包，所以保留旧名、只新增别名。
     *
     * <p><b>铁律</b>：Controller 不许再从请求参数里读 {@code userId} / {@code userName} ——
     * 一律从这里取，请求里带的同名字段一律忽略。
     */
    public static String requireId() {
        return require();
    }

    public static boolean isLoggedIn() {
        String id = CURRENT.get();
        return id != null && !id.isBlank();
    }

    /** 请求结束必须调用，避免线程复用导致身份串号。 */
    public static void clear() {
        CURRENT.remove();
    }
}
