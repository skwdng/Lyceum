package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 无 Redis 时的登出黑名单（单机内存实现）。
 *
 * <p>只在 {@code siyige.redis.enabled=false} 时生效——本机开发/演示用。
 * 生产走 {@link RedisTokenBlacklist}（多实例共享）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemoryTokenBlacklist implements TokenBlacklist {

    private static final Logger log = LoggerFactory.getLogger(InMemoryTokenBlacklist.class);

    /** jti -> 过期时间 */
    private final Map<String, Instant> revoked = new ConcurrentHashMap<>();

    public InMemoryTokenBlacklist() {
        log.info("登出黑名单：使用内存实现（未启用 Redis）");
    }

    @Override
    public void add(String jti, Duration ttl) {
        if (jti == null || jti.isBlank()) return;
        revoked.put(jti, Instant.now().plus(ttl == null ? Duration.ofHours(2) : ttl));
    }

    @Override
    public boolean contains(String jti) {
        if (jti == null || jti.isBlank()) return false;
        Instant exp = revoked.get(jti);
        if (exp == null) return false;
        if (Instant.now().isAfter(exp)) { revoked.remove(jti); return false; }
        return true;
    }
}
