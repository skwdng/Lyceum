package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 报表导出（设计文档 §6）：把 P3 已经算好的数据摊平成表格，交给 {@link ExportWriter}。
 *
 * <p>为什么不直接导 SQL 结果：导出的表要和页面看到的**同一个数**。
 * 页面用的就是 {@link AnalyticsService} 的补零/占比/环比结果，这里只是把它换成行，
 * 从而避免"页面一个数、Excel 另一个数"这种最难解释的问题。
 *
 * <p>文件名用**英文 + 日期**（{@code modules_2026-11-11.xlsx}）：
 * 中文文件名在不同浏览器/系统上的编码处理不一致，容易出现乱码或下载失败。
 */
@Service
public class AnalyticsExportService {

    /** 下载内容：文件名、Content-Type、字节。 */
    public record ExportFile(String filename, String contentType, byte[] bytes) { }

    public static final String CT_CSV = "text/csv; charset=UTF-8";
    public static final String CT_XLSX =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /** 支持的报表（与页面上的导出按钮一一对应）。 */
    public static final List<String> REPORTS =
            List.of("overview", "modules", "trend", "breakdown", "active", "quality");

    private final AnalyticsService analytics;

    public AnalyticsExportService(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    /**
     * @param format  csv | xlsx
     * @param report  {@link #REPORTS} 之一
     * @param range   7d / 30d / 90d（overview 也支持，等价于最近 N 天）
     * @param metric  report=trend 时必填
     * @param dim     report=breakdown 时必填
     */
    public ExportFile export(String format, String report, String range, String metric, String dim) {
        String fmt = format == null || format.isBlank() ? "csv" : format.trim().toLowerCase(Locale.ROOT);
        if (!fmt.equals("csv") && !fmt.equals("xlsx")) {
            throw new IllegalArgumentException("INVALID_FORMAT: 只支持 csv / xlsx");
        }
        String rep = report == null || report.isBlank() ? "modules" : report.trim().toLowerCase(Locale.ROOT);
        if (!REPORTS.contains(rep)) {
            throw new IllegalArgumentException("INVALID_REPORT: 只支持 " + String.join(" / ", REPORTS));
        }

        Table table = switch (rep) {
            case "overview" -> overviewTable(range);
            case "trend" -> trendTable(metric, range);
            case "breakdown" -> breakdownTable(dim, range);
            case "active" -> activeTable(range);
            case "quality" -> qualityTable(range);
            default -> modulesTable(range);
        };

        String filename = rep + "_" + LocalDate.now(DayKeys.ZONE) + (fmt.equals("csv") ? ".csv" : ".xlsx");
        byte[] bytes = fmt.equals("csv")
                ? ExportWriter.csv(table.header(), table.rows())
                : ExportWriter.xlsx(table.sheetName(), table.header(), table.rows(), table.widths());
        return new ExportFile(filename, fmt.equals("csv") ? CT_CSV : CT_XLSX, bytes);
    }

    /** 一张表：表头 + 行 + 列宽 + sheet 名。 */
    private record Table(String sheetName, List<String> header, List<List<Object>> rows, List<Integer> widths) { }

    private Table overviewTable(String range) {
        AnalyticsRange r = AnalyticsRange.ofRange(range, 7);
        AnalyticsDtos.Overview o = analytics.overview(r.from().toString(), r.to().toString());

        List<List<Object>> rows = new ArrayList<>();
        for (AnalyticsDtos.KpiItem it : o.items()) {
            rows.add(List.of(
                    it.label(),
                    it.value(),
                    it.prev(),
                    it.deltaPct() == null ? "—" : it.deltaPct() + "%",
                    it.unit() == null ? "" : it.unit()));
        }
        return new Table("概览", List.of("指标", "当前值", "上期", "环比", "单位"), rows,
                List.of(16, 12, 12, 10, 8));
    }

    private Table modulesTable(String range) {
        AnalyticsDtos.Modules m = analytics.modules(range);
        List<List<Object>> rows = new ArrayList<>();
        for (AnalyticsDtos.ModuleStat s : m.modules()) {
            rows.add(List.of(s.module(), s.pv(), s.uv(), s.uvPeak(), s.sharePct()));
        }
        return new Table("模块浏览", List.of("模块", "PV", "UV(人天)", "单日峰值UV", "占比%"), rows,
                List.of(14, 10, 12, 14, 10));
    }

    private Table trendTable(String metric, String range) {
        String m = metric == null || metric.isBlank() ? "matches" : metric.trim();
        AnalyticsDtos.Trend t = analytics.trend(m, range, "day");
        List<List<Object>> rows = new ArrayList<>();
        for (AnalyticsDtos.Point p : t.points()) rows.add(List.of(p.x(), p.y()));
        return new Table("趋势-" + metricLabel(m), List.of("日期", metricLabel(m)), rows, List.of(12, 14));
    }

    private Table breakdownTable(String dim, String range) {
        AnalyticsDtos.Breakdown b = analytics.breakdown(dim, range);
        List<List<Object>> rows = new ArrayList<>();
        for (AnalyticsDtos.Point p : b.points()) {
            double pct = b.total() > 0 ? Math.round(p.y() * 1000.0 / b.total()) / 10.0 : 0;
            rows.add(List.of(p.x(), p.y(), pct));
        }
        return new Table("分布-" + dimLabel(b.dim()), List.of("取值", "数量", "占比%"), rows,
                List.of(16, 12, 10));
    }

    private Table activeTable(String range) {
        AnalyticsDtos.Active a = analytics.active(range);
        List<List<Object>> rows = new ArrayList<>();
        for (AnalyticsDtos.Point p : a.points()) rows.add(List.of(p.x(), p.y()));
        return new Table("活跃", List.of("日期", "DAU"), rows, List.of(12, 10));
    }

    private Table qualityTable(String range) {
        AnalyticsDtos.Quality q = analytics.quality(range);
        List<List<Object>> rows = new ArrayList<>();
        rows.add(List.of("平均轮数", q.avgTurns()));
        rows.add(List.of("AI 发言占比%", q.aiRatio()));
        rows.add(List.of("复盘样本数", q.samples()));
        for (AnalyticsDtos.DimAvg d : q.dims()) rows.add(List.of(d.label() + "平均分", d.value()));
        return new Table("质量", List.of("项目", "值"), rows, List.of(18, 12));
    }

    private static String metricLabel(String m) {
        return switch (m) {
            case "posts" -> "发帖数";
            case "active" -> "活跃用户";
            case "revenue" -> "充值收入(分)";
            case "reports" -> "举报数";
            case "newUsers" -> "新增用户";
            default -> "对局数";
        };
    }

    private static String dimLabel(String dim) {
        return switch (dim) {
            case "report_reason" -> "举报原因";
            case "post_type" -> "帖子类型";
            case "seat" -> "席位";
            default -> "档位";
        };
    }
}
