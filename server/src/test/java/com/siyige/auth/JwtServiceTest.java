package com.siyige.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * T3：JWT 签发与解析。
 *
 * <p>这组用例不碰 Redis（黑名单是另一个接口，见 JwtAuthFilterTest）。
 */
class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-0123456789-abcdefghijklmnop";

    private final JwtService jwt = new JwtService(SECRET);

    @Test
    void 签发后能原样解析出用户与账号() {
        String token = jwt.issue("zhang", "zhang");

        JwtService.ParsedToken p = jwt.parse(token);

        assertNotNull(p);
        assertEquals("zhang", p.userId());
        assertEquals("zhang", p.account());
        assertNotNull(p.jti());
        assertNotNull(p.expiresAt());
    }

    @Test
    void payload只有sub_acc_jti_iat_exp五项() {
        String token = jwt.issue("zhang", "zhang");

        var claims = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(token).getPayload();

        assertEquals(Set.of("sub", "acc", "jti", "iat", "exp"), claims.keySet(),
                "多放任何字段（密码/哈希/隐私）都算违规，实际：" + claims.keySet());
        assertFalse(claims.containsKey("password"));
        assertFalse(claims.containsKey("pwd"));
        assertFalse(claims.containsKey("hash"));
    }

    @Test
    void 过期token解析为null() {
        String expired = jwt.issue("zhang", "zhang", Duration.ofSeconds(-10));

        assertNull(jwt.parse(expired), "过期 token 必须被拒（不能只靠 exp 字段存在）");
    }

    @Test
    void 篡改token解析为null() {
        String token = jwt.issue("zhang", "zhang");
        // 改签名段最后一个字符
        String tampered = token.substring(0, token.length() - 1)
                + (token.endsWith("A") ? "B" : "A");

        assertNull(jwt.parse(tampered));
    }

    @Test
    void 换密钥签发的token解析为null() {
        JwtService other = new JwtService("another-secret-0123456789-abcdefghijklmnop");

        assertNull(jwt.parse(other.issue("zhang", "zhang")));
    }

    @Test
    void 垃圾串与null都返回null而不是抛异常() {
        assertNull(jwt.parse(null));
        assertNull(jwt.parse(""));
        assertNull(jwt.parse("not-a-jwt"));
        assertNull(jwt.parse("a.b.c"));
    }

    @Test
    void 密钥短于32字节直接启动失败() {
        assertThrows(IllegalStateException.class, () -> new JwtService("too-short"));
    }

    @Test
    void 未配置密钥时用开发默认值仍可签发解析() {
        JwtService dev = new JwtService("");     // 模拟没设 SIYIGE_JWT_SECRET

        assertNotNull(dev.parse(dev.issue("zhang", "zhang")));
    }

    @Test
    void 剩余有效期用于登出时设置黑名单TTL() {
        String token = jwt.issue("zhang", "zhang", Duration.ofMinutes(30));

        Duration left = jwt.parse(token).remaining();

        assertTrue(left.toMinutes() <= 30 && left.toMinutes() >= 28, "剩余有效期约 30 分钟，实际 " + left);
        assertFalse(left.isNegative());
    }
}
