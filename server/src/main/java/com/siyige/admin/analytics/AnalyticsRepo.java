package com.siyige.admin.analytics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 报表的纯 SQL 层：**只取数、不做聚合计算**（分桶/补零/占比都在 Java 里，设计文档 §5.3）。
 *
 * <p>为什么 SQL 里不写 GROUP BY 日期之外的复杂聚合：H2 与 MySQL 的日期函数不同
 * （{@code formatdatetime} vs {@code date_format}），写进 SQL 换库就要改；
 * 而管理台数据量小，Java 里按 {@link LocalDate} 分桶的开销可以忽略。
 *
 * <p>所有时间区间都用**左闭右开** {@code [from, to+1)}：避免 timestamp 的
 * {@code <= 23:59:59} 漏掉最后一秒的小数部分。
 *
 * <p>表名/列名一律写死在这个文件里，**不接受任何外部拼接**（没有 SQL 注入面）。
 */
@Repository
public class AnalyticsRepo {

    private final JdbcTemplate jdbc;

    public AnalyticsRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ==================== 逐日计数（趋势 / 概览用） ====================

    /** 开局数（sy_match 没有 created_at，用 started_at）。 */
    public Map<LocalDate, Long> matchesByDay(LocalDate from, LocalDate to) {
        return byDay("select cast(started_at as date) d, count(*) c from sy_match " +
                "where started_at >= ? and started_at < ? group by cast(started_at as date)", from, to);
    }

    /** 发帖数（不含软删除）。 */
    public Map<LocalDate, Long> postsByDay(LocalDate from, LocalDate to) {
        return byDay("select cast(created_at as date) d, count(*) c from sy_post " +
                "where status = 1 and created_at >= ? and created_at < ? group by cast(created_at as date)", from, to);
    }

    /** 新增用户（不含 AI 账号）。 */
    public Map<LocalDate, Long> usersByDay(LocalDate from, LocalDate to) {
        return byDay("select cast(created_at as date) d, count(*) c from sy_user " +
                "where is_bot = 0 and created_at >= ? and created_at < ? group by cast(created_at as date)", from, to);
    }

    /** 举报数。 */
    public Map<LocalDate, Long> reportsByDay(LocalDate from, LocalDate to) {
        return byDay("select cast(created_at as date) d, count(*) c from sy_report " +
                "where created_at >= ? and created_at < ? group by cast(created_at as date)", from, to);
    }

    /** 营收（分）：只算真实充值 RECHARGE；HOLD/SETTLE 是内部扣费流转，不是收入。 */
    public Map<LocalDate, Long> revenueByDay(LocalDate from, LocalDate to) {
        return byDay("select cast(created_at as date) d, coalesce(sum(amount_cents), 0) c from sy_wallet_tx " +
                "where kind = 'RECHARGE' and created_at >= ? and created_at < ? group by cast(created_at as date)", from, to);
    }

    /** 日活（来自 P1 的 sy_daily_active；没有数据的日期不返回，由 Service 补零）。 */
    public Map<LocalDate, Long> dauByDay(LocalDate from, LocalDate to) {
        Map<LocalDate, Long> out = new LinkedHashMap<>();
        jdbc.query("select day_key, dau from sy_daily_active where day_key >= ? and day_key <= ?",
                rs -> {
                    out.put(rs.getDate("day_key").toLocalDate(), rs.getLong("dau"));
                }, Date.valueOf(from), Date.valueOf(to));
        return out;
    }

    // ==================== 区间合计（概览 / 对比用） ====================

    public long countMatches(LocalDate from, LocalDate to) {
        return count("select count(*) from sy_match where started_at >= ? and started_at < ?", from, to);
    }

    public long countPosts(LocalDate from, LocalDate to) {
        return count("select count(*) from sy_post where status = 1 and created_at >= ? and created_at < ?", from, to);
    }

    public long countUsers(LocalDate from, LocalDate to) {
        return count("select count(*) from sy_user where is_bot = 0 and created_at >= ? and created_at < ?", from, to);
    }

    public long countReports(LocalDate from, LocalDate to) {
        return count("select count(*) from sy_report where created_at >= ? and created_at < ?", from, to);
    }

    public long sumRevenueCents(LocalDate from, LocalDate to) {
        return count("select coalesce(sum(amount_cents), 0) from sy_wallet_tx " +
                "where kind = 'RECHARGE' and created_at >= ? and created_at < ?", from, to);
    }

    /** 待处理举报（全量，不按时间：它就是"现在积压了多少"）。 */
    public long pendingReports() {
        Long n = jdbc.queryForObject("select count(*) from sy_report where status = 'PENDING'", Long.class);
        return n == null ? 0 : n;
    }

    /** 当前全站封禁中的用户数（不含 AI）。 */
    public long bannedUsers() {
        Long n = jdbc.queryForObject("select count(*) from sy_user where status = 0 and is_bot = 0", Long.class);
        return n == null ? 0 : n;
    }

    // ==================== 模块浏览（P1 的两张表） ====================

    /** 一个模块行的合计（uvPeak = 单日峰值，说明"一天最多多少人"）。 */
    public record ModuleTotal(String module, long pv, long uv, long uvPeak) { }

    public List<ModuleTotal> moduleTotals(LocalDate from, LocalDate to) {
        return jdbc.query("select module, coalesce(sum(pv),0) pv, coalesce(sum(uv),0) uv, coalesce(max(uv),0) uv_peak " +
                        "from sy_module_view where day_key >= ? and day_key <= ? group by module order by pv desc",
                (rs, i) -> new ModuleTotal(rs.getString("module"), rs.getLong("pv"),
                        rs.getLong("uv"), rs.getLong("uv_peak")),
                Date.valueOf(from), Date.valueOf(to));
    }

