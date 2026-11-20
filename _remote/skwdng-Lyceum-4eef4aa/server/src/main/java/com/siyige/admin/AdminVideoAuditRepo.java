package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 视频复核台的**带筛选查询**。
 *
 * <p>为什么不复用 `VideoRepo.auditQueue`：它只有一个 `status + size`，没有标题/作者/日期，
 * 也没有 offset；而 video 包本期不允许改（红线）。所以管理端自己写一条 SQL ——
 * **查询口径和 `auditQueue` 完全一致**（同样的 join、同样的列、同样的默认排序），
 * 只是多几个可选的 where。判定/恢复/日志仍然走 `VideoRepo`，一个字没动。
 */
@Repository
public class AdminVideoAuditRepo {

    private static final char ESC = '!';

    private final JdbcTemplate jdbc;

    public AdminVideoAuditRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static String like(String q) {
        return "%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    /** 队列口径：REVIEW 同时包含 REVIEW 和 PENDING（与 VideoRepo.auditQueue 保持一致）。 */
    private void filters(StringBuilder sql, List<Object> args, String q, String authorId,
                         String status, Timestamp from, Timestamp toExcl) {
        sql.append(" where 1 = 1");
        String st = status == null ? "REVIEW" : status.trim().toUpperCase();
        switch (st) {
            case "ALL" -> { }
            case "REVIEW" -> sql.append(" and v.audit_status in ('REVIEW','PENDING')");
            default -> {
                sql.append(" and v.audit_status = ?");
                args.add(st);
            }
        }
        if (authorId != null && !authorId.isBlank()) {
            sql.append(" and v.user_id = ?");
            args.add(authorId.trim());
        }
        if (from != null) {
            sql.append(" and v.created_at >= ?");
            args.add(from);
        }
        if (toExcl != null) {
            sql.append(" and v.created_at < ?");
            args.add(toExcl);
        }
        if (q != null && !q.isBlank()) {
            // 标题为主，描述也一起搜（标题为空的老数据不至于搜不到）
            sql.append(" and (v.title like ? escape '").append(ESC).append("'")
                    .append(" or v.description like ? escape '").append(ESC).append("')");
            args.add(like(q.trim()));
            args.add(like(q.trim()));
        }
    }

    public long count(String q, String authorId, String status, Timestamp from, Timestamp toExcl) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_video v");
        List<Object> args = new ArrayList<>();
        filters(sql, args, q, authorId, status, from, toExcl);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> list(String q, String authorId, String status,
                                          Timestamp from, Timestamp toExcl, int offset, int limit) {
        StringBuilder sql = new StringBuilder(
                "select v.*, u.name as author from sy_video v left join sy_user u on u.id = v.user_id");
        List<Object> args = new ArrayList<>();
        filters(sql, args, q, authorId, status, from, toExcl);
        sql.append(" order by v.id desc limit ? offset ?");
        args.add(limit);
        args.add(offset);
        return lowerAll(jdbc.queryForList(sql.toString(), args.toArray()));
    }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }

    private static List<Map<String, Object>> lowerAll(List<Map<String, Object>> rows) {
        return rows.stream().map(AdminVideoAuditRepo::lower).toList();
    }
}
