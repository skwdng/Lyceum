package com.siyige.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * 登录限流的装配点：**两套独立实例**，用户端与管理端互不影响。
 *
 * <p>为什么必须分两套：<code>RedisLoginRateLimiter</code> 按「账号 + IP」计数。
 * 如果共用一套，用户侧有人拿 `admin` 当账号瞎试 5 次，真正管理员就被锁 15 分钟——
 * 一个廉价的拒绝服务。前缀分开（`auth:` / `adm:`）后就各算各的。
 *
 * <p>用户端那个标了 {@link Primary}，`AuthController` 按类型注入时默认拿到它；
 * 管理端在自己的 Controller 里用 {@code @Qualifier("adminLoginRateLimiter")} 显式指定。
 */
@Configuration
public class LoginRateLimiterConfig {

    /** 用户端 key 前缀。 */
    public static final String USER_PREFIX = "auth:";
    /** 管理端 key 前缀。 */
    public static final String ADMIN_PREFIX = "adm:";

    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
    @Bean
    @Primary
    public LoginRateLimiter userLoginRateLimiter(AuthRedis authRedis) {
        return new RedisLoginRateLimiter(authRedis, USER_PREFIX);
    }

    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
    @Bean
    public LoginRateLimiter adminLoginRateLimiter(AuthRedis authRedis) {
        return new RedisLoginRateLimiter(authRedis, ADMIN_PREFIX);
    }
}
