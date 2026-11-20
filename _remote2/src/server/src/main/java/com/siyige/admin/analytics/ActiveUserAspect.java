package com.siyige.admin.analytics;

import com.siyige.auth.AuthDtos;
import com.siyige.auth.UserContext;
import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 活跃用户打点切面（设计文档 §2.6 / §3.1）。
 *
 * <p>两个切点，分开是有原因的：
 * <ol>
 *   <li>{@link Active} 注解：业务方法<b>返回后</b>读 {@link UserContext} 取人。
 *       这些接口都在 {@code JwtAuthFilter} 之后，ThreadLocal 里一定有 userId。</li>
 *   <li>{@code AuthService#login}：登录是**匿名接口**（过滤器放行），执行时 ThreadLocal 还是空的，
 *       所以只能从返回值 {@link AuthDtos.AuthUser#id()} 里取。单独写一个切点，
 *       比在业务方法里插一行埋点更干净（登录方法体一个字不动）。</li>
 * </ol>
 *
 * <p>三条纪律：
 * <ul>
 *   <li>切面里发生的任何异常都必须吞掉 —— 统计不能把登录/发帖搞失败；</li>
 *   <li>匿名调用（UserContext 为空）直接跳过，不记 {@code u-demo} 这类假身份；</li>
 *   <li>用 HLL，重复打点不重复计数，所以 RoomService 开局 → MatchService 开局 的链路重复织入也无害。</li>
 * </ul>
 */
@Aspect
@Component
public class ActiveUserAspect {

    private static final Logger log = LoggerFactory.getLogger(ActiveUserAspect.class);

    private final PvStore store;

    public ActiveUserAspect(PvStore store) {
        this.store = store;
    }

    /** 登录/开局/发言/发帖/评论/私信/点赞/举报：返回后记活跃。 */
    @AfterReturning("@annotation(com.siyige.admin.analytics.Active)")
    public void afterActive() {
        mark(UserContext.current());
    }

    /** 登录成功：身份只能从返回值取（此时 ThreadLocal 还没有值）。 */
    @AfterReturning(pointcut = "execution(* com.siyige.auth.AuthService.login(..))", returning = "ret")
    public void afterLogin(Object ret) {
        if (ret instanceof AuthDtos.AuthUser user) {
            mark(user.id());
        }
    }

    private void mark(String userId) {
        if (userId == null || userId.isBlank()) return;
        try {
            store.addActive(DayKeys.today(), userId);
        } catch (Exception e) {
            // 打点失败绝不影响主流程；debug 级，避免 Redis 抖动时刷屏
            log.debug("活跃打点失败（已忽略） userId={}", userId, e);
        }
    }
}
