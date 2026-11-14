package com.siyige.admin.analytics;

import com.siyige.auth.AuthDtos;
import com.siyige.auth.UserContext;
import com.siyige.track.PvStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * @Active 切面：只对打了注解的方法生效、匿名跳过、打点失败不影响业务返回值。
 *
 * <p>用 {@link AspectJProxyFactory} 直接织入，不起 Spring 上下文（快，且只测切面本身）。
 */
class ActiveUserAspectTest {

    /** 被切的业务方法（模拟 LikeService 那种形态）。 */
    public static class DemoService {
        @Active
        public String like() {
            return "ok";
        }

        public String plain() {
            return "ok";
        }
    }

    private final PvStore store = mock(PvStore.class);
    private final ActiveUserAspect aspect = new ActiveUserAspect(store);

    private DemoService proxy() {
        AspectJProxyFactory factory = new AspectJProxyFactory(new DemoService());
        factory.addAspect(aspect);
        return factory.getProxy();
    }

    @AfterEach
    void clearContext() {
        UserContext.set(null);
    }

    @Test
    void 打了注解的方法返回后记活跃() {
        UserContext.set("u1");
        assertEquals("ok", proxy().like());
        verify(store).addActive(anyString(), eq("u1"));
    }

    @Test
    void 没打注解的方法不记() {
        UserContext.set("u1");
        proxy().plain();
        verifyNoInteractions(store);
    }

    @Test
    void 匿名不记假身份() {
        UserContext.set(null);
        proxy().like();
        verifyNoInteractions(store);
    }

    @Test
    void 打点失败不影响业务() {
        doThrow(new RuntimeException("redis down")).when(store).addActive(anyString(), anyString());
        UserContext.set("u1");
        // 切面吞掉异常：业务照常返回
        assertEquals("ok", proxy().like());
    }

    @Test
    void 登录从返回值取userId() {
        aspect.afterLogin(new AuthDtos.AuthUser("u9", "acc", "昵称"));
        verify(store).addActive(anyString(), eq("u9"));
    }

    @Test
    void 登录返回非AuthUser时忽略() {
        aspect.afterLogin(null);
        aspect.afterLogin("not-a-user");
        verifyNoInteractions(store);
    }
}
