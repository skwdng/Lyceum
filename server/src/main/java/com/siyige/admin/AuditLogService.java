package com.siyige.admin;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 处理记录的读侧：分页列表 + 每行「能不能恢复」的判定。
 *
 * <p>能恢复的充要条件（用户决策 3 / 5）：
 * <ol>
 *   <li>{@code action = REPORT_RESOLVE}（RESTORE 行自己不是"一次处理"，没有反悔可言）</li>
 *   <li>{@code undo_at} 为空（已经撤销过的不再重复撤销）</li>
 *   <li>{@code verdict} 是 {@code DELETE} 或 {@code DELETE_AND_BAN}（只有这两种删过内容）</li>
 * </ol>
 * 所以 {@code IGNORE}（本来就没动内容）与纯 {@code BAN}（只禁言没删内容）**没有可恢复内容**，
 * 前端不显示恢复按钮——这也正是「恢复不解除禁言」的直接体现。
 */
@Service
public class AuditLogService {

    private final AuditLogRepo repo;

    public AuditLogService(AuditLogRepo repo) {
        this.repo = repo;
    }

    public Map<String, Object> page(int page, int size) {
        int p = Math.max(1, page);
        int s = size < 1 ? 20 : Math.min(size, 100);

        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : repo.list(p, s)) {
            items.add(view(row));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", repo.count());
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    /** 行视图：只暴露前端需要的字段，且不含任何敏感信息。 */
    static Map<String, Object> view(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", num(row.get("id")));
        m.put("reportId", num(row.get("report_id")));
        m.put("adminId", num(row.get("admin_id")));
        m.put("adminName", row.get("admin_name"));
        m.put("action", row.get("action"));
        m.put("verdict", row.get("verdict"));
        m.put("targetType", row.get("target_type"));
        Long targetId = row.get("target_id") == null ? null : ((Number) row.get("target_id")).longValue();
        m.put("targetId", targetId);
        m.put("detail", row.get("detail"));
        m.put("ip", row.get("ip"));
        m.put("createdAt", millis(row.get("created_at")));
        m.put("undoAt", millis(row.get("undo_at")));
        m.put("undone", row.get("undo_at") != null);
        m.put("canRestore", canRestore(row));
        return m;
    }

    /**
     * 这一行还能不能点「恢复」。
     *
     * <p>注意：这里**只看记录本身**，不查目标是否还在。目标在恢复那一刻可能已经不存在
     * （作者自己删了 / 别处改过），那种情况由 {@link RestoreService} 返回 409，
     * 让管理员看到"失败"，而不是假装成功（用户决策 4）。
     */
    public static boolean canRestore(Map<String, Object> row) {
        if (row == null) return false;
        if (!AuditLogRepo.ACTION_RESOLVE.equals(row.get("action"))) return false;
        if (row.get("undo_at") != null) return false;
        String verdict = row.get("verdict") == null ? "" : String.valueOf(row.get("verdict"));
        return "DELETE".equals(verdict) || "DELETE_AND_BAN".equals(verdict);
    }

    static long num(Object o) {
        return o == null ? 0L : ((Number) o).longValue();
    }

    static Long millis(Object ts) {
        if (ts == null) return null;
        if (ts instanceof java.sql.Timestamp t) return t.getTime();
        if (ts instanceof java.time.Instant i) return i.toEpochMilli();
        return null;
    }

    /** 该行的动作名（给 detail 文案用）。 */
    static String actionName(String verdict) {
        if (verdict == null) return "";
        return switch (verdict) {
            case "IGNORE" -> "忽略";
            case "DELETE" -> "删除内容";
            case "BAN" -> "禁言";
            case "DELETE_AND_BAN" -> "删除内容并禁言";
            default -> verdict;
        };
    }

    /** 行不存在时抛 404。 */
    Map<String, Object> requireRow(long id) {
        Map<String, Object> row = repo.findById(id);
        if (row == null) throw new IllegalArgumentException("AUDIT_NOT_FOUND: 处理记录不存在");
        return row;
    }
}
