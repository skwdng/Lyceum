package com.siyige.admin.analytics;

import java.util.List;

/**
 * 报表接口的出参（都是 record，Jackson 直接序列化）。
 *
 * <p>形状设计原则：**前端只负责画**，不做聚合。
 * 所以后端给的都是「补好零、排好序、带好占比」的数组，P4 的页面拿到就能塞进图表组件
 * （{@code Point} 正好是 {@code LineChart/BarChart/DonutChart} 的 points 形状）。
 */
public final class AnalyticsDtos {

    private AnalyticsDtos() { }

    /** 单个数据点：x 是标签（MM-dd / 维度名），y 是数值。与图表组件的 points 同形。 */
    public record Point(String x, long y) { }

    /**
     * 一张 KPI 卡：当期值 + 上周期值 + 涨跌。
     *
     * <p>{@code deltaPct} 在上周期为 0 时为 null（"从 0 变成 5"没有百分比意义，
     * 前端要显示「新增」而不是写个 ∞）。
     */
    public record KpiItem(String key, String label, long value, long prev, Double deltaPct, String unit) { }

    /** 概览：一段时间的 KPI + 与上周期对比。 */
    public record Overview(String from, String to, String prevFrom, String prevTo, List<KpiItem> items) { }

    /**
     * 一个模块的浏览统计。
     *
     * <p>{@code uv} 是**各日 UV 之和（人天）**，不是区间去重人数 ——
     * 区间去重需要每天的 HyperLogLog 还在（Redis 只留 3 天），所以另外给一个
     * {@code uvPeak}（单日峰值）更能说明"一天最多多少人"。
     */
    public record ModuleStat(String module, long pv, long uv, long uvPeak, double sharePct) { }

    /** 单个模块的逐日序列。 */
    public record ModuleSeries(String module, List<Long> pv, List<Long> uv) { }

    /** 模块趋势：days 是横轴，series 与 days 等长。 */
    public record ModuleTrend(List<String> days, List<ModuleSeries> series) { }

    /**
     * 模块浏览：排行 + 趋势。
     *
     * @param liveToday 今天这一格是否叠加了「还没回写进 Redis→库」的实时增量
     *                  （界面据此提示"今日含实时数据"，避免用户拿它对账时困惑）
     */
    public record Modules(String range, String from, String to, boolean liveToday,
                          List<ModuleStat> modules, ModuleTrend trend) { }

    /** 时间序列（已补零）。 */
    public record Trend(String metric, String range, String granularity, List<Point> points) { }

    /** 分布（档位 / 举报原因 / 帖子类型 / 席位）。 */
    public record Breakdown(String dim, String range, List<Point> points, long total) { }

    /** 活跃：逐日 DAU + WAU / MAU（HLL 合并去重）。 */
    public record Active(String range, List<Point> points, long dau, long wau, long mau) { }

    /** 一个维度的平均分（六维）。 */
    public record DimAvg(String key, String label, double value) { }

    /** 质量：平均轮数、AI 发言占比、六维平均分。 */
    public record Quality(String range, double avgTurns, double aiRatio, List<DimAvg> dims, long samples) { }
}
