package com.siyige.admin.rbac;

import org.springframework.http.HttpStatus;

/**
 * 权限 / 首登改密相关的 403。
 *
 * <p>为什么不复用 {@code com.siyige.auth.AuthException}：那是**用户侧**（`com.siyige.auth`）的类，
 * 本次任务的红线是不动用户侧代码。管理端的 403 语义自己一套，由 {@code AdminErrors} 统一映射。
 *
 * <p>三种 code：
 * <ul>
 *   <li>{@code NOT_ADMIN} —— 没登录 / 令牌不是管理员 / 角色缺失</li>
 *   <li>{@code FORBIDDEN_PERM} —— 登录了但权限点不够，message 里带缺少的权限点</li>
 *   <li>{@code PASSWORD_CHANGE_REQUIRED} —— 首登（或重置密码后）必须先改密</li>
 * </ul>
 *
 * <p>全部是 **403**：401 留给"你没登录"，403 是"你登录了但不许"。
 */
public class RbacException extends RuntimeException {

    private final String code;

    private RbacException(String code, String message) {
        super(code + ": " + message);
        this.code = code;
    }

    public String code() {
        return code;
    }

    public HttpStatus status() {
        return HttpStatus.FORBIDDEN;
    }

    /** 没有管理员身份（过滤器已兜底，这里是切面里的第二道）。 */
    public static RbacException notAdmin() {
        return new RbacException("NOT_ADMIN", "需要管理员身份");
    }

    /** 权限点不足：把缺的权限点写进文案，排查时不用猜。 */
    public static RbacException forbidden(java.util.Collection<String> missing) {
        return new RbacException("FORBIDDEN_PERM",
                "缺少权限 " + String.join(" / ", missing) + "，请联系超管分配");
    }

    /** 首登 / 重置密码后强制改密：除改密与 /me 之外一律拦住。 */
    public static RbacException passwordChangeRequired() {
        return new RbacException("PASSWORD_CHANGE_REQUIRED", "首次登录必须先修改密码");
    }
}
