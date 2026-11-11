package com.siyige.community;

import com.siyige.admin.analytics.Active;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.siyige.community.ai.AiQueue;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 社区帖子业务规则（SPEC-v4.2 §18 R-COM-01~14、R-COM-39）。
 * 本轮只做帖子：列表 / 详情 / 发布 / 编辑 / 软删除 + 作者权限。
 */
@Service
public class CommunityService {

    private static final Logger log = LoggerFactory.getLogger(CommunityService.class);

    private static final Set<String> TYPES = Set.of("CHAT", "GUIDE", "HELP");
    private static final Set<String> SORTS = Set.of("NEW", "COMMENTS", "LIKES", "HOT");
    private static final Set<String> RANGES = Set.of("ALL", "3D", "7D", "OLDER");

    private static final int TITLE_MAX = 120;
    private static final int BODY_MAX = 200_000;

    private final CommunityRepo repo;

    /** R-COM-39（改版）：命中敏感词不拒绝，逐码点替换成全角＊后落库，不保存原文。 */
    private final SensitiveWordMasker masker;

    /** 读路径要把「尚未回写」的浏览增量叠加上去，否则刚看完刷新数字不动。 */
    private final CommunityViewService views;
    /** 禁言校验：放在 Service 入口，发帖/编辑前查一次（不加缓存）。 */
    private final MuteGuard muteGuard;
    /** 发帖正文里的 @ 提及要发通知（V2）。 */
    private final NotificationService notifications;
    /** 发帖正文里 @DeepSeek 时把任务丢进 AI 队列（V1 新增，commentId 传 null）。 */
    private final AiQueue aiQueue;

    public CommunityService(CommunityRepo repo, SensitiveWordMasker masker, CommunityViewService views,
                            MuteGuard muteGuard, NotificationService notifications, AiQueue aiQueue) {
        this.repo = repo;
        this.masker = masker;
        this.views = views;
        this.muteGuard = muteGuard;
        this.notifications = notifications;
        this.aiQueue = aiQueue;
    }

    // ==================== 读 ====================

