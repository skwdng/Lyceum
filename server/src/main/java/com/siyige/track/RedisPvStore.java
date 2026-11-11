package com.siyige.track;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.data.redis.RedisProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 模块浏览 / 活跃计数的 Redis 实现（key 结构见设计文档 §2.4）。
 *
 * <pre>
 *   pv:cnt:{yyyyMMdd}          Hash  field=module  value=次数      HINCRBY
 *   pv:uv:{yyyyMMdd}:{module}  HLL   PFADD userId                 （去重）
 *   pv:uv:snap:{yyyyMMdd}      Hash  field=module  value=上次快照   （避免重复落库）
 *   act:dau:{yyyyMMdd}         HLL   PFADD userId                 （日活）
 * </pre>
 *
 * <p>两套连接，理由与 {@code community/RedisViewStore} 完全一致：
 * <ul>
 *   <li><b>上报</b>走默认模板（{@code spring.data.redis.timeout=50ms}）——
 *       上报接口在每次页面跳转时都会打一次，绝不能因为 Redis 慢而拖住页面；</li>
 *   <li><b>回写</b>用独立的 2s 连接 —— 定时任务可以慢一点，但不要因为 50ms 超时把一天的计数丢掉。</li>
 * </ul>
 *
 * <p>所有写入都用 Lua 一次往返完成「累加 + 首次设 TTL」，避免上报路径上两条命令。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "true", matchIfMissing = true)
public class RedisPvStore implements PvStore, DisposableBean {

    /** PV/UV 只是"当天"的中间量，落库后即无用：3 天后自动过期，不会无限涨。 */
    private static final Duration LIVE_TTL = Duration.ofDays(3);
    /** DAU 要留着算 WAU(7) / MAU(30)，留 35 天。 */
    private static final Duration DAU_TTL = Duration.ofDays(35);
    private static final Duration FLUSH_TIMEOUT = Duration.ofSeconds(2);

    private static final String PV_PREFIX = "pv:cnt:";
    private static final String UV_PREFIX = "pv:uv:";
    private static final String SNAP_PREFIX = "pv:uv:snap:";
    private static final String DAU_PREFIX = "act:dau:";

    private final StringRedisTemplate redis;
    private final StringRedisTemplate flushRedis;
    private final LettuceConnectionFactory flushFactory;
    private final RedisScript<Long> incrScript;
    private final RedisScript<Long> hllScript;
    private final RedisScript<List> takeScript;

    public RedisPvStore(StringRedisTemplate redis, RedisProperties props) {
        this.redis = redis;
        this.incrScript = new DefaultRedisScript<>(read("lua/pv_incr.lua"), Long.class);
        this.hllScript = new DefaultRedisScript<>(read("lua/pv_uv.lua"), Long.class);
        this.takeScript = new DefaultRedisScript<>(read("lua/take_pv.lua"), List.class);

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

    // ==================== 写（页面跳转 / 业务方法触发） ====================

    @Override
    public void addPv(String day, String module, long delta) {
        redis.execute(incrScript, List.of(pvCntKey(day)), module, String.valueOf(delta),
                String.valueOf(LIVE_TTL.getSeconds()));
    }

    @Override
    public void addUv(String day, String module, String userId) {
        if (userId == null || userId.isBlank()) return;
        redis.execute(hllScript, List.of(uvKey(day, module)), userId, String.valueOf(LIVE_TTL.getSeconds()));
    }

    @Override
    public void addActive(String day, String userId) {
        if (userId == null || userId.isBlank()) return;
        redis.execute(hllScript, List.of(dauKey(day)), userId, String.valueOf(DAU_TTL.getSeconds()));
    }

    // ==================== 回写（定时任务触发，走 2s 连接） ====================

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Long> takePv(String day) {
        List<String> flat = flushRedis.execute(takeScript, List.of(pvCntKey(day)));
        Map<String, Long> out = new LinkedHashMap<>();
        if (flat == null || flat.isEmpty()) return out;
        for (int i = 0; i + 1 < flat.size(); i += 2) {
            try {
                long n = Long.parseLong(flat.get(i + 1));
                if (n > 0) out.put(flat.get(i), n);
            } catch (NumberFormatException ignored) {
                // 脏数据：跳过，不影响其它模块的回写
            }
        }
        return out;
    }

    @Override
    public void restorePv(String day, Map<String, Long> increments) {
        if (increments == null || increments.isEmpty()) return;
        increments.forEach((module, delta) -> {
            if (delta == null || delta <= 0) return;
            flushRedis.opsForHash().increment(pvCntKey(day), module, delta);
        });
        flushRedis.expire(pvCntKey(day), LIVE_TTL);
    }

    @Override
    public long snapUv(String day, String module) {
        Object v = flushRedis.opsForHash().get(snapKey(day), module);
        if (v == null) return 0L;
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    @Override
    public void saveUvSnap(String day, String module, long uv) {
        flushRedis.opsForHash().put(snapKey(day), module, String.valueOf(uv));
        flushRedis.expire(snapKey(day), LIVE_TTL);
    }

    @Override
    public long countUv(String day, String module) {
        Long n = flushRedis.opsForHyperLogLog().size(uvKey(day, module));
        return n == null ? 0L : n;
    }

    @Override
    public long countActive(String day) {
        Long n = flushRedis.opsForHyperLogLog().size(dauKey(day));
        return n == null ? 0L : n;
    }

    // ==================== Key（单测直接断言格式） ====================

    static String pvCntKey(String day) {
        return PV_PREFIX + day;
    }

    static String uvKey(String day, String module) {
        return UV_PREFIX + day + ":" + module;
    }

    static String snapKey(String day) {
        return SNAP_PREFIX + day;
    }

    static String dauKey(String day) {
        return DAU_PREFIX + day;
    }

    private static String read(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("加载 Redis Lua 脚本失败: " + path, e);
        }
    }
}
