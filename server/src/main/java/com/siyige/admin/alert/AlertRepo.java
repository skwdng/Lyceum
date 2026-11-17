package com.siyige.admin.alert;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 告警两表的 SQL（`sy_alert` + `sy_alert_mute`），只做读写，不含判定（判定在 {@link AlertService}）。
 *
 * <p>写库口径与项目其它地方一致：
 * <ul>
 *   <li>时间一律用 {@link Timestamp} 传参，不用数据库函数（H2 与 MySQL 都能跑）</li>
 *   <li>不写 upsert 语法（H2 的 `merge` 与 MySQL 的 `on duplicate key` 不同）——
 *       去重靠**唯一索引 + 捕获 DuplicateKeyException**，两边一致</li>
 * </ul>
 */
@Repository
public class AlertRepo {

    private final JdbcTemplate jdbc;

    public AlertRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ==================== 指标（扫描用，全部单表查询，不用 join） ====================

    /**
     * 24 小时内的举报聚合（**两条规则共用这一份结果**，不查两遍）。
     *
     * <p>只算 `PENDING` / `ACCEPTED`：IGNORED / REJECTED 是"已判定没事"的举报，不该继续推高指标。
     * （`REOPENED` 是撤销处理后回滚的状态，按设计 §3.1 的取值不进统计。）
     */
    public List<Map<String, Object>> reportBurstsSince(Timestamp since, int threshold) {
        return jdbc.queryForList(
                "select target_type, target_id, count(*) as cnt from sy_report "
                        + "where created_at >= ? and status in ('PENDING','ACCEPTED') "
                        + "group by target_type, target_id having count(*) > ?",
                since, threshold);
    }

    /** 批量查帖子的作者（`in` 查询，结果集通常 0~几条）。 */
    public Map<Long, String> authorsOfPosts(List<Long> postIds) {
        return idToOwner("select id, author_id as owner from sy_post where id in (%s)", postIds);
    }

    /** 批量查评论的作者。 */
    public Map<Long, String> authorsOfComments(List<Long> commentIds) {
        return idToOwner("select id, user_id as owner from sy_post_comment where id in (%s)", commentIds);
    }

