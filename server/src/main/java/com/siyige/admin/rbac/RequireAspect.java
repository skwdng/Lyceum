package com.siyige.admin.rbac;

import com.siyige.admin.AdminContext;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * {@link Require} 的执行者：取当前管理员角色 → 查 {@link AdminRole#perms()} → 不够就 403。
 *
 * <p>三条硬要求（设计方案 §4、执行提示词 1.3）：
 * <ol>
 *   <li>角色**从 ThreadLocal 读**（过滤器每请求从数据库查出来写进去的），不读令牌、不读请求头</li>
 *   <li>角色缺失（`AdminContext.role() == null`）→ 403 {@code NOT_ADMIN}，
 *       **不能**当成"没权限限制"放过去</li>
 *   <li>权限不足 → 403 {@code FORBIDDEN_PERM}，文案里带缺少的权限点</li>
 * </ol>
 *
 * <p>用 `aspectjweaver`（pom 里已有，管理台埋点用着），不引新依赖。
 */
@Aspect
@Component
public class RequireAspect {

    private static final Logger log = LoggerFactory.getLogger(RequireAspect.class);

    /** 方法上标了 {@link Require}。 */
    @Around("@annotation(require)")
    public Object aroundMethod(ProceedingJoinPoint pjp, Require require) throws Throwable {
        check(require, pjp);
        return pjp.proceed();
    }

    /** 类上标了 {@link Require}（方法上没再标时生效，避免重复校验两次）。 */
    @Around("@within(require) && !@annotation(com.siyige.admin.rbac.Require)")
    public Object aroundClass(ProceedingJoinPoint pjp, Require require) throws Throwable {
        check(require, pjp);
        return pjp.proceed();
    }

    static void check(Require require, ProceedingJoinPoint pjp) {
        AdminRole role = AdminContext.role();
        if (role == null) {
            // 过滤器已经拦过一遍，这里是第二道；宁可 403 也不要静默放行
            log.warn("权限校验失败：当前请求没有管理员角色 {}", where(pjp));
            throw RbacException.notAdmin();
        }

        Perm[] need = require == null ? new Perm[0] : require.value();
        if (need.length == 0) {
            log.warn("@Require 没写权限点，按不放行处理 {}", where(pjp));
            throw RbacException.forbidden(List.of("（接口未声明权限点）"));
        }

        Set<Perm> mine = role.perms();
        for (Perm p : need) {
            if (mine.contains(p)) return;      // 任一命中即放行
        }

        List<String> missing = new ArrayList<>(need.length);
        for (Perm p : need) missing.add(p.code());
        log.info("权限不足 role={} need={} target={}", role, missing, where(pjp));
        throw RbacException.forbidden(missing);
    }

    /** 日志里定位用；拿不到签名也不能因此 NPE（切面绝不能因为日志挂掉）。 */
    private static String where(ProceedingJoinPoint pjp) {
        if (pjp == null) return "?";
        try {
            return pjp.getSignature() == null ? "?" : pjp.getSignature().toShortString();
        } catch (RuntimeException e) {
            return "?";
        }
    }
}
