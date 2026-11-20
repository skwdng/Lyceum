package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 时间范围：range 解析、按天补零的日期桶、上周期计算、非法参数。 */
class AnalyticsRangeTest {

    @Test
    void range后缀d解析成天数() {
        assertEquals(7, AnalyticsRange.parseDays("7d"));
        assertEquals(30, AnalyticsRange.parseDays("30d"));
        assertEquals(90, AnalyticsRange.parseDays(" 90D "));
    }

    @Test
    void 非法range报INVALID_RANGE() {
        for (String bad : new String[]{null, "", "7", "abc", "0d", "-3d", "999d", "7w"}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                    () -> AnalyticsRange.parseDays(bad), "应当拒绝: " + bad);
            assertTrue(e.getMessage().startsWith("INVALID_RANGE"), e.getMessage());
        }
    }

    @Test
    void range7d是含今天的最近七天() {
        AnalyticsRange r = AnalyticsRange.ofRange("7d", 30);
        assertEquals(DayKeys.todayDate(), r.to());
        assertEquals(DayKeys.todayDate().minusDays(6), r.from());
        assertEquals(7, r.lengthDays());
        assertEquals(7, r.days().size());
    }

    @Test
    void 不传range用默认天数() {
        AnalyticsRange r = AnalyticsRange.ofRange(null, 30);
        assertEquals(30, r.lengthDays());
    }

    @Test
    void 日期范围含首尾且拒绝倒置与超长() {
        AnalyticsRange r = AnalyticsRange.ofDates("2026-11-01", "2026-11-03");
        assertEquals(LocalDate.of(2026, 11, 1), r.from());
        assertEquals(3, r.days().size());

        assertThrows(IllegalArgumentException.class, () -> AnalyticsRange.ofDates("2026-11-05", "2026-11-01"));
        assertThrows(IllegalArgumentException.class, () -> AnalyticsRange.ofDates("2020-01-01", "2026-11-01"));
        assertThrows(IllegalArgumentException.class, () -> AnalyticsRange.ofDates("2026-13-01", "2026-13-02"));
    }

    @Test
    void 上周期紧挨着且等长() {
        AnalyticsRange r = new AnalyticsRange(LocalDate.of(2026, 11, 5), LocalDate.of(2026, 11, 11));
        AnalyticsRange p = r.previous();
        assertEquals(LocalDate.of(2026, 10, 29), p.from());
        assertEquals(LocalDate.of(2026, 11, 4), p.to());
        assertEquals(7, p.lengthDays());
    }

    @Test
    void paramKey用于缓存键() {
        AnalyticsRange r = new AnalyticsRange(LocalDate.of(2026, 11, 5), LocalDate.of(2026, 11, 11));
        assertEquals("2026-11-05_2026-11-11", r.paramKey());
        assertEquals("admin:analytics:overview:2026-11-05_2026-11-11",
                AnalyticsCache.key("overview", r.paramKey()));
    }
}
