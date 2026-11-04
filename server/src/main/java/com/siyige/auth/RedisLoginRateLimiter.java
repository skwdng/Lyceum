package com.siyige.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

/**
 * {@link LoginRateLimiter} 的 Redis 实现。
 *
 * <p>Key 设计（都带 TTL，Redis 自己会清，不需要额外清理任务）：
 * <pre>
 *   auth:fail:acct:{account}   失败计数    TTL 5 分钟
 *   auth:lock:acct:{account}   账号锁      TTL 15 分钟
 *   auth:fail:ip:{ip}          失败计数    TTL 5 分钟
 *   auth:lock:ip:{ip}          IP 锁       TTL 5 分钟
 * </pre>
 *
 * <p>Redis 异常一律翻译成 503（Q1：登录系统依赖它，不可用就不让登）。
 */
/**
 * <p><b>不加 @Component</b>：这个类需要构造参数 {@code prefix}（用户端 {@code auth:} / 管理端 {@code adm:}），
 * 由 {@link LoginRateLimiterConfig} 显式 new 两个实例。若加上 @Component，Spring 会尝试自动装配一个
 * {@code String} 参数而启动失败（2026-11-04 视频模块提交曾这样改过一次，整包起不来）。
 */
public class RedisLoginRateLimiter implements LoginRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisLoginRateLimiter.class);

    private static final int ACCT_MAX_FAILS = 5;
    private static final Duration ACCT_WINDOW = Duration.ofMinutes(5);
    private static final Duration ACCT_LOCK = Duration.ofMinutes(15);

    private static final int IP_MAX_FAILS = 20;
    private static final Duration IP_WINDOW = Duration.ofMinutes(5);
    private static final Duration IP_LOCK = Duration.ofMinutes(5);

    private final StringRedisTemplate redis;
    /**
     * key 前缀：用户端 {@code auth:}、管理端 {@code adm:}。
     * 两套计数**完全隔离**——同名账号（比如用户 `admin` 与管理员 `admin`）不共享失败次数，
     * 否则一阵瞎试就能把管理员锁死、或者用户侧被管理员登录失败牵连。
     */
    private final String prefix;

    public RedisLoginRateLimiter(AuthRedis authRedis, String prefix) {
        this.redis = authRedis.template();
        this.prefix = prefix;
    }

    @Override
    public void assertAllowed(String account, String ip) {
        try {
            if (Boolean.TRUE.equals(redis.hasKey(lockKeyAcct(account)))) {
                throw AuthException.tooManyAttempts("尝试次数过多，请 15 分钟后再试");
            }
            if (ip != null && Boolean.TRUE.equals(redis.hasKey(lockKeyIp(ip)))) {
                throw AuthException.tooManyAttempts("尝试次数过多，请稍后再试");
            }
        } catch (AuthException e) {
            throw e;
        } catch (RuntimeException e) {
            log.error("登录限流检查失败（Redis） account={}", account, e);
            throw AuthException.serviceUnavailable("登录服务暂时不可用（Redis）");
        }
    }

    @Override
    public void onFailure(String account, String ip) {
        try {
            long acct = incr(failKeyAcct(account), ACCT_WINDOW);
            if (acct >= ACCT_MAX_FAILS) {
                redis.opsForValue().set(lockKeyAcct(account), "1", ACCT_LOCK);
                log.warn("账号因连续失败被锁定 account={} fails={} lock={}", account, acct, ACCT_LOCK);
            }
            if (ip != null && !ip.isBlank()) {
                long byIp = incr(failKeyIp(ip), IP_WINDOW);
                if (byIp >= IP_MAX_FAILS) {
                    redis.opsForValue().set(lockKeyIp(ip), "1", IP_LOCK);
                    log.warn("IP 因连续失败被锁定 ip={} fails={} lock={}", ip, byIp, IP_LOCK);
                }
            }
        } catch (RuntimeException e) {
            // 计数失败不能反过来影响"登录失败"这个结果本身，只告警
            log.error("记录登录失败次数时出错（忽略） account={}", account, e);
        }
    }

    @Override
    public void onSuccess(String account) {
        try {
            redis.delete(failKeyAcct(account));
        } catch (RuntimeException e) {
            log.error("清理登录失败计数出错（忽略） account={}", account, e);
        }
    }

    private long incr(String key, Duration ttl) {
        Long v = redis.opsForValue().increment(key);
        long n = v == null ? 0 : v;
        if (n == 1L) redis.expire(key, ttl);      // 只在第一次设置窗口
        return n;
    }

    private String failKeyAcct(String account) { return prefix + "fail:acct:" + account; }
    private String lockKeyAcct(String account) { return prefix + "lock:acct:" + account; }
    private String failKeyIp(String ip) { return prefix + "fail:ip:" + ip; }
    private String lockKeyIp(String ip) { return prefix + "lock:ip:" + ip; }
}
