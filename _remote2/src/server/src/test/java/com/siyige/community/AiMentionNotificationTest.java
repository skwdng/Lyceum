package com.siyige.community;

import com.siyige.community.ai.AiAccount;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * @DeepSeek 时**不给 AI 账号自己发 @ 通知**（V1 补的边界）。
 *
 * <p>理由：AI 不登录、看不到通知，那条 MENTION 会永远未读、永远挂在计数里，
 * 纯粹是脏数据。人类用户照常收通知，不受影响。
 */
class AiMentionNotificationTest {

    private NotifyTestSupport db;
    private long postId;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
        postId = db.post("u-alice", "论 AI 是否会取代辩手");
    }

    private long mentionCount(String userId) {
        Long n = db.jdbc.queryForObject(
                "select count(*) from sy_notification where user_id = ? and type = 'MENTION'",
                Long.class, userId);
        return n == null ? 0 : n;
    }

    @Test
    void atAI不给AI发通知() {
        db.service.onMentions(postId, null, "u-bob",
                List.of(AiAccount.ID), "@DeepSeek 你怎么看");

        assertEquals(0, mentionCount(AiAccount.ID), "AI 不该收到 MENTION");
        assertEquals(0, db.service.unreadCount(AiAccount.ID));
    }

    @Test
    void at真人照常发通知() {
        db.service.onMentions(postId, null, "u-bob", List.of("u-alice"), "@爱丽丝 你怎么看");

        assertEquals(1, mentionCount("u-alice"));
        assertEquals(1, db.service.unreadCount("u-alice"));
    }

    @Test
    void 同时at真人和AI_只给真人发() {
        db.service.onMentions(postId, null, "u-bob",
                List.of("u-alice", AiAccount.ID), "@爱丽丝 @DeepSeek 你俩说说");

        assertEquals(1, mentionCount("u-alice"));
        assertEquals(0, mentionCount(AiAccount.ID));
    }

    @Test
    void AI回复里就算出现at也不发通知() {
        long aiComment = db.comment(postId, AiAccount.ID, "我的回答 @爱丽丝 可以参考这条");
        // createAiComment 不发 onMentions；这里模拟 handler 的完整路径：只发 onAiReply
        db.service.onAiReply(postId, aiComment, "u-bob", true);

        assertEquals(0, mentionCount("u-alice"), "AI 回复不该触发 @ 通知");
        assertEquals(1, db.service.unreadCount("u-bob"), "提问者只收到一条 REPLY_COMMENT");
    }

    @Test
    void 通知列表里AI的条目为零() {
        db.service.onMentions(postId, null, "u-bob", List.of(AiAccount.ID), "@DeepSeek 在吗");

        Map<String, Object> page = db.service.list(AiAccount.ID, 1, 20);
        assertEquals(0L, ((Number) page.get("total")).longValue());
    }
}
