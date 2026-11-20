package com.siyige.social;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存版未读缓存：{@code siyige.redis.enabled=false} 时启用（没有 Redis 的开发环境 / 单测）。
 *
 * <p>语义与 {@link RedisSocialUnreadCounter} **逐条对齐**（这也是能拿它做单测的原因）：
 * <ul>
 *   <li>没初始化过 → {@link #total} 返回 null（触发一次按库重建）</li>
 *   <li>递减减到 ≤0 → 删掉该会话（不会出现负数）</li>
 *   <li>重建会先清空再写入，不会残留已删除会话的数字</li>
 * </ul>
 *
 * <p>进程重启即丢失，与 Redis 重启丢缓存是同一类代价（都会在下一次进会话列表时自愈）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class InMemorySocialUnreadCounter implements SocialUnreadCounter {

    /** userId → (convId → 未读条数)。 */
    private final Map<String, Map<Long, Integer>> data = new ConcurrentHashMap<>();
    /** 已经初始化过的用户（区分「没有未读」和「还没建过缓存」）。 */
    private final Set<String> initialized = ConcurrentHashMap.newKeySet();

    @Override
    public Integer total(String userId) {
        if (userId == null || !initialized.contains(userId)) return null;
        int sum = 0;
        for (int v : data.getOrDefault(userId, Map.of()).values()) sum += Math.max(0, v);
        return sum;
    }

    @Override
    public int of(String userId, long convId) {
        if (userId == null) return 0;
        Integer v = data.getOrDefault(userId, Map.of()).get(convId);
        return v == null ? 0 : Math.max(0, v);
    }

    @Override
    public void incr(String userId, long convId) {
        if (userId == null) return;
        initialized.add(userId);
        data.computeIfAbsent(userId, k -> new ConcurrentHashMap<>()).merge(convId, 1, Integer::sum);
    }

    @Override
    public int decr(String userId, long convId, long n) {
        if (userId == null || n <= 0) return of(userId, convId);
        Map<Long, Integer> m = data.get(userId);
        if (m == null) return 0;
        int left = (int) Math.max(0, (long) m.getOrDefault(convId, 0) - n);
        if (left <= 0) m.remove(convId);
        else m.put(convId, left);
        return left;
    }

    @Override
    public void rebuild(String userId, Map<Long, Integer> perConv) {
        if (userId == null) return;
        Map<Long, Integer> fresh = new ConcurrentHashMap<>();
        if (perConv != null) {
            for (Map.Entry<Long, Integer> e : perConv.entrySet()) {
                if (e.getValue() != null && e.getValue() > 0) fresh.put(e.getKey(), e.getValue());
            }
        }
        data.put(userId, fresh);
        initialized.add(userId);
    }

    @Override
    public void clear(String userId) {
        if (userId == null) return;
        data.remove(userId);
        initialized.remove(userId);
    }
}
