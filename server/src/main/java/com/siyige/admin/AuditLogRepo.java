package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
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

    private final JdbcTemplate jdbc;

    public AuditLogRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 写一条处理记录。调用方（{@link AuditLog}）负责吞掉异常，不让审计影响主流程。 */
    public void insert(long reportId, long adminId, String adminName, String action, String verdict,
                       String targetType, Long targetId, String detail, String ip) {
        jdbc.update("insert into sy_audit_log(report_id, admin_id, admin_name, action, verdict, " +
                        "target_type, target_id, detail, ip) values(?,?,?,?,?,?,?,?,?)",
                reportId, adminId, adminName, action, verdict, targetType, targetId, detail, ip);
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
        Long n = jdbc.queryForObject("select count(*) from sy_audit_log", Long.class);
        return n == null ? 0 : n;
    }

    /** 倒序分页（新的在前）。 */
    public List<Map<String, Object>> list(int page, int size) {
        int offset = (Math.max(1, page) - 1) * size;
        return jdbc.queryForList(
                "select * from sy_audit_log order by created_at desc, id desc limit ? offset ?",
                size, offset);
    }
}
