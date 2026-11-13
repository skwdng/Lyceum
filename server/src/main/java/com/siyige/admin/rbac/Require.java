package com.siyige.admin.rbac;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明一个管理接口需要哪些权限点。
 *
 * <pre>
 *   &#64;Require(Perm.USER_BAN)
 *   &#64;PostMapping("/{id}/ban")
 *   public void ban(...) { ... }
 * </pre>
 *
 * <p>可以标在方法上，也可以标在类上（此时类里所有方法都要求该权限，方法上的注解仍然生效）。
 *
 * <p>多个权限点是 **"任一命中即放行"**（OR），不是 AND —— 一个接口通常只对应一个职责，
 * 需要多权限点写多个值的地方，语义就是"这几个角色都能进"。
 *
 * <p>校验逻辑只有 {@link RequireAspect} 一处；**别在 Controller 里手写 if 判角色**。
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface Require {

    /** 需要的权限点，任一命中即放行。不能为空（空等于不设防，不如不标）。 */
    Perm[] value();
}
