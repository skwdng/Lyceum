package com.siyige.community;

import com.siyige.auth.UserNames;
import com.siyige.community.MuteGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * V3：通知跳楼层用的「按评论定位」（方案「甲方案」）。
 *
 * <p>{@code GET /posts/{id}/comments?aroundCommentId=X} 要直接返回**X 所在的那一页**，
 * 并带 {@code focus:{commentId, rootId, page}}，前端据此滚过去并高亮。
 * 排序口径必须和普通分页一致（created_at desc, id desc），否则会差一页。
 */
class CommentAroundTest {

    private NotifyTestSupport db;
    private CommentService comments;
    private long postId;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
        postId = db.post("u-alice", "一个帖子");
        comments = new CommentService(new CommunityRepo(db.jdbc),
                new SensitiveWordMasker(List.of()), mock(MuteGuard.class),
                new NotificationService(new NotificationRepo(db.jdbc),
                        new InMemoryUnreadCounter(), new UserNames(db.jdbc)));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> focus(Map<String, Object> page) {
        return (Map<String, Object>) page.get("focus");
    }

    @Test
    void 普通分页没有focus() {
        db.comment(postId, "u-bob", "一楼");

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", null);

        assertNull(focus(page), "不传 aroundCommentId 时 focus 必须是 null");
    }

    @Test
    void 按第15楼定位_直接返回第2页() {
        long targetId = 0;
        for (int i = 1; i <= 25; i++) {
            long id = db.comment(postId, "u-bob", "第" + i + "楼");
            if (i == 15) targetId = id;        // 时间升序插入，第 15 条在倒序里排第 11 位 -> 第 2 页
        }
        final long target = targetId;

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", target);

        Map<String, Object> f = focus(page);
        assertNotNull(f);
        assertEquals(2, page.get("page"), "25 楼、每页 10、倒序第 11 位 -> 第 2 页");
        assertEquals(target, f.get("commentId"));
        assertEquals(target, f.get("rootId"), "楼本身就是 root");
        assertEquals(2, f.get("page"));

        boolean found = items(page).stream().anyMatch(x -> String.valueOf(x.get("id")).equals(String.valueOf(target)));
        assertTrue(found, "目标楼必须出现在返回的这一页里");
    }

    @Test
    void 楼中楼定位到它所属那一楼所在页() {
        long root = db.comment(postId, "u-bob", "这是一楼");
        long reply = 0;
        for (int i = 1; i <= 3; i++) {
            long id = db.comment(postId, "u-alice", "楼中楼" + i);
            // 手工挂到 root 下（db.comment 只写楼）
            db.jdbc.update("update sy_post_comment set root_id = ? where id = ?", root, id);
            reply = id;
        }

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", reply);

        Map<String, Object> f = focus(page);
        assertNotNull(f);
        assertEquals(reply, f.get("commentId"), "focus 给的是被点的那条楼中楼");
        assertEquals(root, f.get("rootId"), "但定位用的是它所属的楼");
        assertEquals(1, page.get("page"));
    }

    @Test
    void 目标已被删_退化到第一页且focus为null() {
        long target = db.comment(postId, "u-bob", "会被删的");
        db.jdbc.update("update sy_post_comment set status = 2 where id = ?", target);

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", target);

        assertNull(focus(page), "被删的评论定位不到，focus 为 null（前端提示并留在第一页）");
        assertEquals(1, page.get("page"));
    }

    @Test
    void 目标评论不属于这个帖子_不定位() {
        long otherPost = db.post("u-bob", "另一个帖子");
        long foreign = db.comment(otherPost, "u-bob", "别的帖子的评论");

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", foreign);

        assertNull(focus(page), "不能拿别的帖子的评论 id 来定位");
    }

    @Test
    void 最后一页的楼也能定位() {
        long last = 0;
        for (int i = 1; i <= 23; i++) {
            long id = db.comment(postId, "u-bob", "第" + i + "楼");
            if (i == 2) last = id;              // 倒序里排第 22 位 -> 第 3 页
        }
        final long target = last;

        Map<String, Object> page = comments.list(postId, 1, 10, "u-alice", target);

        assertEquals(3, page.get("page"));
        assertEquals(3, items(page).size());
        // created_at 精度到秒：同一秒内的楼按 id 倒序，所以第 3 页是 id 3,2,1
        boolean contains = items(page).stream()
                .anyMatch(x -> String.valueOf(x.get("id")).equals(String.valueOf(target)));
        assertTrue(contains, "目标楼必须在第 3 页里");
    }
}
