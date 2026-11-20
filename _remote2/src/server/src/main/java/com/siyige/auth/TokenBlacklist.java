package com.siyige.auth;

import java.time.Duration;

/**
 * 登出用的 token 黑名单（按 {@code jti}）。
 *
 * <p>抽成接口是为了让 JWT / 过滤器单测不依赖真实 Redis。
 * 生产实现见 {@link RedisTokenBlacklist}；Redis 不可用时按 Q1 的决策
 * **拒绝服务**（fail-closed），而不是放行。
 */
public interface TokenBlacklist {

    /** 把 jti 拉黑，TTL 应等于 token 的剩余有效期（过期后自然无需再记）。 */
    void add(String jti, Duration ttl);

    /**
     * jti 是否已拉黑。
     *
     * @throws AuthException {@code SERVICE_UNAVAILABLE}（503）当存储不可用
     */
    boolean contains(String jti);
}
