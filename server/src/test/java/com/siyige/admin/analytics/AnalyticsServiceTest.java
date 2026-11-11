package com.siyige.admin.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 报表聚合：补零、占比、WAU/MAU 的合并口径、缓存命中、参数校验。 */
class AnalyticsServiceTest {

    private final AnalyticsRepo repo = mock(AnalyticsRepo.class);
    private final PvStore pv = mock(PvStore.class);
    private final AnalyticsCache cache = mock(AnalyticsCache.class);
    private final ObjectMapper json = new ObjectMapper();
    private final AnalyticsService service = new AnalyticsService(repo, pv, cache, json);

    private static LocalDate today() {
        return DayKeys.todayDate();
    }

    @Test
    void 模块趋势按天补零且排名带占比() {
        LocalDate d1 = today().minusDays(6);
        LocalDate d2 = today().minusDays(5);
        when(repo.moduleTotals(any(), any())).thenReturn(List.of(
                new AnalyticsRepo.ModuleTotal("community", 75, 30, 20),
                new AnalyticsRepo.ModuleTotal("chat", 25, 10, 10)
        ));
        // 只在 d2 有数据：d1 必须补 0
        when(repo.moduleByDay(any(), any())).thenReturn(List.of(
                new AnalyticsRepo.ModuleDay(d2, "community", 40, 12),
                new AnalyticsRepo.ModuleDay(d2, "chat", 5, 3)
        ));

        AnalyticsDtos.Modules out = service.modules("7d");

        assertEquals(7, out.trend().days().size());
        assertEquals(2, out.modules().size());
        assertEquals("community", out.modules().get(0).module());     // 按 pv 降序
        assertEquals(75.0, out.modules().get(0).sharePct(), 0.01);    // 75/100
        assertEquals(25.0, out.modules().get(1).sharePct(), 0.01);

        List<Long> communityPv = out.trend().series().get(0).pv();
        assertEquals(7, communityPv.size());
        assertEquals(0L, communityPv.get(0));        // d1 补零
        assertEquals(40L, communityPv.get(1));       // d2 有值
        assertEquals(0L, communityPv.get(6));
        assertEquals(12L, out.trend().series().get(0).uv().get(1));   // d2 的 uv
    }

    @Test
    void WAU与MAU分别合并最近7天和30天() {
        when(repo.dauByDay(any(), any())).thenReturn(Map.of(today(), 42L));
        when(pv.unionActive(any())).thenReturn(100L, 300L);

        AnalyticsDtos.Active out = service.active("30d");

        assertEquals(30, out.points().size());
        assertEquals(42L, out.dau());          // 今天的 DAU
        assertEquals(100L, out.wau());
        assertEquals(300L, out.mau());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> captor = ArgumentCaptor.forClass(List.class);
        verify(pv, times(2)).unionActive(captor.capture());
        assertEquals(7, captor.getAllValues().get(0).size());
        assertEquals(30, captor.getAllValues().get(1).size());
        assertEquals(DayKeys.dayKey(today()), captor.getAllValues().get(0).get(6));      // 最后一天是今天
        assertEquals(DayKeys.dayKey(today().minusDays(29)), captor.getAllValues().get(1).get(0));
    }

    @Test
    void 今天的DAU用Redis实时值兜底() {
        // 库里只有昨天（正常情况：sy_daily_active 每天 00:05 才落昨天），今天这一格是空的
        when(repo.dauByDay(any(), any())).thenReturn(Map.of(today().minusDays(1), 5L));
        when(pv.countActive(anyString())).thenReturn(9L);
        when(pv.unionActive(any())).thenReturn(9L, 20L);

        AnalyticsDtos.Active out = service.active("7d");

        assertEquals(9L, out.dau());                    // 不是 0
        assertEquals(5L, out.points().get(5).y());      // 昨天仍然用库里的
        assertEquals(9L, out.points().get(6).y());      // 今天用 Redis
    }

    @Test
    void 缓存命中时不再查库() throws Exception {
        AnalyticsDtos.Overview cachedValue = new AnalyticsDtos.Overview(
                "2026-11-05", "2026-11-11", "2026-10-29", "2026-11-04",
                List.of(new AnalyticsDtos.KpiItem("newUsers", "新增用户", 9, 7, 28.6, "人")));
        when(cache.get("overview", "2026-11-05_2026-11-11"))
                .thenReturn(json.writeValueAsString(cachedValue));

        AnalyticsDtos.Overview out = service.overview("2026-11-05", "2026-11-11");

        assertEquals(1, out.items().size());
        assertEquals(9, out.items().get(0).value());
        verify(repo, never()).countUsers(any(), any());
        verify(cache, never()).put(anyString(), anyString(), anyString());
    }