    /** 某天某模块的一行（趋势用）。 */
    public record ModuleDay(LocalDate day, String module, long pv, long uv) { }

    public List<ModuleDay> moduleByDay(LocalDate from, LocalDate to) {
        return jdbc.query("select day_key, module, pv, uv from sy_module_view " +
                        "where day_key >= ? and day_key <= ? order by day_key",
                (rs, i) -> new ModuleDay(rs.getDate("day_key").toLocalDate(), rs.getString("module"),
                        rs.getLong("pv"), rs.getLong("uv")),
                Date.valueOf(from), Date.valueOf(to));
    }

    // ==================== 分布 ====================

    /** 一个维度的取值 + 数量。 */
    public record KeyCount(String key, long n) { }

    /** 支持的维度（白名单在这里，不在 Controller 里，避免有人传别的进去）。 */
    public static final List<String> DIMS = List.of("tier", "report_reason", "post_type", "seat");

    /**
     * 四个维度的分布。
     *
     * <p>注：「席位」统计的是**当前房间里的占位情况**（正方/反方），没有时间范围语义 ——
     * sy_seat 只保存当前房间状态，不保留历史场地。
     */
    public List<KeyCount> breakdown(String dim, LocalDate from, LocalDate to) {
        if (dim == null) throw new IllegalArgumentException("INVALID_DIM: dim 不能为空");
        List<KeyCount> rows = switch (dim) {
            case "tier" -> jdbc.query("select coalesce(tier,'UNKNOWN') k, count(*) n from sy_match " +
                            "where started_at >= ? and started_at < ? group by coalesce(tier,'UNKNOWN') order by n desc",
                    keyCountMapper(), Date.valueOf(from), Date.valueOf(to.plusDays(1)));
            case "report_reason" -> jdbc.query("select reason k, count(*) n from sy_report " +
                            "where created_at >= ? and created_at < ? group by reason order by n desc",
                    keyCountMapper(), Date.valueOf(from), Date.valueOf(to.plusDays(1)));
            case "post_type" -> jdbc.query("select type k, count(*) n from sy_post " +
                            "where status = 1 and created_at >= ? and created_at < ? group by type order by n desc",
                    keyCountMapper(), Date.valueOf(from), Date.valueOf(to.plusDays(1)));
            case "seat" -> jdbc.query("select side k, count(*) n from sy_seat " +
                    "where occupant is not null and occupant <> 'EMPTY' group by side order by n desc", keyCountMapper());
            default -> throw new IllegalArgumentException("INVALID_DIM: 只支持 " + String.join(" / ", DIMS));
        };
        // 排序后再按数量降序（SQL 已 order by，这里保证 seat 分支也一致）
        rows.sort((a, b) -> Long.compare(b.n(), a.n()));
        return new ArrayList<>(rows);
    }

    // ==================== 质量 ====================

    /** 平均轮数（sy_record.turns）。 */
    public double avgTurns(LocalDate from, LocalDate to) {
        Double v = jdbc.queryForObject("select avg(turns) from sy_record " +
                        "where turns is not null and created_at >= ? and created_at < ?",
                Double.class, Date.valueOf(from), Date.valueOf(to.plusDays(1)));
        return v == null ? 0 : v;
    }

    /** 区间内的复盘样本数（分母，说明"平均分是基于几场算的"）。 */
    public long recordSamples(LocalDate from, LocalDate to) {
        Long n = jdbc.queryForObject("select count(*) from sy_record where created_at >= ? and created_at < ?",
                Long.class, Date.valueOf(from), Date.valueOf(to.plusDays(1)));
        return n == null ? 0 : n;
    }

    /** 每场的六维分（JSON 串），由 Service 在 Java 里求平均。 */
    public List<String> dimsJson(LocalDate from, LocalDate to) {
        return jdbc.queryForList("select dims_json from sy_record where dims_json is not null " +
                        "and created_at >= ? and created_at < ?",
                String.class, Date.valueOf(from), Date.valueOf(to.plusDays(1)));
    }

    /** AI 发言占比的分子/分母。 */
    public record AiTurns(long total, long ai) { }

    public AiTurns aiTurns(LocalDate from, LocalDate to) {
        return jdbc.queryForObject("select count(*) total, " +
                        "coalesce(sum(case when input_type = 'ai' then 1 else 0 end), 0) ai from sy_turn " +
                        "where created_at >= ? and created_at < ?",
                (rs, i) -> new AiTurns(rs.getLong("total"), rs.getLong("ai")),
                Date.valueOf(from), Date.valueOf(to.plusDays(1)));
    }

    // ==================== 内部小工具 ====================

    private Map<LocalDate, Long> byDay(String sql, LocalDate from, LocalDate to) {
        Map<LocalDate, Long> out = new LinkedHashMap<>();
        jdbc.query(sql, rs -> {
            out.put(rs.getDate("d").toLocalDate(), rs.getLong("c"));
        }, Date.valueOf(from), Date.valueOf(to.plusDays(1)));
        return out;
    }

    private long count(String sql, LocalDate from, LocalDate to) {
        Long n = jdbc.queryForObject(sql, Long.class, Date.valueOf(from), Date.valueOf(to.plusDays(1)));
        return n == null ? 0 : n;
    }

    private static org.springframework.jdbc.core.RowMapper<KeyCount> keyCountMapper() {
        return (rs, i) -> new KeyCount(rs.getString("k"), rs.getLong("n"));
    }
}
