package com.siyige.community;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 点赞聚合 × 未读计数（方案 §6 的三种状态 + 决策 A / D / E 与取消点赞规则）。
 *
 * <p>被钉住的行为：
 * <pre>
 * 行不存在      → insert + HINCRBY 1
 * 行存在且已读  → update(人数/actor/时间, is_read=0) + HINCRBY 1
 * 行存在且未读  → update(人数/actor/时间)，不 +1
 * 取消点赞      → 从点赞表重算人数；降 0 删行；不碰计数 / is_read / created_at / actor
 * </pre>
 */
class NotificationAggTest {

    private NotifyTestSupport db;
    private long postId;

    private static final String TARGET_POST = NotificationRepo.TARGET_POST;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
        db.user("u-carol", "卡罗尔");
        postId = db.post("u-alice", "论 AI 是否会取代辩手");
    }

    private Map<String, Object> agg() {
        return db.repo.findAgg("u-alice", "LIKE_POST:" + postId);
    }

    private int aggCount() {
        Map<String, Object> r = agg();
        assertNotNull(r, "聚合行应该存在");
        return (int) CommunityService.num(r.get("agg_count"));
    }

    // ==================== 三种状态 ====================

    @Test
    void 首次点赞_建聚合行并让角标加一() {
        db.addLike("u-bob", TARGET_POST, postId);

        db.service.onLike(TARGET_POST, postId, "u-bob");

        Map<String, Object> row = agg();
        assertNotNull(row);
        assertEquals(1, CommunityService.num(row.get("agg_count")));
        assertEquals(0, CommunityService.num(row.get("is_read")), "新聚合行必须是未读");
        assertEquals("u-bob", row.get("actor_id"));
        assertEquals("王同学", row.get("actor_name"), "actor_name 是昵称快照");
        assertEquals("论 AI 是否会取代辩手", row.get("excerpt"));
        assertEquals(1, db.counter.get("u-alice"), "首次创建 -> HINCRBY 1");
    }

    @Test
    void 本来就未读_又来一个点赞_人数增加但计数不加() {
        db.addLike("u-bob", TARGET_POST, postId);
        db.addLike("u-carol", TARGET_POST, postId);

        db.service.onLike(TARGET_POST, postId, "u-bob");
        db.service.onLike(TARGET_POST, postId, "u-carol");

        assertEquals(2, aggCount());
        assertEquals("u-carol", agg().get("actor_id"), "聚合行记住最新那个人");
        assertEquals(1, db.counter.get("u-alice"), "未读状态下不再 +1（决策 7）");
    }

    @Test
    void 已读后再次被赞_重新变未读且计数加一() {
        db.addLike("u-bob", TARGET_POST, postId);
        db.addLike("u-carol", TARGET_POST, postId);
        db.service.onLike(TARGET_POST, postId, "u-bob");

        // 用户看过通知：标记已读 + 计数递减
        long id = CommunityService.num(agg().get("id"));
        assertEquals(1, db.repo.markRead("u-alice", List.of(id)));
        assertEquals(0, db.counter.decrement("u-alice", 1));
        assertEquals(0, db.counter.get("u-alice"));

        db.service.onLike(TARGET_POST, postId, "u-carol");

        assertEquals(2, aggCount());
        assertEquals(0, CommunityService.num(agg().get("is_read")), "已读 -> 又被赞 -> 重新未读（决策 A）");
        assertEquals(1, db.counter.get("u-alice"), "已读->未读 要 HINCRBY 1");
    }

    // ==================== 取消点赞（决策 8 / E） ====================

    @Test
    void 取消点赞_只重算人数_不碰已读状态_时间_计数() {
        db.addLike("u-bob", TARGET_POST, postId);
        db.addLike("u-carol", TARGET_POST, postId);
        db.service.onLike(TARGET_POST, postId, "u-bob");
        db.service.onLike(TARGET_POST, postId, "u-carol");
        assertEquals(2, aggCount());

        // 造一个"已读且是三天前"的聚合行，看取消点赞会不会把它顶上来 / 重新变未读
        long id = CommunityService.num(agg().get("id"));
        db.repo.markRead("u-alice", List.of(id));
        db.counter.decrement("u-alice", 1);
        db.setCreatedAt(id, "2020-01-01 08:00:00");
        assertEquals(0, db.counter.get("u-alice"));

        db.removeLike("u-carol", TARGET_POST, postId);
        db.service.onUnlike(TARGET_POST, postId, "u-carol");

        Map<String, Object> row = agg();
        assertEquals(1, CommunityService.num(row.get("agg_count")), "人数从点赞表重算，不做增减量");
        assertEquals(1, CommunityService.num(row.get("is_read")), "取消点赞不许把红点亮回来（决策 E）");
        assertEquals(0, db.counter.get("u-alice"), "取消点赞不动计数");
        assertEquals("2020-01-01 08:00:00.0",
                String.valueOf(db.field("sy_notification", "created_at", "id = ?", id)),
                "取消点赞不许改时间（否则这行会跳到列表最前）");
    }

    @Test
    void 人数降为零_整行删除() {
        db.addLike("u-bob", TARGET_POST, postId);
        db.service.onLike(TARGET_POST, postId, "u-bob");
        assertEquals(1, db.counter.get("u-alice"));

        db.removeLike("u-bob", TARGET_POST, postId);
        db.service.onUnlike(TARGET_POST, postId, "u-bob");

        assertNull(agg(), "人数归零应删掉聚合行");
        assertEquals(1, db.counter.get("u-alice"), "删行也不动计数（决策 8）");
    }

    @Test
    void 取消点赞时聚合行不存在_什么都不做() {
        db.removeLike("u-bob", TARGET_POST, postId);
        assertDoesNotThrow(() -> db.service.onUnlike(TARGET_POST, postId, "u-bob"));
        assertNull(agg());
        assertEquals(0, db.counter.get("u-alice"));
    }

    // ==================== 自己操作自己 ====================

    @Test
    void 自己赞自己的帖子_不发通知() {
        db.addLike("u-alice", TARGET_POST, postId);

        db.service.onLike(TARGET_POST, postId, "u-alice");

        assertNull(agg(), "自己赞自己不该产生通知（决策 5）");
        assertEquals(0, db.counter.get("u-alice"));
    }

    // ==================== 评论点赞单独聚合 ====================

    @Test
    void 评论点赞走自己的聚合键_与帖子点赞互不干扰() {
        long commentId = db.comment(postId, "u-bob", "我觉得不会");
        db.addLike("u-carol", NotificationRepo.TARGET_COMMENT, commentId);

        db.service.onLike(NotificationRepo.TARGET_COMMENT, commentId, "u-carol");

        Map<String, Object> row = db.repo.findAgg("u-bob", "LIKE_COMMENT:" + commentId);
        assertNotNull(row);
        assertEquals("LIKE_COMMENT", row.get("type"));
        assertEquals(1, db.counter.get("u-bob"));
        assertNull(agg(), "帖子作者的聚合行不该被评论点赞影响");
        assertEquals(0, db.counter.get("u-alice"));
    }

    @Test
    void 同一个人对同一目标的聚合键唯一_不会重复建行() {
        db.addLike("u-bob", TARGET_POST, postId);
        db.service.onLike(TARGET_POST, postId, "u-bob");
        db.service.onLike(TARGET_POST, postId, "u-bob");

        Long rows = db.jdbc.queryForObject(
                "select count(*) from sy_notification where user_id = 'u-alice'", Long.class);
        assertEquals(1L, rows, "同一 (收件人, agg_key) 只能有一行（唯一索引兜底）");
    }
}
