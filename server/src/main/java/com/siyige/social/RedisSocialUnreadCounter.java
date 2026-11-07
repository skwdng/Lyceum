package com.siyige.social;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Redis 版未读缓存：{@code social:unread:{userId}} 是一个 Hash，field = convId。
 *
 * <p>读：一次 {@code HGETALL} 就能同时喂饱「会话列表每行的数字」和「侧栏角标（求和）」，
 * 所以轮询角标只需要一次 Redis 往返、**零数据库查询**（换成 MySQL 后也不会有压力）。
 *
 * <p>写：
 * <ul>
 *   <li>发消息 → {@code HINCRBY +1}（Redis 单命令即原子）</li>
 *   <li>标已读 → Lua 原子递减 + 减到 ≤0 删 field（见 {@code lua/social_unread.lua}）</li>
 *   <li>进会话列表 / 冷启动 → 用数据库聚合结果整块重建（先 DEL 再 HSET，避免残留已删会话）</li>
 * </ul>
 *
 * <p>Redis 出错时**不让主流程失败**：发消息已经落库了，角标只是显示层，
 * 这里全部 catch 后 warn，读不到就返回 0（下一次进会话列表会自愈）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
public class RedisSocialUnreadCounter implements SocialUnreadCounter {

    private static final Logger log = LoggerFactory.getLogger(RedisSocialUnreadCounter.class);

    /** key 前缀：{@code social:unread:{userId}}。与通知的 notify:unread 刻意分开。 */
    static final String KEY_PREFIX = "social:unread:";

    /** 空 Hash 的哨兵 field：值为 0，求和时忽略。作用只是让 key 存在，避免每次都被判成冷缓存。 */
    static final String SENTINEL = "_";

    private static final String DECR_SCRIPT_PATH = "lua/social_unread.lua";

    private final StringRedisTemplate redis;
    private final RedisScript<Long> decrScript;

    public RedisSocialUnreadCounter(StringRedisTemplate redis) {
        this.redis = redis;
        this.decrScript = new DefaultRedisScript<>(read(DECR_SCRIPT_PATH), Long.class);
    }

    @Override
    public Integer total(String userId) {
        Map<Object, Object> all = readAll(userId);
        if (all == null) return null;                 // key 不存在 = 冷缓存，交给调用方重建
        long sum = 0;
        for (Map.Entry<Object, Object> e : all.entrySet()) {
            if (SENTINEL.equals(String.valueOf(e.getKey()))) continue;
            sum += parse(e.getValue());
        }
        return (int) Math.max(0, Math.min(Integer.MAX_VALUE, sum));
    }

    @Override
    public int of(String userId, long convId) {
        try {
            Object v = redis.opsForHash().get(key(userId), String.valueOf(convId));
            return (int) parse(v);
        } catch (RuntimeException e) {
            log.warn("读会话未读失败（按 0 处理）userId={} convId={} 原因={}", userId, convId, e.toString());
            return 0;
        }
    }

    @Override
    public void incr(String userId, long convId) {
        try {
            redis.opsForHash().increment(key(userId), String.valueOf(convId), 1);
        } catch (RuntimeException e) {
            // 消息已经入库了，角标丢一次不算故障；下次进会话列表会按库重建
            log.warn("未读 +1 失败（不影响消息本身）userId={} convId={} 原因={}", userId, convId, e.toString());
        }
    }

    @Override
    public int decr(String userId, long convId, long n) {
        if (n <= 0) return of(userId, convId);
        try {
            Long left = redis.execute(decrScript, List.of(key(userId)),
                    String.valueOf(convId), String.valueOf(n));
            return left == null ? 0 : (int) Math.max(0, left);
        } catch (RuntimeException e) {
            log.warn("未读递减失败（下一次重建会纠正）userId={} convId={} 原因={}", userId, convId, e.toString());
            return 0;
        }
    }

    @Override
    public void rebuild(String userId, Map<Long, Integer> perConv) {
        String key = key(userId);
        try {
            Map<String, String> fields = new HashMap<>();
            if (perConv != null) {
                for (Map.Entry<Long, Integer> e : perConv.entrySet()) {
                    if (e.getValue() != null && e.getValue() > 0) {
                        fields.put(String.valueOf(e.getKey()), String.valueOf(e.getValue()));
                    }
                }
            }
            if (fields.isEmpty()) fields.put(SENTINEL, "0");    // 标记"已初始化"，但总和仍是 0

            redis.delete(key);
            redis.opsForHash().putAll(key, fields);
        } catch (RuntimeException e) {
            log.warn("未读缓存重建失败（下次再试）userId={} 原因={}", userId, e.toString());
        }
    }

    @Override
    public void clear(String userId) {
        try {
            redis.delete(key(userId));
        } catch (RuntimeException e) {
            log.warn("清未读缓存失败 userId={} 原因={}", userId, e.toString());
        }
    }

    // ==================== 内部 ====================

    static String key(String userId) {
        return KEY_PREFIX + userId;
    }

    private Map<Object, Object> readAll(String userId) {
        try {
            Map<Object, Object> all = redis.opsForHash().entries(key(userId));
            return all.isEmpty() ? null : all;
        } catch (RuntimeException e) {
            log.warn("读未读缓存失败（按 0 处理）userId={} 原因={}", userId, e.toString());
            return null;
        }
    }

    private static long parse(Object v) {
        if (v == null) return 0;
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String read(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("加载 Redis Lua 脚本失败: " + path, e);
        }
    }
}
