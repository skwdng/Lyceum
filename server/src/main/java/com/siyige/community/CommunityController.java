package com.siyige.community;

import com.siyige.auth.AuthException;
import com.siyige.auth.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 社区接口（SPEC v4.2 §7 :392-405 的 14 个接口；契约见 docs/社区接口契约.md）。
 *
 * <pre>
 *   GET    /api/community/posts                列表（type/title/topicId/range/sort/page/size）
 *   GET    /api/community/posts/{id}           详情（含 body / updatedAt）
 *   POST   /api/community/posts                发布   -> {postId}
 *   PATCH  /api/community/posts/{id}           编辑   -> {postId}
 *   DELETE /api/community/posts/{id}           软删除 -> 204
 *   POST   /api/community/posts/{id}/view      浏览计数 -> 204（匿名也 204，但不计数）
 *   GET    /api/community/posts/{id}/comments  楼列表
 *   GET    /api/community/comments/{rootId}/replies  展开楼中楼
 *   POST   /api/community/posts/{id}/comments  发布楼 / 回复 -> {commentId}
 *   DELETE /api/community/comments/{id}        软删除评论 -> 204
 *   POST/DELETE /api/community/posts/{id}/like       点赞 / 取消（204 幂等）
 *   POST/DELETE /api/community/comments/{id}/like    点赞 / 取消（204 幂等）
 * </pre>
 *
 * <h3>身份（2026-11-03 起改为登录态）</h3>
 * 身份唯一来源是 JWT：{@code com.siyige.auth.JwtAuthFilter} 只挂 {@code /api/community/*}，
 * 校验通过后把 userId 放进 {@link UserContext}。本类**不再**读 {@code X-User-Id} 头、
 * 也不再读请求体里的 {@code userId}/{@code userName}——那套可以随意伪造，已废弃。
 *
 * <p>权限矩阵（过滤器已拦截，这里再做一次防御性断言）：
 * <ul>
 *   <li>读接口：{@link UserContext#current()}，可为 null（匿名），此时 liked 恒 false</li>
 *   <li>写接口：{@link UserContext#require()}，为空即 401</li>
 *   <li>浏览计数：匿名直接 204 不计数；登录才 recordView</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/community")
public class CommunityController {

    private static final Logger log = LoggerFactory.getLogger(CommunityController.class);

    private final CommunityService community;
    private final CommentService comments;
    private final LikeService likes;
    private final CommunityViewService views;
    private final ReportService reports;
    private final MuteGuard muteGuard;
    private final NotificationService notifications;

    public CommunityController(CommunityService community, CommentService comments,
                               LikeService likes, CommunityViewService views,
                               ReportService reports, MuteGuard muteGuard,
                               NotificationService notifications) {
        this.community = community;
        this.comments = comments;
        this.likes = likes;
        this.views = views;
        this.reports = reports;
        this.muteGuard = muteGuard;
        this.notifications = notifications;
    }

    // ==================== 帖子 ====================

    @GetMapping("/posts")
    public Map<String, Object> list(@RequestParam(required = false) String type,
                                    @RequestParam(required = false) String title,
                                    @RequestParam(required = false) String topicId,
                                    @RequestParam(required = false) String range,
                                    @RequestParam(required = false) String sort,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        // 匿名可读：userId 为 null 时 liked 一律 false
        return community.list(type, title, topicId, range, sort, page, size, UserContext.current());
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        return community.detail(id, UserContext.current());
    }

    @PostMapping("/posts")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        return community.create(UserContext.require(), body);
    }

    @PatchMapping("/posts/{id}")
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return community.update(UserContext.require(), id, body);
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        community.delete(UserContext.require(), id);
        return ResponseEntity.noContent().build();
    }

    /**
     * 浏览计数：未登录不计数（决策 7），但仍返回 204，前端无感。
     * 登录时走 Redis 自然日去重（R-COM-30），Redis 故障也 204（R-COM-37）。
     */
    @PostMapping("/posts/{id}/view")
    public ResponseEntity<Void> view(@PathVariable long id) {
        String uid = UserContext.current();
        if (uid == null || uid.isBlank()) {
            log.debug("匿名浏览不计数 postId={}", id);
            return ResponseEntity.noContent().build();
        }
        views.recordView(uid, id);
        return ResponseEntity.noContent().build();
    }

    // ==================== 评论 / 楼中楼 ====================

    /**
     * 楼列表。
     *
     * @param aroundCommentId 可选：传了就返回**该评论所在的那一页**，并带 {@code focus}（通知跳楼层用）
     */
    @GetMapping("/posts/{id}/comments")
    public Map<String, Object> listComments(@PathVariable long id,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "10") int size,
                                            @RequestParam(required = false) Long aroundCommentId) {
        return comments.list(id, page, size, UserContext.current(), aroundCommentId);
    }

    @GetMapping("/comments/{rootId}/replies")
    public Map<String, Object> listReplies(@PathVariable long rootId,
                                           @RequestParam(defaultValue = "1") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return comments.replies(rootId, page, size, UserContext.current());
    }

    /** 发布评论 / 回复；root_id 与 reply_object_* 全由服务端派生（R-COM-19）。 */
    @PostMapping("/posts/{id}/comments")
    public Map<String, Object> addComment(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return comments.create(UserContext.require(), id, body);
    }

    @DeleteMapping("/comments/{id}")
    public ResponseEntity<Void> deleteComment(@PathVariable long id) {
        comments.delete(UserContext.require(), id);
        return ResponseEntity.noContent().build();
    }

    // ==================== 点赞（R-COM-26：POST/DELETE 幂等，统一 204） ====================

    @PostMapping("/posts/{id}/like")
    public ResponseEntity<Void> likePost(@PathVariable long id) {
        likes.likePost(requireUser(), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/posts/{id}/like")
    public ResponseEntity<Void> unlikePost(@PathVariable long id) {
        likes.unlikePost(requireUser(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/comments/{id}/like")
    public ResponseEntity<Void> likeComment(@PathVariable long id) {
        likes.likeComment(requireUser(), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/comments/{id}/like")
    public ResponseEntity<Void> unlikeComment(@PathVariable long id) {
        likes.unlikeComment(requireUser(), id);
        return ResponseEntity.noContent().build();
    }

    // ==================== 举报 / 禁言（用户侧，方案 §3.1） ====================

    /**
     * 提交举报：`{targetType,targetId,reason,detail?}` → `{reportId}`。
     *
     * <p>错误：400 参数不合法 / 不能举报自己；404 目标不存在或已删；
     * 409 `ALREADY_REPORTED` 重复举报；401 未登录。
     */
    @PostMapping("/reports")
    public Map<String, Object> report(@RequestBody Map<String, Object> body) {
        return reports.submit(UserContext.require(), body);
    }

    /** 我的举报：`{items,total,page,size}`，带目标摘要与处理状态。 */
    @GetMapping("/my-reports")
    public Map<String, Object> myReports(@RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        return reports.listMine(UserContext.require(), page, size);
    }

    /** 我的禁言状态：`{banned, until, reason}`，前端用来提示「你被禁言至 X」。 */
    @GetMapping("/me/ban")
    public Map<String, Object> myBan() {
        return muteGuard.banInfo(UserContext.require());
    }

    // ==================== 通知（2026-11-04 新增，V1） ====================

    /**
     * 我的通知列表。
     *
     * <p>⚠️ 这个 GET 接口有**副作用**（方案 §5 的既定设计）：
     * 拉列表时会把**本页**未读标成已读，并把 Redis 角标按本页实际标记条数递减。
     * 返回的是**标记前**的状态，所以刚拉到的这一页里未读行仍然是 {@code read:false}（前端加深底色）。
     */
    @GetMapping("/notifications")
    public Map<String, Object> notifications(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return notifications.list(UserContext.require(), page, size);
    }

    /** 未读角标：只读 Redis（没有就是 0）。前端 45 秒轮询一次。 */
    @GetMapping("/notifications/unread-count")
    public Map<String, Object> unreadCount() {
        return Map.of("unread", notifications.unreadCount(UserContext.require()));
    }

    /**
     * @ 候选：昵称前缀匹配，≤10 条 `{id,name}`。
     *
     * <p>虽然过滤器对 GET 放行匿名，这里必须登录才能用（否则等于把用户目录公开出去）。
     */
    @GetMapping("/users")
    public Map<String, Object> users(@RequestParam(required = false) String q) {
        UserContext.require();
        return Map.of("items", notifications.suggestUsers(q));
    }

    // ==================== 内部 ====================

    /** 写接口取身份；未登录抛 401（过滤器正常情况下已经拦住了，这里再兜一层）。 */
    private static String requireUser() {
        String uid = UserContext.current();
        if (uid == null || uid.isBlank()) throw AuthException.unauthorized();
        return uid;
    }
}
