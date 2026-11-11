package com.siyige.admin.analytics;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 导出：把页面上同一份结果摊成表格（不能出现"页面一个数、Excel 另一个数"）。 */
class AnalyticsExportServiceTest {

    private final AnalyticsService analytics = mock(AnalyticsService.class);
    private final AnalyticsExportService service = new AnalyticsExportService(analytics);

    @Test
    void 模块导出CSV_含表头与占比() {
        when(analytics.modules("30d")).thenReturn(new AnalyticsDtos.Modules("30d", "2026-11-05", "2026-11-11", false,
                List.of(new AnalyticsDtos.ModuleStat("community", 120, 30, 20, 60.0),
                        new AnalyticsDtos.ModuleStat("chat", 80, 10, 8, 40.0)),
                new AnalyticsDtos.ModuleTrend(List.of(), List.of())));

        AnalyticsExportService.ExportFile f = service.export("csv", "modules", "30d", null, null);

        assertEquals(AnalyticsExportService.CT_CSV, f.contentType());
        assertTrue(f.filename().matches("modules_\\d{4}-\\d{2}-\\d{2}\\.csv"), f.filename());

        String text = new String(f.bytes(), StandardCharsets.UTF_8);
        assertTrue(text.contains("模块,PV,UV(人天),单日峰值UV,占比%"), text);
        assertTrue(text.contains("community,120,30,20,60.0"), text);
        assertTrue(text.contains("chat,80,10,8,40.0"), text);
    }

    @Test
    void 模块导出XLSX_是zip且文件名正确() {
        when(analytics.modules(any())).thenReturn(new AnalyticsDtos.Modules("7d", "2026-11-05", "2026-11-11", false,
                List.of(new AnalyticsDtos.ModuleStat("community", 120, 30, 20, 100.0)),
                new AnalyticsDtos.ModuleTrend(List.of(), List.of())));

        AnalyticsExportService.ExportFile f = service.export("xlsx", "modules", null, null, null);

        assertEquals(AnalyticsExportService.CT_XLSX, f.contentType());
        assertTrue(f.filename().endsWith(".xlsx"), f.filename());
        assertEquals('P', f.bytes()[0]);
        assertEquals('K', f.bytes()[1]);
    }

    @Test
    void 概览导出_环比为null写成破折号() {
        when(analytics.overview(any(), any())).thenReturn(new AnalyticsDtos.Overview(
                "2026-11-05", "2026-11-11", "2026-10-29", "2026-11-04",
                List.of(new AnalyticsDtos.KpiItem("newUsers", "新增用户", 5, 0, null, "人"),
                        new AnalyticsDtos.KpiItem("posts", "发帖数", 8, 4, 100.0, "篇"))));

        String text = new String(service.export("csv", "overview", "7d", null, null).bytes(),
                StandardCharsets.UTF_8);

        assertTrue(text.contains("新增用户,5,0,—,人"), text);
        assertTrue(text.contains("发帖数,8,4,100.0%,篇"), text);
    }

    @Test
    void 趋势导出按metric取中文表头() {
        when(analytics.trend(any(), any(), any())).thenReturn(new AnalyticsDtos.Trend(
                "posts", "7d", "day", List.of(new AnalyticsDtos.Point("11-11", 3))));

        String text = new String(service.export("csv", "trend", "7d", "posts", null).bytes(),
                StandardCharsets.UTF_8);
        assertTrue(text.contains("日期,发帖数"), text);
        assertTrue(text.contains("11-11,3"), text);
    }

    @Test
    void 分布导出带占比() {
        when(analytics.breakdown(any(), any())).thenReturn(new AnalyticsDtos.Breakdown(
                "tier", "30d", List.of(new AnalyticsDtos.Point("PRO", 3), new AnalyticsDtos.Point("BASIC", 1)), 4));

        String text = new String(service.export("csv", "breakdown", "30d", null, "tier").bytes(),
                StandardCharsets.UTF_8);
        assertTrue(text.contains("PRO,3,75.0"), text);
        assertTrue(text.contains("BASIC,1,25.0"), text);
    }

    @Test
    void 质量导出含汇总与六维() {
        when(analytics.quality(any())).thenReturn(new AnalyticsDtos.Quality("30d", 5.2, 38.5,
                List.of(new AnalyticsDtos.DimAvg("立论", "立论", 72.4)), 18));

        String text = new String(service.export("csv", "quality", "30d", null, null).bytes(),
                StandardCharsets.UTF_8);
        assertTrue(text.contains("平均轮数,5.2"), text);
        assertTrue(text.contains("AI 发言占比%,38.5"), text);
        assertTrue(text.contains("复盘样本数,18"), text);
        assertTrue(text.contains("立论平均分,72.4"), text);
    }

    @Test
    void 非法format与report报400() {
        IllegalArgumentException fmt = assertThrows(IllegalArgumentException.class,
                () -> service.export("pdf", "modules", "30d", null, null));
        assertTrue(fmt.getMessage().startsWith("INVALID_FORMAT"));

        IllegalArgumentException rep = assertThrows(IllegalArgumentException.class,
                () -> service.export("csv", "hack", "30d", null, null));
        assertTrue(rep.getMessage().startsWith("INVALID_REPORT"));
    }
}
