package com.siyige.admin.analytics;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理台报表接口（设计文档 §5.2）：**只读**，六个 GET。
 *
 * <pre>
 *   GET /api/admin/analytics/overview?from=&to=            概览 KPI + 与上周期对比
 *   GET /api/admin/analytics/modules?range=7d|30d|90d      模块浏览排行 + 逐日趋势
 *   GET /api/admin/analytics/trend?metric=&range=&granularity=  时间序列（已补零）
 *   GET /api/admin/analytics/breakdown?dim=&range=         分布（档位/举报原因/帖子类型/席位）
 *   GET /api/admin/analytics/active?range=                 DAU 曲线 + WAU / MAU
 *   GET /api/admin/analytics/quality?range=                平均轮数 / AI 发言占比 / 六维平均分
 * </pre>
 *
 * <p>鉴权：路径落在 {@code /api/admin/*} 上，由 {@code AdminAuthFilter} 统一校验管理员令牌，
 * 这里**不重复做鉴权**（与其它管理接口一致）。参数非法一律 400（
 * {@code INVALID_RANGE / INVALID_METRIC / INVALID_DIM / INVALID_GRANULARITY}），
 * 由 {@code ApiErrors} 转成统一错误体。
 *
 * <p>没有导出接口：CSV / XLSX 属于 P4，会和导出按钮一起做。
 */
@RestController
@RequestMapping("/api/admin/analytics")
public class AnalyticsController {

    private final AnalyticsService service;
    private final AnalyticsExportService exporter;

    public AnalyticsController(AnalyticsService service, AnalyticsExportService exporter) {
        this.service = service;
        this.exporter = exporter;
    }

    @GetMapping("/overview")
    public AnalyticsDtos.Overview overview(@RequestParam(required = false) String from,
                                           @RequestParam(required = false) String to) {
        return service.overview(from, to);
    }

    @GetMapping("/modules")
    public AnalyticsDtos.Modules modules(@RequestParam(required = false) String range) {
        return service.modules(range);
    }

    @GetMapping("/trend")
    public AnalyticsDtos.Trend trend(@RequestParam(required = false) String metric,
                                     @RequestParam(required = false) String range,
                                     @RequestParam(required = false) String granularity) {
        return service.trend(metric, range, granularity);
    }

    @GetMapping("/breakdown")
    public AnalyticsDtos.Breakdown breakdown(@RequestParam(required = false) String dim,
                                             @RequestParam(required = false) String range) {
        return service.breakdown(dim, range);
    }

    @GetMapping("/active")
    public AnalyticsDtos.Active active(@RequestParam(required = false) String range) {
        return service.active(range);
    }

    @GetMapping("/quality")
    public AnalyticsDtos.Quality quality(@RequestParam(required = false) String range) {
        return service.quality(range);
    }

    /**
     * 导出：{@code GET /api/admin/analytics/export?format=csv|xlsx&report=&range=&metric=&dim=}
     *
     * <p>文件名是**英文 + 日期**（{@code modules_2026-11-11.xlsx}），
     * 不用中文：不同浏览器/系统对下载文件名编码的处理不一致，中文容易乱码。
     */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(required = false) String format,
                                        @RequestParam(required = false) String report,
                                        @RequestParam(required = false) String range,
                                        @RequestParam(required = false) String metric,
                                        @RequestParam(required = false) String dim) {
        AnalyticsExportService.ExportFile file = exporter.export(format, report, range, metric, dim);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"")
                .contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.bytes().length)
                .body(file.bytes());
    }
}
