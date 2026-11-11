package com.siyige.admin.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 报表缓存（设计文档 §5.5）：`admin:analytics:{接口}:{参数}`，TTL 60 秒。
 *
 * <p>为什么只缓 60 秒：管理台不是高并发场景，缓存的价值是「连点几个页签别把库打穿」，
 * 而不是"数据要多新鲜"。60 秒足够挡住连点，又不至于让人看到一分钟前的数字还以为是实时的。
 *
 * <p><b>Redis 不可用时直接当没有缓存</b>：读异常 → 返回 null（走直查库）；
 * 写异常 → 只记 debug。统计接口不能因为缓存挂了就 500（与 P1 埋点同一套降级思路）。
 */
@Component
public class AnalyticsCache {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsCache.class);

    private static final Duration TTL = Duration.ofSeconds(60);
    private static final String PREFIX = "admin:analytics:";

    private final StringRedisTemplate redis;

    public AnalyticsCache(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 命中返回 JSON 串；未命中 / Redis 故障返回 null。 */
    public String get(String api, String paramKey) {
        try {
            return redis.opsForValue().get(key(api, paramKey));
        } catch (Exception e) {
            log.debug("报表缓存读取失败（按未命中处理） api={}", api, e);
            return null;
        }
    }

    /** 写缓存；失败只记日志，不影响本次返回。 */
    public void put(String api, String paramKey, String json) {
        try {
            redis.opsForValue().set(key(api, paramKey), json, TTL);
        } catch (Exception e) {
            log.debug("报表缓存写入失败（忽略） api={}", api, e);
        }
    }

    static String key(String api, String paramKey) {
        return PREFIX + api + ":" + paramKey;
    }
}
