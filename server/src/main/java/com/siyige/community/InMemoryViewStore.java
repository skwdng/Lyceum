package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 无 Redis 时的浏览计数存储（单机内存实现）。
 *
 * <p>只在 {@code siyige.redis.enabled=false} 时生效——本机开发/演示用。
 * 语义与 {@link RedisViewStore} 对齐：同一用户同一天同一帖只计一次。
 * 生产仍走 Redis（多实例、Lua 原子、按天过期）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemoryViewStore implements ViewStore {

    private static final Logger log = LoggerFactory.getLogger(InMemoryViewStore.class);

    /** 去重集合：seenKey -> userId 集合 */
    private final Map<String, Set<String>> seen = new ConcurrentHashMap<>();
    /** 待回写增量：pendingKey -> (postId -> 增量) */
    private final Map<String, Map<Long, Long>> pending = new ConcurrentHashMap<>();

    public InMemoryViewStore() {
        log.info("浏览计数：使用内存实现（未启用 Redis）");
    }

    @Override
    public long recordSeen(String seenKey, String pendingKey, String userId, long postId, long expireAtEpochSecond) {
        Set<String> users = seen.computeIfAbsent(seenKey, k -> ConcurrentHashMap.newKeySet());
        if (!users.add(userId == null ? "anon" : userId)) return 0;   // 今天已经看过
        pending.computeIfAbsent(pendingKey, k -> new ConcurrentHashMap<>()).merge(postId, 1L, Long::sum);
        return 1;
    }

    @Override
    public Map<Long, Long> takePending(String pendingKey) {
        Map<Long, Long> got = pending.remove(pendingKey);
        return got == null ? new LinkedHashMap<>() : new LinkedHashMap<>(got);
    }

    @Override
    public void restorePending(String pendingKey, Map<Long, Long> increments) {
        if (increments == null || increments.isEmpty()) return;
        Map<Long, Long> target = pending.computeIfAbsent(pendingKey, k -> new ConcurrentHashMap<>());
        increments.forEach((k, v) -> target.merge(k, v, Long::sum));
    }

    @Override
    public Map<Long, Long> peekPending(String pendingKey, Collection<Long> postIds) {
        Map<Long, Long> out = new HashMap<>();
        Map<Long, Long> all = pending.get(pendingKey);
        if (all == null || postIds == null) return out;
        for (Long id : postIds) {
            Long v = all.get(id);
            if (v != null) out.put(id, v);
        }
        return out;
    }
}
