package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端举报数据访问。
 *
 * <p>与用户侧的 `community/ReportRepo` 按用途分开：这里只有**聚合队列 / 详情 / 处理**，
 * 那边只有**提交 / 查重 / 我的举报**。
 *
 * <p>队列按「被举报目标」聚合：一行 = 一个帖子或一条评论，
 * 排序 = 举报人数降序 + 首次举报时间升序（方案 D7）。
 */
@Repository
public class AdminReportRepo {

    private final JdbcTemplate jdbc;

    public AdminReportRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ==================== 队列 ====================

    /** 聚合后的总行数（用于分页）。 */
    public long countGroups(String status) {
        Long n = jdbc.queryForObject(
                "select count(*) from (select 1 from sy_report where status = ? " +
                "group by target_type, target_id) g", Long.class, status);
        return n == null ? 0 : n;
    }

    /**
     * 聚合列表。
     *
     * <p>聚合用派生表 + left join 目标表：帖子取标题、评论取正文；
     * 目标已被删除时 join 不上，字段为 null，由 Service 标成「目标已不存在」。
     */
    public List<Map<String, Object>> listGroups(String status, int offset, int limit) {
        return jdbc.queryForList(
                "select g.target_type, g.target_id, g.report_count, g.reporter_count, " +
                "       g.first_at, g.last_at, g.first_report_id, " +
                "       p.title as post_title, p.author_id as post_author, p.status as post_status, " +
                "       c.body as comment_body, c.user_id as comment_author, c.post_id as comment_post_id, " +
                "       c.status as comment_status " +
                "from (select target_type, target_id, count(*) as report_count, " +
                "             count(distinct reporter_id) as reporter_count, " +
                "             min(created_at) as first_at, max(created_at) as last_at, " +
                "             min(id) as first_report_id " +
                "      from sy_report where status = ? " +
                "      group by target_type, target_id) g " +
                "left join sy_post p on g.target_type = 'POST' and p.id = g.target_id " +
                "left join sy_post_comment c on g.target_type = 'COMMENT' and c.id = g.target_id " +
                "order by g.reporter_count desc, g.first_at asc " +
                "limit ? offset ?",
                status, limit, offset);
    }

    /** 这一页里的目标各自有哪些举报原因（给「原因」一列用，避免用方言的 group_concat）。 */
    public List<Map<String, Object>> reasonsOf(String status, List<Map<String, Object>> targets) {
        if (targets == null || targets.isEmpty()) return List.of();
        List<Object> args = new ArrayList<>();
        args.add(status);
        StringBuilder where = new StringBuilder();
        for (Map<String, Object> t : targets) {
            if (where.length() > 0) where.append(" or ");
            where.append("(target_type = ? and target_id = ?)");
            args.add(String.valueOf(t.get("target_type")));
            args.add(((Number) t.get("target_id")).longValue());
        }
        return jdbc.queryForList(
                "select target_type, target_id, reason, count(*) as n from sy_report " +
                "where status = ? and (" + where + ") " +
                "group by target_type, target_id, reason order by n desc",
                args.toArray());
    }

    // ==================== 详情 ====================

    public Map<String, Object> findReport(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select r.*, u.name as reporter_name " +
                "from sy_report r left join sy_user u on u.id = r.reporter_id where r.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 同一个目标下的所有举报（处理前看清楚有几个举报人）。 */
    public List<Map<String, Object>> listByTarget(String targetType, long targetId) {
        return jdbc.queryForList(
                "select r.id, r.target_type, r.target_id, r.reporter_id, r.reason, r.detail, " +
                "       r.status, r.action, r.created_at, r.handled_at, u.name as reporter_name " +
                "from sy_report r left join sy_user u on u.id = r.reporter_id " +
                "where r.target_type = ? and r.target_id = ? " +
                "order by r.created_at asc, r.id asc",
                targetType, targetId);
    }

    /** 目标全文：帖子标题+正文，或评论正文（**不过滤 status**，被删的也要能看到是谁发的）。 */
    public Map<String, Object> findTargetRaw(String targetType, long targetId) {
        if ("POST".equals(targetType)) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "select p.id, p.author_id as author, u.name as author_name, p.title, p.body, " +
                    "       p.status, p.created_at " +
                    "from sy_post p left join sy_user u on u.id = p.author_id where p.id = ?", targetId);
            return rows.isEmpty() ? null : rows.get(0);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select c.id, c.user_id as author, u.name as author_name, c.body, c.status, " +
                "       c.post_id, c.created_at " +
                "from sy_post_comment c left join sy_user u on u.id = c.user_id where c.id = ?", targetId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ==================== 处理 ====================

    /** 把该目标下所有 PENDING 举报一次性结案（方案 §3.2：一次处理该目标的全部 PENDING）。 */
    public int resolveTarget(String targetType, long targetId, String newStatus, String action,
                             long handledBy) {
        return jdbc.update(
                "update sy_report set status = ?, action = ?, handled_by = ?, handled_at = ? " +
                "where target_type = ? and target_id = ? and status = 'PENDING'",
                newStatus, action, handledBy, Timestamp.from(Instant.now()), targetType, targetId);
    }

    /**
     * 一键恢复后把该条举报改成 {@code REOPENED}（内容已恢复，举报不再算处理完成）。
     *
     * <p>只对 `ACCEPTED` 生效：PENDING 不会被恢复动作动到（它本来就没处理过），
     * REJECTED 也不该被这条链路改（忽略决定的撤销只改审计行，不碰举报状态）。
     */
    public int reopenReport(long reportId) {
        return jdbc.update("update sy_report set status = 'REOPENED' where id = ? and status = 'ACCEPTED'", reportId);
    }

    // ==================== 统计 ====================

    public long countByStatus(String status) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_report where status = ?", Long.class, status);
        return n == null ? 0 : n;
    }

    /** 今日新增举报数（服务器时区当天 00:00 起）。 */
    public long countCreatedToday() {
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        Timestamp from = Timestamp.valueOf(today.atStartOfDay());
        Long n = jdbc.queryForObject(
                "select count(*) from sy_report where created_at >= ?", Long.class, from);
        return n == null ? 0 : n;
    }

    // ==================== 小工具 ====================

    static Long millis(Object v) {
        if (v == null) return null;
        if (v instanceof Timestamp ts) return ts.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (v instanceof java.util.Date d) return d.getTime();
        if (v instanceof Number n) return n.longValue();
        return null;
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }
}
