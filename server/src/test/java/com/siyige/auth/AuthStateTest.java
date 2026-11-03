package com.siyige.auth;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

/**
 * B2：TOKEN_STALE 的判定边界（甲方案：改密时间截断到秒再比）。
 *
 * <p>这组用例守的是一条真出过事的线：JWT 的 iat 只到秒，直接拿毫秒级 pwd_changed_at
 * 去比，会让"改密后同一秒签发的新令牌"自己被判过期——用户改完密码立刻被踢。
 */
class AuthStateTest {

    private static final Instant T = Instant.parse("2026-11-03T10:00:00Z");

    @Test
    void 从未改过密码时任何令牌都不过期() {
        AuthState s = new AuthState(false, null);

        assertFalse(s.isTokenStale(T));
        assertFalse(s.isTokenStale(T.minusSeconds(3600)));
    }

    @Test
    void 改密之前签发的令牌失效() {
        AuthState s = new AuthState(false, T);

        assertTrue(s.isTokenStale(T.minusSeconds(1)), "改密前一秒的令牌必须失效");
        assertTrue(s.isTokenStale(T.minusSeconds(7200)));
    }

    @Test
    void 改密同一秒签发的令牌不失效_这是甲方案的关键() {
        // 改密发生在 10:00:00.900，新令牌 iat = 10:00:00（秒级截断）
        AuthState s = new AuthState(false, Instant.parse("2026-11-03T10:00:00.900Z"));

        assertFalse(s.isTokenStale(Instant.parse("2026-11-03T10:00:00Z")),
                "同一秒的新令牌不能被误判成过期");
    }

    @Test
    void 改密之后签发的令牌不失效() {
        AuthState s = new AuthState(false, T);

        assertFalse(s.isTokenStale(T.plusSeconds(1)));
        assertFalse(s.isTokenStale(T.plusSeconds(3600)));
    }

    @Test
    void 毫秒差不足一秒时不生效_容忍窗已被接受() {
        // 改密 10:00:00.500，旧令牌 iat 也是 10:00:00 -> 按秒比不失效（最多多活不到 1 秒）
        AuthState s = new AuthState(false, Instant.parse("2026-11-03T10:00:00.500Z"));

        assertFalse(s.isTokenStale(Instant.parse("2026-11-03T10:00:00Z")));
    }

    @Test
    void 没有iat的令牌不判失效() {
        AuthState s = new AuthState(false, T);

        assertFalse(s.isTokenStale(null), "缺 iat 时保守放行，由过期校验兜底");
    }

    @Test
    void 封禁与改密是两个独立维度() {
        AuthState s = new AuthState(true, T);

        assertTrue(s.disabled(), "封禁状态独立可读");
        assertTrue(s.isTokenStale(T.minusSeconds(10)), "两个判定互不干扰");
    }
}
