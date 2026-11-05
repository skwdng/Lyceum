package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.siyige.community.ai.AiAccount;
import com.siyige.community.ai.AiQueue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 社区评论（SPEC-v4.2 §18.3 R-COM-15~24）：只有两层——楼（root_id = NULL）与楼中楼。
 *
 * <ul>
 *   <li>R-COM-15/18：回复楼中楼时，root_id 仍指向所属楼，永不产生第三层；</li>
 *   <li>R-COM-19：root_id / reply_object_* 全部服务端派生，客户端提交的一律忽略；</li>
 *   <li>R-COM-21：列表按楼分页，每楼附前 3 条预览 + 楼中楼总数；</li>
 *   <li>R-COM-22：comment_count 含楼中楼，last_comment_at 只用于展示；</li>
 *   <li>R-COM-23/24：仅作者可软删除；正文 ≤ 1000 字；</li>
 *   <li>敏感词命中用全角＊替换后落库，不拒绝发布（与帖子口径一致）。</li>
 * </ul>
 */
@Service
public class CommentService {

    private static final Logger log = LoggerFactory.getLogger(CommentService.class);

    private static final int COMMENT_MAX = 1000;   // R-COM-24
    private static final int PREVIEW_SIZE = 3;     // R-COM-21
    /** sy_post_comment.body 是 varchar(1000)：只做列长兜底，不是业务截断（决策 6）。 */
    private static final int BODY_COLUMN_MAX = 1000;
    private static final int REPLY_PAGE_MAX = 50;

    private final CommunityRepo repo;
    private final SensitiveWordMasker masker;
    /** 禁言校验：被禁言不能发评论。 */
    private final MuteGuard muteGuard;
    /** 评论 / 回复要发通知（方案 §3）。 */
    private final NotificationService notifications;
    /** 正文里 @DeepSeek 时把任务丢进 AI 队列（V1 新增）。 */
    private final AiQueue aiQueue;

    public CommentService(CommunityRepo repo, SensitiveWordMasker masker, MuteGuard muteGuard,
                          NotificationService notifications, AiQueue aiQueue) {
        this.repo = repo;
        this.masker = masker;
        this.muteGuard = muteGuard;
        this.notifications = notifications;
        this.aiQueue = aiQueue;
    }

    // ==================== 读 ====================

    /** 楼列表：按楼分页，每楼带前 3 条楼中楼预览与楼中楼总数。 */
    public Map<String, Object> list(long postId, int page, int size, String userId) {
        return list(postId, page, size, userId, null);
    }