    @Test
    void 概览的环比与存量项() {
        LocalDate f = LocalDate.of(2026, 11, 10);
        LocalDate t = LocalDate.of(2026, 11, 11);
        when(repo.countUsers(any(), any())).thenReturn(20L, 10L);        // 当期 20，上期 10 -> +100%
        when(repo.countMatches(any(), any())).thenReturn(5L, 5L);        // 持平 -> 0%
        when(repo.countPosts(any(), any())).thenReturn(3L, 0L);          // 上期为 0 -> deltaPct null
        when(repo.countReports(any(), any())).thenReturn(1L, 2L);
        when(repo.sumRevenueCents(any(), any())).thenReturn(900L, 1000L);
        when(repo.dauByDay(any(), any())).thenReturn(Map.of(f, 10L, t, 20L));   // 两天 -> 日均 15
        when(repo.pendingReports()).thenReturn(3L);
        when(repo.bannedUsers()).thenReturn(1L);

        AnalyticsDtos.Overview out = service.overview(f.toString(), t.toString());

        assertEquals("2026-11-08", out.prevFrom());
        assertEquals("2026-11-09", out.prevTo());
        assertEquals(8, out.items().size());

        AnalyticsDtos.KpiItem users = byKey(out, "newUsers");
        assertEquals(20, users.value());
        assertEquals(100.0, users.deltaPct(), 0.01);

        assertEquals(0.0, byKey(out, "matches").deltaPct(), 0.01);
        assertNull(byKey(out, "posts").deltaPct());            // 上期 0：不给百分比
        assertNull(byKey(out, "pendingReports").deltaPct());   // 存量项没有环比
        assertEquals(3, byKey(out, "pendingReports").value());
        assertEquals(15, byKey(out, "avgDau").value());        // 日均 (10+20)/2
    }

    @Test
    void 趋势拒绝小时粒度与未知指标() {
        IllegalArgumentException gran = assertThrows(IllegalArgumentException.class,
                () -> service.trend("matches", "7d", "hour"));
        assertTrue(gran.getMessage().startsWith("INVALID_GRANULARITY"));

        IllegalArgumentException metric = assertThrows(IllegalArgumentException.class,
                () -> service.trend("bogus", "7d", "day"));
        assertTrue(metric.getMessage().startsWith("INVALID_METRIC"));
    }

    @Test
    void 趋势按天补零() {
        when(repo.matchesByDay(any(), any())).thenReturn(Map.of(today(), 5L));
        AnalyticsDtos.Trend out = service.trend("matches", "7d", "day");
        assertEquals("matches", out.metric());
        assertEquals("day", out.granularity());
        assertEquals(7, out.points().size());
        assertEquals(5L, out.points().get(6).y());   // 今天
        assertEquals(0L, out.points().get(0).y());   // 六天前补零
    }

    @Test
    void 分布带总数与降序() {
        when(repo.breakdown(eq("tier"), any(), any())).thenReturn(List.of(
                new AnalyticsRepo.KeyCount("PRO", 6), new AnalyticsRepo.KeyCount("BASIC", 4)));
        AnalyticsDtos.Breakdown out = service.breakdown("tier", "30d");
        assertEquals(10, out.total());
        assertEquals("PRO", out.points().get(0).x());
        assertThrows(IllegalArgumentException.class, () -> service.breakdown("hack", "30d"));
    }

    @Test
    void 质量六维取平均且脏数据不炸() {
        when(repo.avgTurns(any(), any())).thenReturn(5.25);
        when(repo.recordSamples(any(), any())).thenReturn(2L);
        when(repo.aiTurns(any(), any())).thenReturn(new AnalyticsRepo.AiTurns(10, 3));
        when(repo.dimsJson(any(), any())).thenReturn(List.of(
                "{\"立论\":70,\"表达\":80}", "{\"立论\":90,\"新维度\":50}", "not-a-json"));

        AnalyticsDtos.Quality out = service.quality("30d");

        assertEquals(5.3, out.avgTurns(), 0.01);
        assertEquals(30.0, out.aiRatio(), 0.01);
        assertEquals(2, out.samples());
        assertEquals(80.0, dimOf(out, "立论"), 0.01);      // (70+90)/2
        assertEquals(80.0, dimOf(out, "表达"), 0.01);      // 只有一条
        assertEquals(50.0, dimOf(out, "新维度"), 0.01);    // 不在固定顺序里也保留
        assertEquals("立论", out.dims().get(0).key());     // 按固定顺序排
    }

    private static AnalyticsDtos.KpiItem byKey(AnalyticsDtos.Overview out, String key) {
        return out.items().stream().filter((i) -> i.key().equals(key)).findFirst().orElseThrow();
    }

    private static double dimOf(AnalyticsDtos.Quality out, String key) {
        return out.dims().stream().filter((d) -> d.key().equals(key)).findFirst().orElseThrow().value();
    }
}
