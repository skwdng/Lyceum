package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 无 Redis 时的登录限流（单机内存实现）。
 *
 * <p>只在 {@code siyige.redis.enabled=false} 时生效——本机开发/演示用。
 * 生产仍走 {@link RedisLoginRateLimiter}，语义不变（多实例共享锁）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemoryLoginRateLimiter implements LoginRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(InMemoryLoginRateLimiter.class);

    private static final int ACCT_MAX_FAILS = 5;
    private static final long ACCT_WINDOW_MS = 5 * 60_000L;
    private static final long ACCT_LOCK_MS = 15 * 60_000L;

    private static final int IP_MAX_FAILS = 20;
    private static final long IP_WINDOW_MS = 5 * 60_000L;
    private static final long IP_LOCK_MS = 5 * 60_000L;

    /** 失败时间戳（滑动窗口） */
    private final Map<String, Deque<Long>> fails = new ConcurrentHashMap<>();
    /** 锁定到期时间 */
    private final Map<String, Long> locks = new ConcurrentHashMap<>();

    public InMemoryLoginRateLimiter() {
        log.info("登录限流：使用内存实现（未启用 Redis）");
    }

    @Override
    public void assertAllowed(String account, String ip) {
        if (locked("acct:" + account)) throw AuthException.tooManyAttempts("尝试次数过多，请 15 分钟后再试");
        if (ip != null && locked("ip:" + ip)) throw AuthException.tooManyAttempts("尝试次数过多，请稍后再试");
    }

    @Override
    public void onFailure(String account, String ip) {
        long now = Instant.now().toEpochMilli();
        if (count("acct:" + account, ACCT_WINDOW_MS, now) >= ACCT_MAX_FAILS) {
            locks.put("acct:" + account, now + ACCT_LOCK_MS);
            log.warn("账号因连续失败被锁定 account={}", account);
        }
        if (ip != null && !ip.isBlank() && count("ip:" + ip, IP_WINDOW_MS, now) >= IP_MAX_FAILS) {
            locks.put("ip:" + ip, now + IP_LOCK_MS);
            log.warn("IP 因连续失败被锁定 ip={}", ip);
        }
    }

    @Override
    public void onSuccess(String account) {
        fails.remove("acct:" + account);
        locks.remove("acct:" + account);
    }

    private boolean locked(String key) {
        Long until = locks.get(key);
        if (until == null) return false;
        if (System.currentTimeMillis() > until) { locks.remove(key); return false; }
        return true;
    }

    private long count(String key, long windowMs, long now) {
        Deque<Long> q = fails.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > windowMs) q.pollFirst();
            q.addLast(now);
            return q.size();
        }
    }
}