    /**
     * 楼列表（支持「按评论定位」）。
     *
     * <p>{@code aroundCommentId} 非空时，直接返回**该评论所在的那一页**，
     * 并在出参里多给一个 {@code focus}：
     * <pre>
     *   {"commentId": 目标评论 id, "rootId": 它所属那一楼的 id, "page": 算出来的页码}
     * </pre>
     * 前端据此滚到那一楼并高亮（通知跳楼层用，方案「甲方案」）。
     * 目标评论若是楼中楼，rootId 是它所属的楼，前端会先把楼中楼展开。
     *
     * @param aroundCommentId 目标评论 id；为空就是普通分页
     */
    public Map<String, Object> list(long postId, int page, int size, String userId, Long aroundCommentId) {
        requirePost(postId);
        int p = Math.max(1, page);
        int sz = Math.min(50, Math.max(1, size));

        Map<String, Object> focus = null;
        if (aroundCommentId != null) {
            Map<String, Object> target = repo.findComment(aroundCommentId);
            // 目标被删 / 不在这个帖子下 -> 退化成第一页，focus 为 null（前端提示"该评论已删除"）
            if (target != null && CommunityService.num(target.get("post_id")) == postId
                    && CommunityService.num(target.get("status")) == 1) {
                Object targetRoot = target.get("root_id");
                long rootId = targetRoot == null
                        ? CommunityService.num(target.get("id"))
                        : CommunityService.num(targetRoot);
                long before = repo.countRootsBefore(postId, rootId);
                p = (int) (before / sz) + 1;
                focus = new LinkedHashMap<>();
                focus.put("commentId", CommunityService.num(target.get("id")));
                focus.put("rootId", rootId);
                focus.put("page", p);
            }
        }

        long total = repo.countRootComments(postId);
        List<Map<String, Object>> roots = total == 0
                ? List.of()
                : repo.listRootComments(postId, (p - 1) * sz, sz);

        List<Long> rootIds = new ArrayList<>(roots.size());
        for (Map<String, Object> row : roots) rootIds.add(CommunityService.num(row.get("id")));

        List<Map<String, Object>> previews = repo.previewReplies(postId, rootIds);
        Map<Long, Long> replyCounts = repo.countRepliesByRoot(postId, rootIds);

        // R-COM-29：楼 + 预览楼中楼一起批量查 liked，不逐条查
        List<Long> allIds = new ArrayList<>(rootIds);
        for (Map<String, Object> preview : previews) allIds.add(CommunityService.num(preview.get("id")));
        Set<Long> liked = repo.likedCommentIds(userId, allIds);

        Map<Long, List<Map<String, Object>>> previewByRoot = new LinkedHashMap<>();
        for (Map<String, Object> preview : previews) {
            long rootId = CommunityService.num(preview.get("root_id"));
            previewByRoot.computeIfAbsent(rootId, k -> new ArrayList<>())
                    .add(toReply(preview, liked));
        }

        List<Map<String, Object>> items = new ArrayList<>(roots.size());
        for (Map<String, Object> row : roots) {
            long id = CommunityService.num(row.get("id"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", id);
            item.put("postId", CommunityService.num(row.get("post_id")));
            item.put("authorId", row.get("author_id"));
            item.put("authorName", row.get("author_name"));
            item.put("isBot", CommunityService.num(row.get("is_bot")) == 1);
            item.put("body", row.get("body"));
            item.put("likeCount", CommunityService.num(row.get("like_count")));
            item.put("liked", liked.contains(id));
            item.put("createdAt", CommunityService.millis(row.get("created_at")));
            item.put("replies", previewByRoot.getOrDefault(id, List.of()));
            item.put("replyCount", replyCounts.getOrDefault(id, 0L));
            items.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        out.put("focus", focus);          // 普通分页时为 null；按评论定位时带 commentId/rootId/page
        return out;
    }

    /** 某一楼的全部楼中楼（展开时用）。 */
    public Map<String, Object> replies(long rootId, int page, int size, String userId) {
        Map<String, Object> root = repo.findComment(rootId);
        if (!isVisible(root) || root.get("root_id") != null) {
            throw new IllegalArgumentException("COMMENT_NOT_FOUND: 评论不存在或已删除");
        }
        long postId = CommunityService.num(root.get("post_id"));
        requirePost(postId);

        int p = Math.max(1, page);
        int sz = Math.min(REPLY_PAGE_MAX, Math.max(1, size));
        long total = repo.countReplies(rootId);
        List<Map<String, Object>> rows = total == 0
                ? List.of()
                : repo.listReplies(rootId, (p - 1) * sz, sz);

        List<Long> ids = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) ids.add(CommunityService.num(row.get("id")));
        Set<Long> liked = repo.likedCommentIds(userId, ids);

        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) items.add(toReply(row, liked));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("size", sz);
        return out;
    }

    // ==================== 写 ====================

    /** 发布评论：root_id / reply_object_* 全部由服务端派生（R-COM-19）。 */
    @Transactional
    public Map<String, Object> create(String userId, long postId, Map<String, Object> body) {
        muteGuard.assertNotMuted(userId);          // 被禁言不能发评论
        requirePost(postId);

        String text = requireBody(body.get("body"));
        String replyObjectType = normalizeReplyType(body.get("replyObjectType"));

        Long rootId = null;
        Long replyObjectCommentId = null;
        String replyObjectUserId = null;

        if ("COMMENT".equals(replyObjectType)) {
            Long targetId = toLong(body.get("replyObjectCommentId"));
            if (targetId == null) {
                throw new IllegalArgumentException("INVALID_PARAM: replyObjectType=COMMENT 时 replyObjectCommentId 必填");
            }
            Map<String, Object> target = repo.findComment(targetId);
            if (!isVisible(target) || CommunityService.num(target.get("post_id")) != postId) {
                throw new IllegalArgumentException("COMMENT_NOT_FOUND: 被回复的评论不存在");
            }
            // 目标是楼 -> root 就是它；目标是楼中楼 -> root 取它所属的楼（杜绝第三层）
            Object targetRoot = target.get("root_id");
            rootId = targetRoot == null ? CommunityService.num(target.get("id")) : CommunityService.num(targetRoot);
            replyObjectCommentId = CommunityService.num(target.get("id"));
            replyObjectUserId = String.valueOf(target.get("user_id"));
        }

        // 身份与昵称都来自登录态（UserContext）；昵称由 left join sy_user.name 展示，
        // 不再 upsert 用户行，也不再接受请求体里的昵称。
        String uid = userId;

        SensitiveWordMasker.MaskResult masked = masker.mask(text);
        long id = repo.insertComment(postId, uid, rootId, replyObjectType,
                replyObjectCommentId, replyObjectUserId, masked.text());
        recomputePostStats(postId);

        // 通知：评论了我的帖子 / 回复了我的评论。自己操作自己不发、失败不影响评论，都在 service 内部兜住。
        notifications.onComment(postId, uid, id, replyObjectUserId);
        // 通知：正文里 @ 了谁（反向校验在 service 内部：只认 userId + 昵称必须真出现在正文里）
        notifications.onMentions(postId, id, uid, body.get("mentions"), text);
        // 社区 AI：正文含 @DeepSeek 且 mentions 里有 AI 的 userId -> 入队（三道闸都在 maybeEnqueue 里）
        // 楼层归属（决策 3）：
        //   · 楼里 @    -> AI 回到「这一楼的楼中楼」=> 用 id（楼自己）当 rootId
        //   · 楼中楼 @  -> AI 回到「同一个楼的楼中楼」=> 沿用 rootId（仍是第二层，不会更深）
        Long aiRootId = rootId != null ? rootId : id;
        aiQueue.maybeEnqueue(postId, id, uid, aiRootId, text, body.get("mentions"));

        if (masked.hits() > 0) {
            log.info("社区评论打码 userId={} postId={} commentId={} hits={}", uid, postId, id, masked.hits());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("commentId", id);
        return out;
    }

    /**
     * AI 回复落库（V1 新增，方案 §3.5）。
     *
     * <p>AI 就是一个普通用户：走同一个 {@code insertComment}，所以楼层规则、软删、统计全都一致。
     * 三处**刻意不做**：
     * <ul>
     *   <li>不发通知 —— 由调用方 {@code NotificationService.onAiReply} **只发一条**（决策 4）</li>
     *   <li>不触发 @ 提及 —— AI 回复里就算出现 @某人也不通知</li>
     *   <li>不调用 {@code maybeEnqueue} —— 否则 AI 回复里若含 @DeepSeek 会无限自我触发</li>
     * </ul>
     *
     * <p>输出**不做业务截断**（决策 6）：只过敏感词 + 1000 字列长兜底。
     *
     * @param rootId          楼中楼所属楼；楼级别传 null
     * @param replyToCommentId 被回复的评论；发帖 @ 时传 null
     */
    public long createAiComment(long postId, Long rootId, Long replyToCommentId, String askerId, String raw) {
        String masked = masker.mask(raw == null ? "" : raw).text();
        String text = masked.length() > BODY_COLUMN_MAX ? masked.substring(0, BODY_COLUMN_MAX) : masked;
        String replyObjectType = replyToCommentId == null ? "POST" : "COMMENT";

        long id = repo.insertComment(postId, AiAccount.ID, rootId, replyObjectType,
                replyToCommentId, askerId, text);
        recomputePostStats(postId);
        log.info("AI 评论已落库 postId={} commentId={} rootId={} replyTo={} 长度={}",
                postId, id, rootId, replyToCommentId, text.length());
        return id;
    }

    /** 软删除评论：删楼时连带其下所有楼中楼。 */
    @Transactional
    public void delete(String userId, long commentId) {
        Map<String, Object> target = repo.findComment(commentId);
        if (!isVisible(target)) throw new IllegalArgumentException("COMMENT_NOT_FOUND: 评论不存在或已删除");

        long postId = CommunityService.num(target.get("post_id"));
        requirePost(postId);   // 帖子已删除时，其下评论一律视为不可见

        String authorId = String.valueOf(target.get("user_id"));
        if (userId == null || !userId.equals(authorId)) {
            throw new IllegalArgumentException("NOT_AUTHOR: 只有作者本人可以删除");
        }

        repo.softDeleteComment(commentId);
        boolean isRoot = target.get("root_id") == null;
        if (isRoot) repo.softDeleteReplies(commentId);   // 不留无主回复
        recomputePostStats(postId);

        log.info("社区评论删除 userId={} postId={} commentId={} root={}", userId, postId, commentId, isRoot);
    }

    // ==================== 内部 ====================

    /** R-COM-22：事务内锁 post 行后重新 count/max，避免并发下计数丢失。 */
    private void recomputePostStats(long postId) {
        Map<String, Object> post = repo.lockPost(postId);
        if (post == null) return;   // 帖子已删除：不再维护统计

        long comments = repo.countComments(postId);
        Object lastCommentAt = repo.maxCommentAt(postId);
        double hot = CommunityService.hotScore(comments,
                CommunityService.num(post.get("like_count")),
                CommunityService.num(post.get("view_count")),
                CommunityService.millis(post.get("created_at")));
        repo.updatePostStats(postId, comments, lastCommentAt, hot);
    }

    private Map<String, Object> requirePost(long postId) {
        Map<String, Object> post = repo.findPost(postId);
        if (post == null) throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在或已删除");
        return post;
    }

    private static boolean isVisible(Map<String, Object> row) {
        return row != null && CommunityService.num(row.get("status")) == 1;
    }

    private static Map<String, Object> toReply(Map<String, Object> row, Set<Long> liked) {
        long id = CommunityService.num(row.get("id"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("postId", CommunityService.num(row.get("post_id")));
        m.put("rootId", CommunityService.num(row.get("root_id")));
        m.put("authorId", row.get("author_id"));
        m.put("authorName", row.get("author_name"));
        m.put("isBot", CommunityService.num(row.get("is_bot")) == 1);
        m.put("body", row.get("body"));
        m.put("likeCount", CommunityService.num(row.get("like_count")));
        m.put("liked", liked.contains(id));
        m.put("replyObjectType", row.get("reply_object_type"));
        m.put("replyObjectCommentId", row.get("reply_object_comment_id"));
        m.put("replyObjectUserName", row.get("reply_object_user_name"));
        m.put("createdAt", CommunityService.millis(row.get("created_at")));
        return m;
    }

    private static String requireBody(Object value) {
        String text = value == null ? "" : String.valueOf(value).trim();
        if (text.isEmpty()) throw new IllegalArgumentException("INVALID_PARAM: 评论内容不能为空");
        if (text.length() > COMMENT_MAX) throw new IllegalArgumentException("INVALID_PARAM: 评论最多 1000 字");
        return text;
    }

    private static String normalizeReplyType(Object value) {
        String t = value == null ? "" : String.valueOf(value).trim().toUpperCase(Locale.ROOT);
        if (t.isEmpty()) return "POST";
        if (!"POST".equals(t) && !"COMMENT".equals(t)) {
            throw new IllegalArgumentException("INVALID_PARAM: replyObjectType 只允许 POST / COMMENT");
        }
        return t;
    }

    private static Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        String s = String.valueOf(value).trim();
        if (s.isEmpty()) return null;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("INVALID_PARAM: replyObjectCommentId 必须是数字");
        }
    }
}
