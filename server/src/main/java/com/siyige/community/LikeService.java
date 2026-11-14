package com.siyige.community;

import com.siyige.admin.analytics.Active;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 社区点赞（SPEC-v4.2 §18.4 R-COM-25~29）。
 *
 * <p>四个接口都是幂等的：重复点赞 / 重复取消一律 204，不报错、不重复计数。
 * 计数维护方式：事务内先锁目标行，再插/删 community_like，只有影响行数为 1 时才改 count，
 * 避免并发下 like_count 与点赞表脱节。
 *
 * <p>帖子点赞会连带重算 hot_score（R-COM-13）；评论点赞不影响帖子热度。
 */
@Service
public class LikeService {

    private static final Logger log = LoggerFactory.getLogger(LikeService.class);

    static final String TARGET_POST = "POST";
    static final String TARGET_COMMENT = "COMMENT";

    private final CommunityRepo repo;
    /** 禁言校验：被禁言不能点赞（但**可以**取消点赞——不卡住用户收回自己的操作）。 */
    private final MuteGuard muteGuard;
    /** 点赞要发通知：(收件人 + 被赞对象) 聚合成一行（方案 §6）。 */
    private final NotificationService notifications;

    public LikeService(CommunityRepo repo, MuteGuard muteGuard, NotificationService notifications) {
        this.repo = repo;
        this.muteGuard = muteGuard;
        this.notifications = notifications;
    }

    /** 点赞帖子：已赞则什么都不做，仍返回成功。 */
    @Transactional
    @Active
    public void likePost(String userId, long postId) {
        muteGuard.assertNotMuted(userId);      // 被禁言不能点赞；取消点赞不拦
        changePostLike(userId, postId, true);
    }

    /** 取消点赞帖子：没赞过同样返回成功。 */
    @Transactional
    public void unlikePost(String userId, long postId) {
        changePostLike(userId, postId, false);
    }

    /** 点赞评论：不重算帖子热度。 */
    @Transactional
    @Active
    public void likeComment(String userId, long commentId) {
        muteGuard.assertNotMuted(userId);
        changeCommentLike(userId, commentId, true);
    }

    /** 取消点赞评论：不重算帖子热度。 */
    @Transactional
    public void unlikeComment(String userId, long commentId) {
        changeCommentLike(userId, commentId, false);
    }

    // ==================== 内部 ====================

    private void changePostLike(String userId, long postId, boolean like) {
        Map<String, Object> post = repo.lockPostForLike(postId);
        if (post == null) throw new IllegalArgumentException("POST_NOT_FOUND: 帖子不存在或已删除");

        String uid = uidOrDemo(userId);
        int affected = like
                ? repo.insertLike(uid, TARGET_POST, postId)
                : repo.deleteLike(uid, TARGET_POST, postId);
        if (affected != 1) return;   // 幂等：重复点赞 / 重复取消，不计数

        long current = CommunityService.num(post.get("like_count"));
        long newLikes = Math.max(0, current + (like ? 1 : -1));
        double hot = CommunityService.hotScore(
                CommunityService.num(post.get("comment_count")),
                newLikes,
                CommunityService.num(post.get("view_count")),
                CommunityService.millis(post.get("created_at")));
        repo.updatePostLikeStats(postId, newLikes, hot);

        // 通知：点赞聚合。自己赞自己不发；取消点赞只重算人数（不动计数/已读/时间），都在 service 内部兜住。
        if (like) notifications.onLike(NotificationRepo.TARGET_POST, postId, uid);
        else notifications.onUnlike(NotificationRepo.TARGET_POST, postId, uid);

        log.info("社区点赞 userId={} target=POST postId={} liked={} likeCount={}", uid, postId, like, newLikes);
    }

    private void changeCommentLike(String userId, long commentId, boolean like) {
        Map<String, Object> comment = repo.lockCommentForLike(commentId);
        if (comment == null) throw new IllegalArgumentException("COMMENT_NOT_FOUND: 评论不存在或已删除");

        long postId = CommunityService.num(comment.get("post_id"));
        // 帖子已软删时，其下评论不应对外可见：统一按 COMMENT_NOT_FOUND 处理（不泄露已删评论）
        if (repo.findPost(postId) == null) {
            throw new IllegalArgumentException("COMMENT_NOT_FOUND: 评论不存在或已删除");
        }

        String uid = uidOrDemo(userId);
        int affected = like
                ? repo.insertLike(uid, TARGET_COMMENT, commentId)
                : repo.deleteLike(uid, TARGET_COMMENT, commentId);
        if (affected != 1) return;

        long current = CommunityService.num(comment.get("like_count"));
        long newLikes = Math.max(0, current + (like ? 1 : -1));
        repo.updateCommentLikeCount(commentId, newLikes);

        // 通知：评论点赞聚合
        if (like) notifications.onLike(NotificationRepo.TARGET_COMMENT, commentId, uid);
        else notifications.onUnlike(NotificationRepo.TARGET_COMMENT, commentId, uid);

        log.info("社区点赞 userId={} target=COMMENT commentId={} postId={} liked={} likeCount={}",
                uid, commentId, postId, like, newLikes);
    }

    private static String uidOrDemo(String userId) {
        return userId == null || userId.isBlank() ? "u-demo" : userId.trim();
    }
}
