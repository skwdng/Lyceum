package com.siyige.community;

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
import java.util.List;

/**
 * 未读角标：Redis Hash {@code notify:unread}（field = userId）。
 *
 * <p>与 {@link RedisViewStore} 用同一个 {@link StringRedisTemplate}，不另建连接、不动共享配置。
 *
 * <p><b>容错策略</b>：Redis 任何异常都只 warn，不往上抛——
 * 角标是"锦上添花"，不能因为它挂了就让发评论 / 点赞 / 翻列表失败。
 * 失败时 {@link #get} 返回 0（前端不显示红点），{@link #decrement} 返回 -1（计数不动）。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
public class RedisUnreadCounter implements UnreadCounter {

    private static final Logger log = LoggerFactory.getLogger(RedisUnreadCounter.class);

    /** Hash 键，方案 §4 定死。 */
    static final String KEY = "notify:unread";

    private final StringRedisTemplate redis;
    private final RedisScript<Long> readScript;

    public RedisUnreadCounter(StringRedisTemplate redis) {
        this.redis = redis;
        this.readScript = new DefaultRedisScript<>(read("lua/notify_read.lua"), Long.class);
    }

    @Override
    public long get(String userId) {
        try {
            Object v = redis.opsForHash().get(KEY, userId);
            return v == null ? 0L : Math.max(0L, Long.parseLong(String.valueOf(v)));
        } catch (RuntimeException e) {
            log.warn("读未读角标失败，按 0 处理 userId={} 原因={}", userId, e.toString());
            return 0L;
        }
    }

    @Override
    public void incr(String userId) {
        try {
            redis.opsForHash().increment(KEY, userId, 1L);
        } catch (RuntimeException e) {
            log.warn("未读角标 +1 失败（不影响通知落库）userId={} 原因={}", userId, e.toString());
        }
    }

    @Override
    public long decrement(String userId, int n) {
        if (n <= 0) return -1L;
        try {
            Long r = redis.execute(readScript, List.of(KEY), userId, String.valueOf(n));
            return r == null ? -1L : r;
        } catch (RuntimeException e) {
            log.warn("未读角标递减失败（计数不动）userId={} n={} 原因={}", userId, n, e.toString());
            return -1L;
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
