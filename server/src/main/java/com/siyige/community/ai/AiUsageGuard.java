package com.siyige.community.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

/**
 * 社区 AI 的**自然日限额**（决策 9 / 方案 §6）。
 *
 * <pre>
 * key    ai:usage:yyyy-MM-dd   (Hash)   ← 跨天自动换 key
 * field  userId
 * value  当天已用次数
 * TTL    24 小时（首次写入时设置，纯清理用）
 * 上限    5 次/天
 * </pre>
 *
 * <p>「判断是否超限」和「计数 +1」在 **Lua 里一次做完**（{@code resources/lua/ai_usage.lua}）：
 * 分两条命令做的话，两个并发请求会同时读到 4、同时 +1 → 一天能用 6 次以上。
 *
 * <p><b>扣减时机 = 入队时</b>（决策 3）：模型调用失败（超时 / 429 / 空回复）也**照扣**，
 * 这是防刷的代价，已确认接受。
 */
@Component
public class AiUsageGuard {

    private static final Logger log = LoggerFactory.getLogger(AiUsageGuard.class);

    /** 每个账号每个自然日的上限（决策 9）。 */
    static final int DAILY_LIMIT = 5;
    /** key 的 TTL：24 小时。跨天换 key，TTL 只是清理兜底。 */
    private static final int TTL_SECONDS = 24 * 60 * 60;

    private final StringRedisTemplate redis;
    private final RedisScript<Long> script;

    public AiUsageGuard(StringRedisTemplate redis) {
        this.redis = redis;
        this.script = new DefaultRedisScript<>(read("lua/ai_usage.lua"), Long.class);
    }

    /**
     * 尝试占用一次额度。
     *
     * @return true = 占到了（本次是今天第 n 次）；false = 今天已满 / Redis 异常
     */
    public boolean tryAcquire(String userId) {
        if (userId == null || userId.isBlank()) return false;
        String key = keyFor(LocalDate.now());
        try {
            Long r = redis.execute(script, List.of(key),
                    String.valueOf(DAILY_LIMIT), userId, String.valueOf(TTL_SECONDS));
            if (r == null) return false;
            if (r < 0) {
                log.info("AI 今日额度已用完 userId={} key={}", userId, key);
                return false;
            }
            log.debug("AI 额度 userId={} 今日第 {} 次", userId, r);
            return true;
        } catch (RuntimeException e) {
            // Redis 挂了就不放行：宁可少答一次，也不要绕开限额
            log.warn("AI 额度判断失败（按不放行处理）userId={} 原因={}", userId, e.toString());
            return false;
        }
    }

    /** key 形如 {@code ai:usage:2026-11-05}（自然日按服务器本地时区算）。 */
    static String keyFor(LocalDate date) {
        return "ai:usage:" + date;
    }

    private static String read(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("加载 Redis Lua 脚本失败: " + path, e);
        }
    }
}
