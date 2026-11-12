package com.siyige.admin;

import com.siyige.community.CommunityRepo;
import com.siyige.community.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 内容管理（帖子 / 评论）的后台服务。
 *
 * <p>**处置动作全部复用既有实现**，这里只负责"校验 + 调用 + 留痕"：
 * <ul>
 *   <li>屏蔽帖子 / 评论 → {@link CommunityRepo#softDeletePost} / {@link CommunityRepo#softDeleteComment}
 *       （与举报处置 DELETE 分支同一套：`status = 2`，且**不动 comment_count**——照抄老口径）；</li>
 *   <li>解除屏蔽 → {@link CommunityRepo#restorePost} / {@link CommunityRepo#restoreComment}；</li>
 *   <li>禁言 → {@link BanService#ban(String, int, String, long)}（1/3/7 天，到期自动解除）；</li>
 *   <li>审计 → {@link AuditLog#recordManual}（`source = MANUAL`、`report_id = 0`、`target_owner = 作者`）。</li>
 * </ul>
 *
 * <p>分页统一：`page` 从 1 开始，`size` 上限 50，越界返回空页（不报错）。
 */
@Service
public class AdminContentService {

    private static final Logger log = LoggerFactory.getLogger(AdminContentService.class);

    static final int SIZE_MAX = 50;
    static final int SIZE_DEFAULT = 20;

    private final AdminContentRepo repo;
    private final CommunityRepo community;
    private final BanService bans;
    private final AuditLog audit;
    private final NotificationService notifications;

    public AdminContentService(AdminContentRepo repo, CommunityRepo community, BanService bans,
                               AuditLog audit, NotificationService notifications) {
        this.repo = repo;
        this.community = community;
        this.bans = bans;
        this.audit = audit;
        this.notifications = notifications;
    }

    // ==================== 帖子 ====================

    public Map<String, Object> posts(String q, String type, Integer status, String authorId,
                                     String from, String to, int page, int size) {
        int[] pg = page(page, size);
        Timestamp fromTs = startOfDay(from);
        Timestamp toTs = startOfDay(to);
        Timestamp toExcl = toTs == null ? null : Timestamp.valueOf(toTs.toLocalDateTime().plusDays(1));

        long total = repo.countPosts(q, type, status, authorId, fromTs, toExcl);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.listPosts(q, type, status, authorId, fromTs, toExcl, pg[2], pg[1]);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) items.add(postView(row));

        return pageOf(items, total, pg[0], pg[1]);
    }

    /** 帖子详情：正文 + 统计 + 作者摘要 + 评论计数（含已屏蔽）。 */
    public Map<String, Object> postDetail(long id) {
        Map<String, Object> row = repo.findPost(id);
        if (row == null) throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("post", postView(row));
        out.put("body", row.get("body"));
        out.put("topicId", row.get("topic_id"));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("comments", num(row.get("comment_count")));
        stats.put("rootComments", repo.countRootComments(id));
        stats.put("likes", num(row.get("like_count")));
        stats.put("views", num(row.get("view_count")));
        out.put("stats", stats);
        out.put("author", authorOf(row));
        return out;
    }

    /**
     * 某帖的全部评论（**含已屏蔽的**，管理端要能看见才能解除）。
     *
     * <p>两层结构：`root_id` 为空的是「楼」，非空的是「楼中楼」，按楼分组返回。
     * 分页按**楼**来分（一页 N 个楼，每个楼带自己的全部回复），这样翻页时不会把一层楼拆散。
     */
    public Map<String, Object> postComments(long id, int page, int size) {
        if (repo.findPost(id) == null) throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在");
        int[] pg = page(page, size);

        long totalRoots = repo.countRootComments(id);
        List<Map<String, Object>> roots = totalRoots == 0
                ? List.of()
                : repo.listRootComments(id, pg[2], pg[1]);

        List<Long> rootIds = new ArrayList<>();
        for (Map<String, Object> r : roots) rootIds.add(num(r.get("id")));
        List<Map<String, Object>> replies = repo.listReplies(rootIds);

        Map<Long, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> r : replies) {
            grouped.computeIfAbsent(num(r.get("root_id")), k -> new ArrayList<>()).add(commentView(r));
        }

        List<Map<String, Object>> items = new ArrayList<>(roots.size());
        for (Map<String, Object> r : roots) {
            Map<String, Object> view = commentView(r);
            view.put("replies", grouped.getOrDefault(num(r.get("id")), List.of()));
            items.add(view);
        }
        return pageOf(items, totalRoots, pg[0], pg[1]);
    }

    // ==================== 评论（跨帖） ====================

    public Map<String, Object> comments(String q, Integer status, String authorId, Long postId,
                                        int page, int size) {
        int[] pg = page(page, size);
        long total = repo.countComments(q, status, authorId, postId);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.listComments(q, status, authorId, postId, pg[2], pg[1]);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) items.add(commentView(row));
        return pageOf(items, total, pg[0], pg[1]);
    }

    // ==================== 处置 ====================

    /** 屏蔽帖子 / 评论（软删 `status = 2` + 写一条 MANUAL 审计）。 */
    public void hide(String type, long id, long adminId, String adminName, String ip, String note) {
        String t = targetType(type);
        Map<String, Object> row = repo.findContent(t, id);
        if (row == null) throw new IllegalArgumentException(t + "_NOT_FOUND: 内容不存在");

        int status = (int) num(row.get("status"));
        if (status == 2) throw new IllegalArgumentException("ALREADY_HIDDEN: 内容已经是屏蔽状态");

        int n = "POST".equals(t) ? community.softDeletePost(id) : community.softDeleteComment(id);
        if (n == 0) throw new IllegalArgumentException("ALREADY_HIDDEN: 内容已经是屏蔽状态");

        String author = str(row.get("author_id"));
        // 与举报处置 DELETE 分支一致：作者会收到「被管理员删除 + 理由」
        notifications.onContentDeleted(t, id, author, note);

        audit.recordManual(adminId, adminName, "DELETE", t, id, author,
                "从内容管理屏蔽" + ("POST".equals(t) ? "帖子 #" : "评论 #") + id
                        + (note == null || note.isBlank() ? "" : "，理由：" + note.trim()), ip);
        log.info("内容管理屏蔽 target={}#{} author={} by={}", t, id, author, adminId);
    }

    /** 解除屏蔽（`status = 1` + 写一条 MANUAL 的 RESTORE 审计）。 */
    public void unhide(String type, long id, long adminId, String adminName, String ip) {
        String t = targetType(type);
        Map<String, Object> row = repo.findContent(t, id);
        if (row == null) throw new IllegalArgumentException(t + "_NOT_FOUND: 内容不存在");
        if ((int) num(row.get("status")) == 1) {
            throw new IllegalArgumentException("NOT_HIDDEN: 内容当前是可正常访问状态");
        }

        int n = "POST".equals(t) ? community.restorePost(id) : community.restoreComment(id);
        if (n == 0) throw new IllegalArgumentException("NOT_HIDDEN: 内容当前是可正常访问状态");

        audit.recordManualRestore(adminId, adminName, t, id, str(row.get("author_id")),
                "解除屏蔽" + ("POST".equals(t) ? "帖子 #" : "评论 #") + id, ip);
        log.info("内容管理解除屏蔽 target={}#{} by={}", t, id, adminId);
    }

    /**
     * 禁言（社区）。
     *
     * <p>和用户管理页那个 `/ban` 的区别只有一个：**这里写审计**，这样处理记录页能统一看到。
     * 天数与原因校验仍在 {@link BanService} 里（1/3/7 天、原因 ≤200 字），这里不重复实现。
     *
     * @return 禁言到期时间
     */
    public Timestamp mute(String userId, Integer days, String reason, long adminId, String adminName, String ip) {
        if (repo.userBrief(userId) == null) throw new IllegalArgumentException("USER_NOT_FOUND: 用户不存在");
        int d = days == null ? 0 : days;
        Timestamp until = bans.ban(userId, d, reason, adminId);   // BanService 内部校验 1/3/7

        audit.recordManual(adminId, adminName, "BAN", "USER", null, userId,
                "从内容管理禁言 " + d + " 天（至 " + until.toLocalDateTime().toLocalDate() + "）"
                        + (reason == null || reason.isBlank() ? "" : "，理由：" + reason.trim()), ip);
        return until;
    }

    // ==================== 视图与工具 ====================

    private static Map<String, Object> postView(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", num(row.get("id")));
        m.put("type", str(row.get("type")));
        m.put("title", str(row.get("title")));
        m.put("excerpt", str(row.get("excerpt")));
        m.put("status", (int) num(row.get("status")));
        m.put("hidden", num(row.get("status")) != 1);
        m.put("authorId", str(row.get("author_id")));
        m.put("authorName", str(row.get("author_name")));
        m.put("comments", num(row.get("comment_count")));
        m.put("likes", num(row.get("like_count")));
        m.put("views", num(row.get("view_count")));
        m.put("createdAt", millis(row.get("created_at")));
        return m;
    }

    private static Map<String, Object> commentView(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", num(row.get("id")));
        m.put("postId", num(row.get("post_id")));
        m.put("postTitle", str(row.get("post_title")));
        m.put("rootId", row.get("root_id") == null ? null : num(row.get("root_id")));
        m.put("floor", row.get("root_id") == null ? "楼" : "楼中楼");
        m.put("body", str(row.get("body")));
        m.put("status", (int) num(row.get("status")));
        m.put("hidden", num(row.get("status")) != 1);
        m.put("authorId", str(row.get("user_id")));
        m.put("authorName", str(row.get("author_name")));
        m.put("createdAt", millis(row.get("created_at")));
        return m;
    }

    private static Map<String, Object> authorOf(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", str(row.get("author_id")));
        m.put("name", str(row.get("author_name")));
        m.put("status", row.get("author_status") == null ? null : (int) num(row.get("author_status")));
        return m;
    }

    private static Map<String, Object> pageOf(List<Map<String, Object>> items, long total, int page, int size) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", page);
        out.put("size", size);
        return out;
    }

    /** page 从 1 开始；size 上限 50；越界的 page 返回空页（offset 超出范围时 SQL 本来就返回空）。 */
    static int[] page(int page, int size) {
        int p = Math.max(1, page);
        int s = size <= 0 ? SIZE_DEFAULT : Math.min(size, SIZE_MAX);
        return new int[]{p, s, (p - 1) * s};
    }

    static String targetType(String type) {
        String t = type == null ? "" : type.trim().toUpperCase();
        if ("POST".equals(t) || "COMMENT".equals(t)) return t;
        throw new IllegalArgumentException("INVALID_TYPE: type 只能是 post 或 comment");
    }

    private static Timestamp startOfDay(String yyyyMMdd) {
        if (yyyyMMdd == null || yyyyMMdd.isBlank()) return null;
        try {
            return Timestamp.valueOf(LocalDateTime.of(LocalDate.parse(yyyyMMdd.trim()), LocalTime.MIN));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("INVALID_PARAM: 日期格式应为 yyyy-MM-dd");
        }
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long millis(Object ts) {
        if (ts == null) return null;
        if (ts instanceof Timestamp t) return t.getTime();
        if (ts instanceof java.time.Instant i) return i.toEpochMilli();
        return null;
    }
}
