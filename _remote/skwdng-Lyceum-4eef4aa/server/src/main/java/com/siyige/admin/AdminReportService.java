package com.siyige.admin;

import com.siyige.auth.AuthException;
import com.siyige.community.CommentService;
import com.siyige.community.CommunityRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 管理端举报处理：聚合队列 / 详情 / 处理。
 *
 * <p>处理动作三种，可组合（方案 D4 + schema 里的 DELETE_AND_BAN）：
 * <ul>
 *   <li>{@code IGNORE} —— 举报不成立，该目标下所有 PENDING 变 <b>REJECTED</b></li>
 *   <li>{@code DELETE} —— 软删内容，变 ACCEPTED</li>
 *   <li>{@code BAN} —— 社区禁言 N 天，变 ACCEPTED</li>
 *   <li>{@code DELETE_AND_BAN} —— 两者都做</li>
 * </ul>
 *
 * <p><b>目标是已删除的帖/评论时不出错</b>：删的步骤跳过、禁言跳过（拿不到作者就跳过），
 * 仍然把举报结案（方案 §7 第 8 条与安全要求）。
 */
@Service
public class AdminReportService {

    private static final Logger log = LoggerFactory.getLogger(AdminReportService.class);

    /** 处理动作白名单。 */
    static final Set<String> ACTIONS = Set.of("IGNORE", "DELETE", "BAN", "DELETE_AND_BAN");
    /** 举报状态白名单。 */
    static final Set<String> STATUSES = Set.of("PENDING", "ACCEPTED", "REJECTED", "REOPENED");

    private static final int PAGE_SIZE_DEFAULT = 20;
    private static final int PAGE_SIZE_MAX = 50;
    /** 多少个人举报算「多人举报」（方案 D7）。 */
    static final int MULTI_REPORT_THRESHOLD = 3;

    private final AdminReportRepo repo;
    private final CommunityRepo community;
    private final BanService bans;
    /** 处理记录写入门面（内部已 try/catch，审计失败不影响处理结果）。 */
    private final AuditLog audit;
    /** 删内容要给作者发通知（决策 5）。 */
    private final com.siyige.community.NotificationService notifications;
    /** 删评论后重算帖子评论数（复用社区既有实现）。 */
    private final CommentService comments;

    public AdminReportService(AdminReportRepo repo, CommunityRepo community, BanService bans, AuditLog audit,
                              com.siyige.community.NotificationService notifications, CommentService comments) {
        this.repo = repo;
        this.community = community;
        this.bans = bans;
        this.audit = audit;
        this.notifications = notifications;
        this.comments = comments;
    }

    // ==================== 队列 ====================

