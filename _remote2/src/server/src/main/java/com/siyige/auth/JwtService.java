package com.siyige.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * JWT 签发与解析（HS256，有效期 2 小时，决策 1）。
 *
 * <p>payload 只放 <b>sub / acc / jti / iat / exp</b> 五项，绝不放密码、哈希或任何隐私字段。
 *
 * <p>密钥取环境变量 {@code SIYIGE_JWT_SECRET}（≥32 字节，HS256 要求 256 位）；
 * 未设置时用内置开发默认值并打 WARN——生产必须设置，否则所有实例共用一个公开密钥。
 *
 * <p>登出靠 {@link TokenBlacklist} 记 {@code jti}，不是"服务端 session"。
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    /** 开发默认密钥，长度足够 HS256；**生产必须用 SIYIGE_JWT_SECRET 覆盖**。 */
    private static final String DEV_SECRET =
            "siyige-dev-only-jwt-secret-do-not-use-in-production-0123456789";

    /** 决策 9：有效期 2 小时。 */
    public static final Duration TTL = Duration.ofHours(2);

    private final SecretKey key;

    public JwtService(@Value("${SIYIGE_JWT_SECRET:}") String secret) {
        String use = (secret == null || secret.isBlank()) ? DEV_SECRET : secret;
        if (use.equals(DEV_SECRET)) {
            log.warn("未设置 SIYIGE_JWT_SECRET，正在使用内置开发密钥——生产环境必须配置，否则 token 可被伪造");
        }
        byte[] bytes = use.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("SIYIGE_JWT_SECRET 至少需要 32 字节（HS256 要求 256 位密钥）");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    /** 用户令牌类型标记。 */
    public static final String TYP_USER = "USER";
    /** 管理员令牌类型标记。 */
    public static final String TYP_ADMIN = "ADMIN";
    /** 管理员角色值。 */
    public static final String ROLE_ADMIN = "ADMIN";

    /**
     * 解析结果：只带过滤器 / 登出需要的字段。
     *
     * <p>{@code typ} 是**类型标记**（`USER` / `ADMIN`），不是敏感数据——它的唯一用途是
     * 让两个过滤器各认各的令牌：社区过滤器见到 `ADMIN` 直接拒，管理端过滤器见到 `USER` 也拒。
     * 早期签发、没有 `typ` 的旧令牌按 `USER` 处理（不能因为加了个标记就把人踢下线）。
     */
    public record ParsedToken(String userId, String account, String jti, Instant expiresAt,
                              String typ, String role, Instant issuedAt) {

        /** 剩余有效期，用于登出时设置黑名单 TTL。 */
        public Duration remaining() {
            Duration left = Duration.between(Instant.now(), expiresAt);
            return left.isNegative() ? Duration.ZERO : left;
        }

        public boolean isAdmin() {
            return TYP_ADMIN.equals(typ) && ROLE_ADMIN.equals(role);
        }

        public boolean isUser() {
            return !TYP_ADMIN.equals(typ);
        }
    }

    /** 签发用户令牌（2 小时），带 {@code typ=USER}。 */
    public String issue(String userId, String account) {
        return issue(userId, account, TTL);
    }

    /** 签发指定有效期的用户令牌——给单测构造"已过期 token"用。 */
    String issue(String userId, String account, Duration ttl) {
        return sign(userId, account, ttl, null, null);
    }

    /**
     * 签发**管理员**令牌（2 小时）：`typ=ADMIN` + `role=ADMIN`。
     *
     * <p>管理员是独立账号体系（`sy_admin`），{@code adminId} 走 {@code sub}。
     * 这份令牌只能过 {@code AdminAuthFilter}，拿去访问 `/api/community/**` 会被 401 拒掉。
     */
    public String issueAdmin(String adminId, String account) {
        return sign(adminId, account, TTL, TYP_ADMIN, ROLE_ADMIN);
    }

    /** 签发指定有效期的管理员令牌——给单测构造"已过期令牌"用。 */
    String issueAdmin(String adminId, String account, Duration ttl) {
        return sign(adminId, account, ttl, TYP_ADMIN, ROLE_ADMIN);
    }

    private String sign(String subject, String account, Duration ttl, String typ, String role) {
        Instant now = Instant.now();
        var b = Jwts.builder()
                .subject(subject)
                // JWT 的 acc 是账号名的**展示/审计**用途，不做鉴权判断；
                // 管理员令牌的 sub 是 sy_admin.id，用户令牌的 sub 是 sy_user.id，两者不混。
                .claim("acc", account)
                .claim("typ", typ == null ? TYP_USER : typ)
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)));
        if (role != null) b.claim("role", role);
        return b.signWith(key, Jwts.SIG.HS256).compact();
    }

    /**
     * 校验并解析。
     *
     * @return 合法则返回解析结果；签名错 / 过期 / 格式错一律返回 {@code null}
     *         （调用方按 401 处理，不区分具体原因，避免给攻击者信息）
     */
    public ParsedToken parse(String token) {
        if (token == null || token.isBlank()) return null;
        try {
            Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            Instant exp = c.getExpiration() == null ? null : c.getExpiration().toInstant();
            // iat 只到秒；改密时间戳比较时按秒截断（见 AuthState#isTokenStale）
            Instant iat = c.getIssuedAt() == null ? null : c.getIssuedAt().toInstant();
            String typ = c.get("typ", String.class);
            return new ParsedToken(c.getSubject(), c.get("acc", String.class), c.getId(), exp,
                    typ == null ? TYP_USER : typ, c.get("role", String.class), iat);
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("token 校验失败：{}", e.getClass().getSimpleName());
            return null;
        }
    }
}
