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

    private static final Set<String> REQUIRED = Set.of("sub", "acc", "jti", "iat", "exp");

    private java.util.Map<String, Object> claimsOf(String token) {
        return Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .build().parseSignedClaims(token).getPayload();
    }

    /**
     * 用户令牌 payload 走**白名单**：
     * 必须包含 sub/acc/jti/iat/exp，**只允许**额外出现 typ，多一个都算违规。
     *
     * <p>typ 是类型标记（USER / ADMIN），不是敏感数据——它只用来让两个过滤器各认各的令牌。
     */
    @Test
    void 用户令牌payload白名单_五个必需字段加typ() {
        var claims = claimsOf(jwt.issue("zhang", "zhang"));

        assertTrue(claims.keySet().containsAll(REQUIRED), "缺必需字段，实际：" + claims.keySet());

        Set<String> extra = new java.util.HashSet<>(claims.keySet());
        extra.removeAll(REQUIRED);
        assertEquals(Set.of("typ"), extra, "只允许额外出现 typ，实际多出：" + extra);

        assertEquals(JwtService.TYP_USER, claims.get("typ"), "用户令牌的 typ 必须是 USER");
        assertFalse(claims.containsKey("role"), "用户令牌不该带 role");
        for (String bad : new String[]{"password", "pwd", "hash", "passwordHash", "name"}) {
            assertFalse(claims.containsKey(bad), "不该出现字段：" + bad);
        }
    }

    @Test
    void 管理员令牌带typ与role_能被识别为管理员() {
        String token = jwt.issueAdmin("1", "admin");

        var claims = claimsOf(token);
        assertEquals(JwtService.TYP_ADMIN, claims.get("typ"));
        assertEquals(JwtService.ROLE_ADMIN, claims.get("role"));
        assertEquals("1", claims.get("sub"), "管理员令牌的 sub 应是 sy_admin.id");
        assertTrue(claims.keySet().containsAll(REQUIRED), "管理员令牌也要有那 5 个必需字段");

        JwtService.ParsedToken p = jwt.parse(token);
        assertTrue(p.isAdmin());
        assertFalse(p.isUser());
    }

    @Test
    void 过期的管理员令牌解析为null() {
        String expired = jwt.issueAdmin("1", "admin", Duration.ofHours(-1));

        assertNull(jwt.parse(expired), "管理员令牌同样受 exp 约束");
    }

    @Test
    void 用户令牌不会被误判成管理员() {
        JwtService.ParsedToken p = jwt.parse(jwt.issue("zhang", "zhang"));

        assertFalse(p.isAdmin());
        assertTrue(p.isUser());
    }

    @Test
    void 没有typ的旧令牌按用户处理_不能当管理员() {
        // 升级前签发的令牌没有 typ 字段，不能让它们把人踢下线，也不能让它们变管理员
        String legacy = Jwts.builder()
                .subject("zhang").claim("acc", "zhang")
                .id(java.util.UUID.randomUUID().toString())
                .issuedAt(new java.util.Date())
                .expiration(new java.util.Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS256)
                .compact();

        JwtService.ParsedToken p = jwt.parse(legacy);
        assertNotNull(p, "旧令牌应仍可解析");
        assertEquals(JwtService.TYP_USER, p.typ(), "缺 typ 按 USER 处理");
        assertFalse(p.isAdmin(), "绝不能因为缺 typ 就被当成管理员");
        assertTrue(p.isUser());
    }

    @Test
    void 过期token解析为null() {
        String expired = jwt.issue("zhang", "zhang", Duration.ofHours(-1));

        assertNull(jwt.parse(expired), "过期 token 必须被拒（不能只靠 exp 字段存在）");
    }

    @Test
    void 篡改token解析为null() {
        String token = jwt.issue("zhang", "zhang");
        // ⚠️ 别改**最后**一个字符：JWT 签名是 base64url，末字符只有高 4 位有效，
        // 低 2 位是填充位、解码时被忽略。把末字符换成「高 4 位相同」的另一个字符
        // （例如 A↔B）解出来的字节完全一样，签名照样验过 —— 这条用例曾因此按 1/16
        // 的概率偶发失败。改签名段的**第一个**字符：它的 6 位全部有效，必然改变解码结果。
        String[] parts = token.split("\\.");
        String sig = parts[2];
        char head = sig.charAt(0) == 'A' ? 'B' : 'A';
        String tampered = parts[0] + "." + parts[1] + "." + head + sig.substring(1);

        assertNull(jwt.parse(tampered), "篡改过的 token 必须被拒");
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