    public Map<String, Object> queue(String status, int page, int size) {
        String st = normalizeStatus(status);
        int p = Math.max(1, page);
        int s = Math.min(PAGE_SIZE_MAX, Math.max(1, size <= 0 ? PAGE_SIZE_DEFAULT : size));

        long total = repo.countGroups(st);
        List<Map<String, Object>> groups = repo.listGroups(st, (p - 1) * s, s);

        // 这一页的目标各自有哪些原因（一次查询搞定，避免每行一次）
        Map<String, List<String>> reasons = new LinkedHashMap<>();
        for (Map<String, Object> r : repo.reasonsOf(st, groups)) {
            String key = r.get("target_type") + "#" + ((Number) r.get("target_id")).longValue();
            reasons.computeIfAbsent(key, k -> new ArrayList<>()).add(String.valueOf(r.get("reason")));
        }

        List<Map<String, Object>> items = new ArrayList<>(groups.size());
        for (Map<String, Object> g : groups) {
            String targetType = String.valueOf(g.get("target_type"));
            long targetId = ((Number) g.get("target_id")).longValue();
            long reporterCount = ((Number) g.get("reporter_count")).longValue();

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("targetType", targetType);
            m.put("targetId", targetId);
            m.put("reportCount", ((Number) g.get("report_count")).longValue());
            m.put("reporterCount", reporterCount);
            m.put("multiReport", reporterCount >= MULTI_REPORT_THRESHOLD);
            m.put("reasons", reasons.getOrDefault(targetType + "#" + targetId, List.of()));
            m.put("firstReportId", ((Number) g.get("first_report_id")).longValue());
            m.put("firstAt", AdminReportRepo.millis(g.get("first_at")));
            m.put("lastAt", AdminReportRepo.millis(g.get("last_at")));

            Object rawStatus = "POST".equals(targetType) ? g.get("post_status") : g.get("comment_status");
            boolean exists = rawStatus != null && ((Number) rawStatus).intValue() == 1;
            m.put("targetExists", exists);
            m.put("targetSummary", summary(targetType, g));
            m.put("targetAuthor", "POST".equals(targetType) ? g.get("post_author") : g.get("comment_author"));
            if ("COMMENT".equals(targetType)) m.put("postId", g.get("comment_post_id"));
            items.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    // ==================== 详情 ====================

    public Map<String, Object> detail(long reportId) {
        Map<String, Object> report = repo.findReport(reportId);
        if (report == null) throw new IllegalArgumentException("REPORT_NOT_FOUND: 举报不存在");

        String targetType = String.valueOf(report.get("target_type"));
        long targetId = ((Number) report.get("target_id")).longValue();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("report", reportView(report));

        Map<String, Object> raw = repo.findTargetRaw(targetType, targetId);
        out.put("target", targetView(targetType, targetId, raw));

        List<Map<String, Object>> same = new ArrayList<>();
        for (Map<String, Object> r : repo.listByTarget(targetType, targetId)) {
            same.add(reportView(r));
        }
        out.put("reports", same);
        return out;
    }

    // ==================== 处理 ====================

    public void resolve(long reportId, AdminDtos.ResolveRequest req, long adminId,
                        String adminName, String ip) {
        if (req == null) throw AuthException.invalidParam("请求体不能为空");

        String action = req.action() == null ? "" : req.action().trim().toUpperCase();
        if (!ACTIONS.contains(action)) {
            throw AuthException.invalidParam("action 只能是 IGNORE / DELETE / BAN / DELETE_AND_BAN");
        }
        boolean delete = action.contains("DELETE");
        boolean ban = action.contains("BAN");
        if (ban && !isAllowedDays(req.banDays())) {
            throw AuthException.invalidParam("禁言时 banDays 必填，且只能是 1 / 3 / 7");
        }
        String note = req.note() == null ? null : req.note().trim();
        if (note != null && note.length() > 200) {
            throw AuthException.invalidParam("处理备注最多 200 字");
        }
        if (note != null && note.isEmpty()) note = null;

        Map<String, Object> report = repo.findReport(reportId);
        if (report == null) throw new IllegalArgumentException("REPORT_NOT_FOUND: 举报不存在");

        String targetType = String.valueOf(report.get("target_type"));
        long targetId = ((Number) report.get("target_id")).longValue();

        Map<String, Object> raw = repo.findTargetRaw(targetType, targetId);
        String author = raw == null ? null : str(raw.get("author"));
        boolean stillActive = raw != null && num(raw.get("status")) == 1;

        // 1) 删除内容
        if (delete) {
            if (stillActive) {
                if ("POST".equals(targetType)) {
                    community.softDeletePost(targetId);
                } else {
                    community.softDeleteComment(targetId);
                    // 评论被删后要重算帖子评论数（软删只改 status，不碰 comment_count）——
                    // 与内容管理屏蔽评论同款处理，否则举报处置删评论后帖子上的评论数会虚高
                    if (raw.get("post_id") != null) comments.refreshPostStats(num(raw.get("post_id")));
                }
                log.info("管理员删除内容 target={}#{} by={}", targetType, targetId, adminId);
                // 通知：内容作者会收到「被管理员删除 + 理由」（决策 5；作者自己删自己的不发）
                notifications.onContentDeleted(targetType, targetId, author, note);
            } else {
                log.info("目标已不存在，跳过删除 target={}#{}", targetType, targetId);
            }
        }

        // 2) 禁言（目标没了就拿不到作者，跳过但不算失败）
        if (ban) {
            if (author != null) {
                bans.ban(author, req.banDays(), note, adminId, reportId);
            } else {
                log.info("目标已不存在且取不到作者，跳过禁言 target={}#{}", targetType, targetId);
            }
        }

        // 3) 结案：一次处理该目标的全部 PENDING
        String newStatus = "IGNORE".equals(action) ? "REJECTED" : "ACCEPTED";
        int n = repo.resolveTarget(targetType, targetId, newStatus, action, adminId);
        log.info("举报结案 target={}#{} action={} status={} 影响 {} 条 by={}",
                targetType, targetId, action, newStatus, n, adminId);

        // 4) 留痕：只记"谁对被举报内容做了什么"，绝不放任何凭据。
        //    写失败由 AuditLog 内部吞掉 + warn，不影响上面已经生效的处理。
        audit.recordResolve(reportId, adminId, adminName, action, targetType, targetId,
                auditDetail(action, req.banDays(), note), ip);
    }

    /** 处理记录里那句人读描述，例如「删除内容 + 禁言 7 天，理由：广告」。 */
    static String auditDetail(String action, Integer banDays, String note) {
        String base = switch (action) {
            case "IGNORE" -> "忽略举报（内容保留）";
            case "DELETE" -> "删除内容";
            case "BAN" -> "禁言 " + banDays + " 天";
            case "DELETE_AND_BAN" -> "删除内容 + 禁言 " + banDays + " 天";
            default -> action;
        };
        return note == null || note.isBlank() ? base : base + "，理由：" + note;
    }

    // ==================== 视图拼装 ====================

    private static Map<String, Object> reportView(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reportId", num(row.get("id")));
        m.put("targetType", row.get("target_type"));
        m.put("targetId", num(row.get("target_id")));
        m.put("reporterId", row.get("reporter_id"));
        m.put("reporterName", row.get("reporter_name"));
        m.put("reason", row.get("reason"));
        m.put("detail", row.get("detail"));
        m.put("status", row.get("status"));
        m.put("action", row.get("action"));
        m.put("createdAt", AdminReportRepo.millis(row.get("created_at")));
        m.put("handledAt", AdminReportRepo.millis(row.get("handled_at")));
        return m;
    }

    private static Map<String, Object> targetView(String targetType, long targetId, Map<String, Object> raw) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("targetType", targetType);
        m.put("targetId", targetId);
        if (raw == null) {
            m.put("exists", false);
            m.put("deleted", true);
            return m;
        }
        int status = (int) num(raw.get("status"));
        m.put("exists", status == 1);
        m.put("deleted", status != 1);
        m.put("author", raw.get("author"));
        m.put("authorName", raw.get("author_name"));
        m.put("createdAt", AdminReportRepo.millis(raw.get("created_at")));
        if ("POST".equals(targetType)) {
            m.put("title", raw.get("title"));
            m.put("body", raw.get("body"));
        } else {
            m.put("body", raw.get("body"));
            m.put("postId", raw.get("post_id"));
        }
        return m;
    }

    private static String summary(String targetType, Map<String, Object> row) {
        Object v = "POST".equals(targetType) ? row.get("post_title") : row.get("comment_body");
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.length() <= 60 ? s : s.substring(0, 60) + "…";
    }

    // ==================== 小工具 ====================

    private static String normalizeStatus(String status) {
        if (status == null || status.isBlank()) return "PENDING";
        String s = status.trim().toUpperCase();
        if (!STATUSES.contains(s)) {
            throw AuthException.invalidParam("status 只能是 PENDING / ACCEPTED / REJECTED / REOPENED");
        }
        return s;
    }

    private static boolean isAllowedDays(Integer days) {
        if (days == null) return false;
        for (int d : BanService.ALLOWED_DAYS) if (d == days) return true;
        return false;
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
