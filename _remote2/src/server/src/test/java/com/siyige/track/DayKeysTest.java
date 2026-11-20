package com.siyige.track;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 统计用的日期与 Redis key：时区错了会让跨零点的数据记到前一天。 */
class DayKeysTest {

    @Test
    void 日期按上海时区取yyyyMMdd() {
        // 与社区浏览计数（R-COM-30）同一口径：UTC 16:00 之后就是上海的第二天
        assertEquals("20261102", DayKeys.dayKey(Instant.parse("2026-11-01T16:30:00Z")));
        assertEquals("20261102", DayKeys.dayKey(Instant.parse("2026-11-02T02:30:00Z")));
        assertEquals("20261102", DayKeys.dayKey(Instant.parse("2026-11-02T15:59:00Z")));
        assertEquals("20261103", DayKeys.dayKey(Instant.parse("2026-11-02T16:00:00Z")));
    }

    @Test
    void 时区是AsiaShanghai() {
        assertEquals("Asia/Shanghai", DayKeys.ZONE.getId());
        // 不断言具体日期（跑测试的日期不确定），只断言与 ZonedDateTime 口径一致
        assertEquals(java.time.LocalDate.now(DayKeys.ZONE), DayKeys.todayDate());
        assertEquals(DayKeys.dayKey(DayKeys.todayDate()), DayKeys.today());
    }

    @Test
    void Redis_key格式与设计文档一致() {
        String day = "20261111";
        assertEquals("pv:cnt:20261111", RedisPvStore.pvCntKey(day));
        assertEquals("pv:uv:20261111:community", RedisPvStore.uvKey(day, "community"));
        assertEquals("pv:uv:snap:20261111", RedisPvStore.snapKey(day));
        assertEquals("act:dau:20261111", RedisPvStore.dauKey(day));
    }
}