    /** 列表：类型 / 标题模糊 / 关联辩题 / 日期范围 四个筛选可任意组合，再按四种排序分页。 */
    public Map<String, Object> list(String type, String title, String topicId, String range,
                                    String sort, int page, int size, String userId) {
        String t = enumOrNull(type, TYPES, "INVALID_PARAM: 非法的 type");
        String r = enumOrDefault(range, RANGES, "ALL");
        String s = enumOrDefault(sort, SORTS, "NEW");
        String kw = trimToNull(title);
        String topic = trimToNull(topicId);
        int p = Math.max(1, page);
        int sz = Math.min(50, Math.max(1, size));

        long total = repo.countPosts(t, kw, topic, r);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.listPosts(t, kw, topic, r, s, (p - 1) * sz, sz);

        List<Long> ids = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) ids.add(num(row.get("id")));
        // R-COM-29：liked 一次批量查询
        Set<Long> liked = repo.likedPostIds(userId, ids);
        // 浏览数读时叠加：整页只查一次 Redis（严禁在循环里逐条查）
        Map<Long, Long> pendingViews = ids.isEmpty() ? Map.of() : views.pendingCounts(ids);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            long id = num(row.get("id"));
            items.add(toItem(row, liked.contains(id), pendingViews));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        return out;
    }

    /** 详情：正文 + 关联辩题标题（R-COM-02 列表与详情都要显示）。 */
    public Map<String, Object> detail(long id, String userId) {
        Map<String, Object> row = repo.findPost(id);
        if (row == null) throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在或已删除");

        // 浏览数读时叠加：详情只查这一个 id
        Map<Long, Long> pendingViews = views.pendingCounts(List.of(id));
        Map<String, Object> out = toItem(row, repo.likedPostIds(userId, List.of(id)).contains(id), pendingViews);
        out.put("body", row.get("body"));
        out.put("updatedAt", millis(row.get("updated_at")));
        return out;
    }

    // ==================== 写 ====================

    /**
     * R-COM-01：类型 / 标题 / 正文三必填；R-COM-02 topicId 可空。
     *
     * <p>身份与昵称都来自登录态：{@code userId} 由 {@code UserContext.require()} 取得，
     * 昵称由 {@code sy_user.name} 经 {@code left join} 展示——**不再**从请求体接收昵称，
     * 也不再 upsert 用户行（账号由 auth 模块创建，社区只引用）。
     */
    @Active
    public Map<String, Object> create(String userId, Map<String, Object> body) {
        muteGuard.assertNotMuted(userId);          // 被禁言不能发帖
        String type = requireType(body.get("type"));
        String title = requireText(body.get("title"), "INVALID_PARAM: 标题不能为空", TITLE_MAX);
        String text = requireText(body.get("body"), "INVALID_PARAM: 正文不能为空", BODY_MAX);
        String topicId = trimToNull(body.get("topicId"));
        String uid = userId;

        // R-COM-39：标题、正文分别检查、分别替换，不拼在一起；只落库替换后的文本
        SensitiveWordMasker.MaskResult maskedTitle = masker.mask(title);
        SensitiveWordMasker.MaskResult maskedBody = masker.mask(text);
        if (maskedTitle.hits() > 0 || maskedBody.hits() > 0) {
            log.info("社区打码 userId={} scene=create titleHits={} bodyHits={}",
                    uid, maskedTitle.hits(), maskedBody.hits());
        }

        // 摘要必须基于「替换后的正文」生成
        long id = repo.insertPost(uid, type, maskedTitle.text(), maskedBody.text(),
                Excerpts.of(maskedBody.text()), topicId,
                hotScore(0, 0, 0, Instant.now().toEpochMilli()));

        // 通知：发帖正文里 @ 了谁（commentId 传 null，link 就只到帖子）
        notifications.onMentions(id, null, uid, body.get("mentions"), text);
        // 社区 AI：发帖正文里 @DeepSeek -> 入队，AI 回来时在这个帖子下回一条楼（决策 3）
        aiQueue.maybeEnqueue(id, null, uid, null, text, body.get("mentions"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("postId", id);
        return out;
    }

    /** R-COM-07：只有作者本人可编辑；PATCH 语义，只改传了的字段。 */
    public Map<String, Object> update(String userId, long id, Map<String, Object> body) {
        muteGuard.assertNotMuted(userId);          // 编辑也是继续产出公开内容，一并拦
        Map<String, Object> row = requireOwnPost(userId, id);

        // 先合出「最终 title / 最终 body」：PATCH 只传一个时，另一个取库里的旧值，
        // 保证标题命中也一定会被检查到，而不是只检查正文
        String finalTitle = body.containsKey("title")
                ? requireText(body.get("title"), "INVALID_PARAM: 标题不能为空", TITLE_MAX)
                : String.valueOf(row.get("title"));
        String finalBody = body.containsKey("body")
                ? requireText(body.get("body"), "INVALID_PARAM: 正文不能为空", BODY_MAX)
                : String.valueOf(row.get("body"));

        SensitiveWordMasker.MaskResult maskedTitle = masker.mask(finalTitle);
        SensitiveWordMasker.MaskResult maskedBody = masker.mask(finalBody);
        if (maskedTitle.hits() > 0 || maskedBody.hits() > 0) {
            log.info("社区打码 userId={} scene=update postId={} titleHits={} bodyHits={}",
                    userId, id, maskedTitle.hits(), maskedBody.hits());
        }

        Map<String, Object> fields = new LinkedHashMap<>();
        if (body.containsKey("type")) fields.put("type", requireType(body.get("type")));
        if (body.containsKey("title")) fields.put("title", maskedTitle.text());
        if (body.containsKey("body")) {
            fields.put("body", maskedBody.text());
            // 只有正文变化才重算摘要；只改标题不重算
            fields.put("excerpt", Excerpts.of(maskedBody.text()));
        }
        // topicId 传 null / 空串 = 解绑关联辩题
        if (body.containsKey("topicId")) fields.put("topicId", trimToNull(body.get("topicId")));
        if (fields.isEmpty()) throw new IllegalArgumentException("INVALID_PARAM: 没有需要更新的字段");

        fields.put("hotScore", hotScore(num(row.get("comment_count")), num(row.get("like_count")),
                num(row.get("view_count")), millis(row.get("created_at"))));
        repo.updatePost(id, fields);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("postId", id);
        return out;
    }

    /** R-COM-07：软删除（status = 2），其下评论一并不可见由后续评论接口按 post.status 过滤。 */
    public void delete(String userId, long id) {
        requireOwnPost(userId, id);
        repo.softDeletePost(id);
    }

    // ==================== 内部 ====================

    private Map<String, Object> requireOwnPost(String userId, long id) {
        Map<String, Object> row = repo.row(id);
        if (row == null || num(row.get("status")) != 1) {
            throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在或已删除");
        }
        if (userId == null || !userId.equals(String.valueOf(row.get("author_id")))) {
            throw new IllegalArgumentException("NOT_AUTHOR: 只有作者本人可以操作");
        }
        return row;
    }

    /**
     * 行 -> 出参 item。
     *
     * <p>浏览数 = 数据库 view_count + 尚未回写的 Redis 增量（{@code pendingViews}）。
     * 这样"刚看完再刷新"就能看到数字变化，不必等 5 分钟回写；回写完成后增量归零、
     * 数据库值补上，总数保持连续，不会出现跳变或倒退。
     *
     * <p>注意：这里只影响 {@code viewCount} 出参；{@code hot_score} 仍按数据库的
     * view_count 计算（R-COM-13 的口径不变）。
     */
    private Map<String, Object> toItem(Map<String, Object> row, boolean liked, Map<Long, Long> pendingViews) {
        long id = num(row.get("id"));
        long pending = pendingViews == null ? 0L : Math.max(0L, pendingViews.getOrDefault(id, 0L));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("type", row.get("type"));
        m.put("title", row.get("title"));
        m.put("excerpt", row.get("excerpt"));
        m.put("topicId", row.get("topic_id"));
        m.put("topicTitle", row.get("topic_title"));     // R-COM-02
        m.put("authorId", row.get("author_id"));
        m.put("authorName", row.get("author_name"));     // R-COM-03 只给昵称
        m.put("commentCount", num(row.get("comment_count")));
        m.put("likeCount", num(row.get("like_count")));
        m.put("viewCount", num(row.get("view_count")) + pending);
        m.put("liked", liked);
        m.put("lastCommentAt", millis(row.get("last_comment_at")));
        m.put("createdAt", millis(row.get("created_at")));
        return m;
    }

    /** R-COM-13：hot_score = (评论*4 + 点赞*2 + 浏览*0.05) / POW(小时数+2, 1.5) */
    static double hotScore(long comments, long likes, long views, Long createdAtMillis) {
        double base = createdAtMillis == null ? System.currentTimeMillis() : createdAtMillis;
        double hours = Math.max(0, (System.currentTimeMillis() - base) / 3_600_000.0);
        return (comments * 4 + likes * 2 + views * 0.05) / Math.pow(hours + 2, 1.5);
    }

    private String requireType(Object value) {
        String t = trimToNull(value);
        if (t == null || !TYPES.contains(t)) {
            throw new IllegalArgumentException("INVALID_PARAM: type 只能是 CHAT / GUIDE / HELP");
        }
        return t;
    }

    private String requireText(Object value, String code, int max) {
        String s = trimToNull(value);
        if (s == null) throw new IllegalArgumentException(code);
        if (s.length() > max) throw new IllegalArgumentException("INVALID_PARAM: 内容超过 " + max + " 字");
        return s;
    }

    private String enumOrNull(String value, Set<String> allowed, String code) {
        String v = trimToNull(value);
        if (v == null) return null;
        String up = v.toUpperCase();
        if (!allowed.contains(up)) throw new IllegalArgumentException(code);
        return up;
    }

    private String enumOrDefault(String value, Set<String> allowed, String fallback) {
        String v = trimToNull(value);
        if (v == null) return fallback;
        String up = v.toUpperCase();
        return allowed.contains(up) ? up : fallback;
    }

    static String trimToNull(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    static long num(Object value) {
        if (value instanceof Number n) return n.longValue();
        if (value == null) return 0;
        try { return Long.parseLong(String.valueOf(value)); } catch (NumberFormatException e) { return 0; }
    }

    static Long millis(Object value) {
        if (value == null) return null;
        if (value instanceof Timestamp t) return t.getTime();
        if (value instanceof Date d) return d.getTime();
        // MySQL Connector/J 8 对 DATETIME 返回 LocalDateTime
        if (value instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (value instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (value instanceof java.time.LocalDate ld) {
            return ld.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (value instanceof Number n) return n.longValue();
        return null;
    }

    /** 供测试/调试：当前用户对某帖是否点过赞（本轮未开放点赞接口，保留读取口径）。 */
    public boolean liked(String userId, long postId) {
        return repo.likedPostIds(userId, List.of(postId)).contains(postId);
    }

    public Collection<String> types() { return TYPES; }
}
