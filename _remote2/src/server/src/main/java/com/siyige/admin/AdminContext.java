package com.siyige.admin;

import com.siyige.admin.rbac.AdminRole;
import com.siyige.admin.rbac.Perm;
import com.siyige.admin.rbac.RbacException;
import com.siyige.auth.AuthException;

import java.util.Set;

/**
 * 当前请求的管理员身份（ThreadLocal）。
 *
 * <p>由 {@link AdminAuthFilter} 在请求进入时写入、结束时清理；
 * 管理端 Controller 从这里取 `handled_by`，**绝不**从请求头或 body 里取管理员 id。
 *
 * <p>R1 起多带三个东西（都由过滤器那**一条** SQL 一次性取出，不增加查询次数）：
 * <ul>
 *   <li>{@code role} —— 角色，权限矩阵的唯一输入</li>
 *   <li>{@code perms} —— 角色对应的权限点集合（由 {@link AdminRole#perms()} 推出来，不落库）</li>
 *   <li>{@code mustChangePwd} —— 首登/重置密码后强制改密标记</li>
 * </ul>
 */
public final class AdminContext {

    private static final ThreadLocal<Long> ID = new ThreadLocal<>();
    private static final ThreadLocal<String> ACCOUNT = new ThreadLocal<>();
    private static final ThreadLocal<AdminRole> ROLE = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> MUST_CHANGE_PWD = new ThreadLocal<>();

    private AdminContext() { }

    public static void set(Long id, String account) {
        set(id, account, null, false);
    }

    public static void set(Long id, String account, AdminRole role, boolean mustChangePwd) {
        ID.set(id);
        ACCOUNT.set(account);
        ROLE.set(role);
        MUST_CHANGE_PWD.set(mustChangePwd);
    }

    /** 当前管理员 id；未登录返回 null。 */
    public static Long id() {
        return ID.get();
    }

    public static String account() {
        return ACCOUNT.get();
    }

    /** 当前管理员角色；未登录或角色无法识别返回 null（调用方按 403 处理，不默认超管）。 */
    public static AdminRole role() {
        return ROLE.get();
    }

    /** 当前角色拥有的权限点；没有角色时返回空集（不是全部）。 */
    public static Set<Perm> perms() {
        AdminRole r = ROLE.get();
        return r == null ? Set.of() : r.perms();
    }

    public static boolean has(Perm perm) {
        AdminRole r = ROLE.get();
        return r != null && r.has(perm);
    }

    public static boolean mustChangePwd() {
        return Boolean.TRUE.equals(MUST_CHANGE_PWD.get());
    }

    /** 已登录返回 id；否则抛 403 NOT_ADMIN（正常情况下过滤器已拦，这里兜底）。 */
    public static long requireId() {
        Long id = ID.get();
        if (id == null) throw AuthException.notAdmin();
        return id;
    }

    /** 已登录且拥有该权限点；否则 403（切面之外的兜底，正常写法请用 {@code @Require}）。 */
    public static void requirePerm(Perm perm) {
        if (ROLE.get() == null) throw RbacException.notAdmin();
        if (!has(perm)) throw RbacException.forbidden(java.util.List.of(perm.code()));
    }

    public static boolean isLoggedIn() {
        return ID.get() != null;
    }

    /** 请求结束必须调用，避免线程复用导致身份串号。 */
    public static void clear() {
        ID.remove();
        ACCOUNT.remove();
        ROLE.remove();
        MUST_CHANGE_PWD.remove();
    }
}