    private Map<Long, String> idToOwner(String sqlTemplate, List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Collections.emptyMap();
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        List<Map<String, Object>> rows = jdbc.queryForList(
                String.format(sqlTemplate, placeholders), ids.toArray());
        Map<Long, String> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            Object id = r.get("id");
            Object owner = r.get("owner");
            if (id instanceof Number n && owner != null) out.put(n.longValue(), String.valueOf(owner));
        }
        return out;
    }

    /** 全局 PENDING 举报数（积压规则）。 */
    public long countPendingReports() {
        Long n = jdbc.queryForObject("select count(*) from sy_report where status = 'PENDING'", Long.class);
        return n == null ? 0 : n;
    }

    /** 最老一条 PENDING 的时间（detail 里说"最老一条已等 N 小时"）。 */
    public Timestamp oldestPendingAt() {
        return jdbc.queryForObject("select min(created_at) from sy_report where status = 'PENDING'", Timestamp.class);
    }

    /** 某天的活跃统计有没有落库（DAU 规则：**等于 0 行** 才是问题）。 */
    public boolean hasDailyActive(LocalDate day) {
        Long n = jdbc.queryForObject("select count(*) from sy_daily_active where day_key = ?",
                Long.class, java.sql.Date.valueOf(day));
        return n != null && n > 0;
    }

    // ==================== 告警读写 ====================

    /** 同一对象当天的 OPEN 告警（去重命中时只 touch，不新增）。 */
    public Map<String, Object> findOpen(String ruleKey, String targetType, String targetId) {
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder(
                "select id, metric, dedup_key from sy_alert where rule_key = ? and status = 'OPEN'");
        args.add(ruleKey);
        if (targetType == null) {
            sql.append(" and target_type is null and target_id is null");
        } else {
            sql.append(" and target_type = ? and target_id = ?");
            args.add(targetType);
            args.add(targetId);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 去重命中：更新 metric / last_seen（first_seen 与 dedup_key 不动）。
     *
     * <p>**title / detail 也跟着更新**：它们都是从 metric 派生的人读描述，
     * 只改数字不改文案会出现「标题说积压 12 条、实际值写 24」这种自相矛盾的一行。
     */
    public int touch(long id, long metric, String title, String detail, Timestamp now) {
        return jdbc.update("update sy_alert set metric = ?, title = ?, detail = ?, last_seen = ? where id = ?",
                metric, cut(title, 120), cut(detail, 500), now, id);
    }

    /**
     * 插入一条告警；`dedup_key` 撞唯一索引时返回 -1（并发下另一个扫描已经插过了）。
     *
     * <p>不用"先查再插"：两个线程同时扫会都查到"没有"，然后一个抛唯一键冲突。
     * 这里直接用唯一索引 + 捕获异常，语义简单也不会脏。
     */
    public long insertIfAbsent(String ruleKey, String targetType, String targetId, String level,
                               String title, String detail, long metric, String dedupKey, Timestamp now) {
        try {
            jdbc.update(
                    "insert into sy_alert(rule_key, target_type, target_id, level, title, detail, metric, "
                            + "dedup_key, status, first_seen, last_seen) "
                            + "values(?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)",
                    ruleKey, targetType, targetId, level, cut(title, 120), cut(detail, 500),
                    metric, dedupKey, now, now);
        } catch (DuplicateKeyException dup) {
            return -1;
        }
        Long id = jdbc.queryForObject("select id from sy_alert where dedup_key = ?", Long.class, dedupKey);
        return id == null ? -1 : id;
    }

    /** 某规则下所有 OPEN 的（规则, 对象）键，用来找出"这次不再超标"的那些。 */
    public List<Map<String, Object>> openOfRule(String ruleKey) {
        return jdbc.queryForList(
                "select id, target_type, target_id from sy_alert where rule_key = ? and status = 'OPEN'", ruleKey);
    }

    /** 指标回落：OPEN -> RESOLVED。ACKED 的**不动**（设计 §4：ACKED 后回落保持 ACKED）。 */
    public int resolve(long id) {
        return jdbc.update(
                "update sy_alert set status = 'RESOLVED', resolved_at = ? where id = ? and status = 'OPEN'",
                Timestamp.from(Instant.now()), id);
    }

    // ==================== 列表 / 未读数 / 处理 ====================

    public long countByStatus(String status) {
        if (status == null) {
            Long n = jdbc.queryForObject("select count(*) from sy_alert", Long.class);
            return n == null ? 0 : n;
        }
        Long n = jdbc.queryForObject("select count(*) from sy_alert where status = ?", Long.class, status);
        return n == null ? 0 : n;
    }

    /** 红点：永远现算 `count(*) where status='OPEN'`，不缓存（设计 §4）。 */
    public long countOpen() {
        return countByStatus(AlertRule.STATUS_OPEN);
    }

    public List<Map<String, Object>> list(String status, int offset, int limit) {
        if (status == null) {
            return jdbc.queryForList(
                    "select * from sy_alert order by last_seen desc, id desc limit ? offset ?", limit, offset);
        }
        return jdbc.queryForList(
                "select * from sy_alert where status = ? order by last_seen desc, id desc limit ? offset ?",
                status, limit, offset);
    }

    public Map<String, Object> find(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_alert where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 已处理（ACKED）。只对 OPEN 生效，已 RESOLVED 的返回 0 由上层给 409。 */
    public int ack(long id, String by, String note) {
        return jdbc.update(
                "update sy_alert set status = 'ACKED', acked_by = ?, acked_note = ?, acked_at = ? "
                        + "where id = ? and status = 'OPEN'",
                by, cut(note, 200), Timestamp.from(Instant.now()), id);
    }

    /** 误点撤回（ACKED -> OPEN），同时清掉 acked_*（它现在又是未处理了）。 */
    public int reopen(long id) {
        return jdbc.update(
                "update sy_alert set status = 'OPEN', acked_by = null, acked_note = null, acked_at = null "
                        + "where id = ? and status = 'ACKED'", id);
    }

    // ==================== 静音 ====================

    /** 该规则的静音截止时间（没静音或已过期返回 null）。 */
    public Timestamp mutedUntil(String ruleKey) {
        List<Timestamp> rows = jdbc.queryForList(
                "select muted_until from sy_alert_mute where rule_key = ?", Timestamp.class, ruleKey);
        if (rows.isEmpty() || rows.get(0) == null) return null;
        Timestamp until = rows.get(0);
        return until.after(Timestamp.from(Instant.now())) ? until : null;
    }

    /** 静音（有就改，没有就插 —— 先 update 再 insert，两边语法都通用）。 */
    public void mute(String ruleKey, Timestamp until, String by) {
        int n = jdbc.update("update sy_alert_mute set muted_until = ?, muted_by = ? where rule_key = ?",
                until, by, ruleKey);
        if (n == 0) {
            jdbc.update("insert into sy_alert_mute(rule_key, muted_until, muted_by) values(?, ?, ?)",
                    ruleKey, until, by);
        }
    }

    public int unmute(String ruleKey) {
        return jdbc.update("delete from sy_alert_mute where rule_key = ?", ruleKey);
    }

    /** 当前仍有效的静音（界面下拉里显示「已静音至 …」）。 */
    public List<Map<String, Object>> activeMutes() {
        return jdbc.queryForList(
                "select rule_key, muted_until, muted_by from sy_alert_mute where muted_until > ? order by rule_key",
                Timestamp.from(Instant.now()));
    }

    // ==================== 小工具 ====================

    private static String cut(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        if (t.length() <= max) return t;
        return t.substring(0, max - 1) + "…";
    }
}
