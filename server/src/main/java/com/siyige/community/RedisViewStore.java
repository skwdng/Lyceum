package com.siyige.community;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.autoconfigure.data.redis.RedisProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 浏览计数的 Redis 实现：脚本见 resources/lua/*.lua。
 *
 * <p>两条路径的 Redis 超时不同：
 * <ul>
 *   <li>浏览写入走 {@code spring.data.redis.timeout=50ms} 的默认模板（R-COM-37，不能阻塞详情页）；</li>
 *   <li>定时回写用独立的连接工厂（2s），不受浏览接口 50ms 的限制（回写可以更慢）。</li>
 * </ul>
 */
@Component
public class RedisViewStore implements ViewStore, DisposableBean {

    private static final Duration PENDING_TTL = Duration.ofHours(2);   // R-COM-31 兜底 TTL
    private static final Duration FLUSH_TIMEOUT = Duration.ofSeconds(2);

    private final StringRedisTemplate redis;
    private final StringRedisTemplate flushRedis;
    private final LettuceConnectionFactory flushFactory;
    private final RedisScript<Long> recordScript;
    private final RedisScript<List> flushScript;

    public RedisViewStore(StringRedisTemplate redis, RedisProperties props) {
        this.redis = redis;
        this.recordScript = new DefaultRedisScript<>(read("lua/record_view.lua"), Long.class);
        this.flushScript = new DefaultRedisScript<>(read("lua/flush_views.lua"), List.class);

        // 回写专用连接工厂：只覆盖 commandTimeout，其余连接参数沿用 spring.data.redis.*
        RedisStandaloneConfiguration standalone = new RedisStandaloneConfiguration(props.getHost(), props.getPort());
        if (props.getPassword() != null && !props.getPassword().isEmpty()) {
            standalone.setPassword(RedisPassword.of(props.getPassword()));
        }
        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
                .commandTimeout(FLUSH_TIMEOUT)
                .build();
        this.flushFactory = new LettuceConnectionFactory(standalone, client);
        this.flushFactory.afterPropertiesSet();
        this.flushRedis = new StringRedisTemplate(flushFactory);
        this.flushRedis.afterPropertiesSet();
    }

    @Override
    public void destroy() {
        flushFactory.destroy();
    }

    @Override
    public long recordSeen(String seenKey, String pendingKey, String userId, long postId, long expireAtEpochSecond) {
        Long added = redis.execute(recordScript, List.of(seenKey, pendingKey),
                userId, String.valueOf(postId), String.valueOf(expireAtEpochSecond));
        return added == null ? 0L : added;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<Long, Long> takePending(String pendingKey) {
        List<String> flat = flushRedis.execute(flushScript, List.of(pendingKey));
        Map<Long, Long> out = new LinkedHashMap<>();
        if (flat == null || flat.isEmpty()) return out;
        for (int i = 0; i + 1 < flat.size(); i += 2) {
            try {
                out.put(Long.parseLong(flat.get(i)), Long.parseLong(flat.get(i + 1)));
            } catch (NumberFormatException ignored) {
                // 脏数据：跳过，不影响其它帖子的回写
            }
        }
        return out;
    }

    @Override
    public void restorePending(String pendingKey, Map<Long, Long> increments) {
        if (increments == null || increments.isEmpty()) return;
        increments.forEach((postId, delta) -> {
            if (delta == null || delta <= 0) return;
            flushRedis.opsForHash().increment(pendingKey, String.valueOf(postId), delta);
        });
        flushRedis.expire(pendingKey, PENDING_TTL);
    }

    /**
     * 只读窥视待回写增量：一次 HMGET，<b>不清空</b>、不写任何东西。
     *
     * <p>用 {@code multiGet}（单条 HMGET）而不是循环 {@code get}，保证整页列表只有一次网络往返。
     * 走 50ms 超时的连接（浏览是统计，读路径不能等它）。
     */
    @Override
    public Map<Long, Long> peekPending(String pendingKey, Collection<Long> postIds) {
        if (postIds == null || postIds.isEmpty()) return new LinkedHashMap<>();
        List<Long> ids = new ArrayList<>(postIds);
        List<String> fields = new ArrayList<>(ids.size());
        for (Long id : ids) fields.add(String.valueOf(id));

        HashOperations<String, String, String> hash = redis.opsForHash();   // 一次 HMGET
        List<String> values = hash.multiGet(pendingKey, fields);
        Map<Long, Long> out = new LinkedHashMap<>();
        if (values == null) return out;
        for (int i = 0; i < ids.size() && i < values.size(); i++) {
            String v = values.get(i);
            if (v == null) continue;                       // 缺失的 id 不出现
            try {
                long n = Long.parseLong(v);
                if (n > 0) out.put(ids.get(i), n);
            } catch (NumberFormatException ignored) {
                // 脏数据：跳过，调用方按 0 处理
            }
        }
        return out;
    }

    private static String read(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("加载 Redis Lua 脚本失败: " + path, e);
        }
    }
}
