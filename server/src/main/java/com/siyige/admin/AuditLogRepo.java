package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 处理记录（`sy_audit_log`）的读写。
 *
 * <p>表里只会有两种 `action`：{@link #ACTION_RESOLVE} / {@link #ACTION_RESTORE}。
 * 这里**只存业务描述**，绝不允许出现密码、令牌或任何凭据。
 */
@Repository
public class AuditLogRepo {

    public static final String ACTION_RESOLVE = "REPORT_RESOLVE";
    public static final String ACTION_RESTORE = "RESTORE";

    /** 来源：举报处理（默认）/ 管理员从内容管理直接处置。 */
    public static final String SOURCE_REPORT = "REPORT";
    public static final String SOURCE_MANUAL = "MANUAL";

    /**
     * 管理员主动处置时的 `report_id`。
     *
     * <p>列是 `not null`，而"从内容管理直接屏蔽"没有举报来源，所以约定用 0 表示"非举报来源"。
     * {@link RestoreService} 见到 `report_id <= 0` 会跳过"把关联举报改回 REOPENED"那一步。
     */
    public static final long MANUAL_REPORT_ID = 0L;

    private final JdbcTemplate jdbc;

    public AuditLogRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 写一条处理记录。调用方（{@link AuditLog}）负责吞掉异常，不让审计影响主流程。 */
    public void insert(long reportId, long adminId, String adminName, String action, String verdict,
                       String targetType, Long targetId, String detail, String ip) {
        insert(reportId, adminId, adminName, action, verdict, targetType, targetId, detail, ip,
                SOURCE_REPORT, null);
    }

    /**
     * 写一条处理记录（带来源与内容作者）。
     *
     * @param source       {@link #SOURCE_REPORT} / {@link #SOURCE_MANUAL}
     * @param targetOwner  内容作者的用户 id（用户浮窗按人查违规历史用）；禁言这类"目标是用户"的记录也填它
     */
    public void insert(long reportId, long adminId, String adminName, String action, String verdict,
                       String targetType, Long targetId, String detail, String ip,
                       String source, String targetOwner) {
        jdbc.update("insert into sy_audit_log(report_id, admin_id, admin_name, action, verdict, " +
                        "target_type, target_id, detail, ip, source, target_owner) values(?,?,?,?,?,?,?,?,?,?,?)",
                reportId, adminId, adminName, action, verdict, targetType, targetId, detail, ip,
                source == null ? SOURCE_REPORT : source, targetOwner);
    }

    /** 标记已撤销（哪一次处理在什么时候被谁撤销）。 */
    public int markUndone(long id, long undoBy) {
        return jdbc.update("update sy_audit_log set undo_at = ?, undo_by = ? where id = ? and undo_at is null",
                Timestamp.from(Instant.now()), undoBy, id);
    }

    /**
     * 取一行。
     *
     * <p><b>不要</b>把返回值再包一层 {@code new LinkedHashMap<>(...)}：Spring 的
     * {@code queryForList} 返回的是**忽略大小写**的 map，包成普通 LinkedHashMap 后
     * H2 给出的 `VERDICT` 键就查不到小写的 `verdict`，表现是"读到的字段全是 null"。
     */
    public Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_audit_log where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public long count() {
        return count(null, null, null, null, null, null, null, null);
    }

    /**
     * 带筛选的计数。
     *
     * <p>参数语义（全部可空）：`q` 关键词（详情/管理员账号/内容作者，模糊）、
     * `admin` 操作人（纯数字按 admin_id 精确，否则按 admin_name 模糊）、
     * `action` / `verdict` / `targetType` / `source` 精确匹配（大写），
     * `from` / `toExcl` 时间左闭右开。
     */
    public long count(String q, String admin, String action, String verdict, String targetType,
                      String source, Timestamp from, Timestamp toExcl) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_audit_log");
        List<Object> args = new ArrayList<>();
        appendFilters(sql, args, q, admin, action, verdict, targetType, source, from, toExcl);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** 倒序分页（新的在前）。 */
    public List<Map<String, Object>> list(int page, int size) {
        return list(null, null, null, null, null, null, null, null, page, size);
    }

    public List<Map<String, Object>> list(String q, String admin, String action, String verdict, String targetType,
                                          String source, Timestamp from, Timestamp toExcl, int page, int size) {
        int offset = (Math.max(1, page) - 1) * size;
        StringBuilder sql = new StringBuilder("select * from sy_audit_log");
        List<Object> args = new ArrayList<>();
        appendFilters(sql, args, q, admin, action, verdict, targetType, source, from, toExcl);
        sql.append(" order by created_at desc, id desc limit ? offset ?");
        args.add(size);
        args.add(offset);
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    private void appendFilters(StringBuilder sql, List<Object> args, String q, String admin, String action,
                               String verdict, String targetType, String source,
                               Timestamp from, Timestamp toExcl) {
        sql.append(" where 1 = 1");
        if (from != null) {
            sql.append(" and created_at >= ?");
            args.add(from);
        }
        if (toExcl != null) {
            sql.append(" and created_at < ?");
            args.add(toExcl);
        }
        if (admin != null && !admin.isBlank()) {
            String a = admin.trim();
            if (a.matches("\\d+")) {
                sql.append(" and admin_id = ?");
                args.add(Long.parseLong(a));
            } else {
                sql.append(" and admin_name like ? escape '!'");
                args.add("%" + a.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
            }
        }
        if (action != null && !action.isBlank()) {
            sql.append(" and action = ?");
            args.add(action.trim().toUpperCase());
        }
        if (verdict != null && !verdict.isBlank()) {
            sql.append(" and verdict = ?");
            args.add(verdict.trim().toUpperCase());
        }
        if (targetType != null && !targetType.isBlank()) {
            sql.append(" and target_type = ?");
            args.add(targetType.trim().toUpperCase());
        }
        if (source != null && !source.isBlank()) {
            sql.append(" and coalesce(source, 'REPORT') = ?");
            args.add(source.trim().toUpperCase());
        }
        if (q != null && !q.isBlank()) {
            String like = "%" + q.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            sql.append(" and (detail like ? escape '!' or admin_name like ? escape '!'"
                    + " or target_owner like ? escape '!')");
            args.add(like);
            args.add(like);
            args.add(like);
        }
    }
}
