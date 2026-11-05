package com.siyige.community.ai;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 自然日限额（方案 §6，决策 9）。
 *
 * <p>单测用 mock 的 {@code StringRedisTemplate} 验「Lua 返回值 → 放不放行」这条分支，
 * **不连真 Redis**：{@code mvn test} 必须离线可跑、也不该往真实配额里塞测试数据。
 * 真 Redis 的链路（XADD / 消费 / 真实 Lua）由 curl 实测覆盖。
 */
class AiUsageGuardTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final AiUsageGuard guard = new AiUsageGuard(redis);

    /** 让 Lua 返回指定值（脚本、key、三个参数：上限 / userId / TTL）。 */
    @SuppressWarnings("unchecked")
    private void luaReturns(Long value) {
        when(redis.execute(any(RedisScript.class), anyList(), anyString(), anyString(), anyString()))
                .thenReturn(value);
    }

    @Test
    void 未超限时放行() {
        luaReturns(3L);
        assertTrue(guard.tryAcquire("u-bob"));
    }

    @Test
    void 首次调用也放行() {
        luaReturns(1L);
        assertTrue(guard.tryAcquire("u-bob"));
    }

    @Test
    void Lua返回负一表示超限_不放行() {
        luaReturns(-1L);
        assertFalse(guard.tryAcquire("u-bob"), "第 6 次必须被拒");
    }

    @Test
    void Redis异常时按不放行处理() {
        when(redis.execute(any(RedisScript.class), anyList(), anyString(), anyString(), anyString()))
                .thenThrow(new IllegalStateException("redis down"));
        assertFalse(guard.tryAcquire("u-bob"), "宁可少答一次，也不能绕开限额");
    }

    @Test
    void 空userId不放行且不碰Redis() {
        assertFalse(guard.tryAcquire(""));
        assertFalse(guard.tryAcquire(null));
        verifyNoInteractions(redis);
    }

    @Test
    void key按自然日区分() {
        assertEquals("ai:usage:2026-11-05", AiUsageGuard.keyFor(LocalDate.of(2026, 11, 5)));
        assertEquals("ai:usage:2026-12-31", AiUsageGuard.keyFor(LocalDate.of(2026, 12, 31)));
    }

    @Test
    void 调用时传的是上限5与24小时TTL() {
        luaReturns(1L);
        guard.tryAcquire("u-bob");

        verify(redis).execute(any(RedisScript.class), anyList(),
                eq("5"), eq("u-bob"), eq(String.valueOf(24 * 60 * 60)));
    }
}
