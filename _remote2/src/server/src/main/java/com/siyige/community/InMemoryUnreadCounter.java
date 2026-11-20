package com.siyige.community;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 未读角标的内存实现：只在 {@code siyige.redis.enabled=false} 时生效（本机开发/演示）。
 *
 * <p>语义与 {@link RedisUnreadCounter} 逐条对齐，尤其是
 * 「减到 ≤0 就移除 field，之后 {@link #get} 回到 0」和「field 不存在时递减返回 -1、计数不动」。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemoryUnreadCounter implements UnreadCounter {

    private final Map<String, Long> counts = new ConcurrentHashMap<>();

    @Override
    public long get(String userId) {
        return counts.getOrDefault(userId, 0L);
    }

    @Override
    public void incr(String userId) {
        counts.merge(userId, 1L, Long::sum);
    }

    @Override
    public long decrement(String userId, int n) {
        if (n <= 0) return -1L;
        Long cur = counts.get(userId);
        if (cur == null) return -1L;              // 本来没有 field：不动（对齐 Lua 的 -1 分支）
        long v = cur - n;
        if (v <= 0) {
            counts.remove(userId);                // 减到 0 就删掉 field（红点消失）
            return 0L;
        }
        counts.put(userId, v);
        return v;
    }
}
