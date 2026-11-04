package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * {@link TokenBlacklist} 的 Redis 实现：key = {@code jwt:bl:{jti}}，value 随便放个 1。
 *
 * <p><b>决策（Q1）</b>：Redis 不可用时**不放行**——查不到黑名单就无法判断这个 token 是否已登出，
 * 放行等于让登出失效。所以这里把异常翻译成 503 {@code SERVICE_UNAVAILABLE}。
 *
 * <p>影响面：只有"带 token 的请求"会受影响；匿名只读不碰这里，仍然 200。
 */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
public class RedisTokenBlacklist implements TokenBlacklist {

    private static final Logger log = LoggerFactory.getLogger(RedisTokenBlacklist.class);

    private static final String KEY_PREFIX = "jwt:bl:";

    private final StringRedisTemplate redis;

    public RedisTokenBlacklist(AuthRedis authRedis) {
        this.redis = authRedis.template();
    }

    @Override
    public void add(String jti, Duration ttl) {
        if (jti == null || jti.isBlank()) return;
        try {
            redis.opsForValue().set(KEY_PREFIX + jti, "1", ttl == null || ttl.isNegative() || ttl.isZero()
                    ? Duration.ofMinutes(1) : ttl);
        } catch (RuntimeException e) {
            log.error("写 token 黑名单失败 jti={}", jti, e);
            throw AuthException.serviceUnavailable("登录服务暂时不可用（Redis）");
        }
    }

    @Override
    public boolean contains(String jti) {
        if (jti == null || jti.isBlank()) return false;
        try {
            return Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX + jti));
        } catch (RuntimeException e) {
            log.error("查 token 黑名单失败 jti={}", jti, e);
            throw AuthException.serviceUnavailable("登录服务暂时不可用（Redis）");
        }
    }
}
