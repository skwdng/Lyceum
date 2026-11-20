package com.siyige.auth;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * 没有 Redis 时的登录限流/黑名单装配。
 *
 * <p>与 {@link LoginRateLimiterConfig} 对称：那边负责 Redis 版（带 {@code siyige.redis.enabled}
 * 条件），这边负责内存版。两边条件互斥，不会同时生效。
 */
@Configuration
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemoryAuthBeans {

    /** 用户端：主 bean。 */
    @Bean
    @Primary
    public LoginRateLimiter userLoginRateLimiterInMemory() {
        return new InMemoryLoginRateLimiter("auth:");
    }

    /** 管理端：独立前缀，独立计数（管理端 Controller 按名字注入）。 */
    @Bean
    public LoginRateLimiter adminLoginRateLimiter() {
        return new InMemoryLoginRateLimiter("adm:");
    }
}
