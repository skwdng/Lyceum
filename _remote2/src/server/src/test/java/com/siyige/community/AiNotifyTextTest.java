package com.siyige.community;

import com.siyige.community.ai.AiAccount;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * AI 回复的通知文案（决策 4 / 5）。
 *
 * <p>两条要求：
 * <ul>
 *   <li><b>只发一条</b> {@code REPLY_COMMENT}</li>
 *   <li>文案要说清楚是「回复了你的**评论**」还是「回复了你的**帖子**」——
 *       发帖时 @AI，AI 回的是楼，说「评论」会让用户困惑</li>
 * </ul>
 */
class AiNotifyTextTest {

    private NotifyTestSupport db;
    private long postId;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        postId = db.post("u-alice", "论 AI 是否会取代辩手");
    }

    private Map<String, Object> onlyNotification(String userId) {
        Map<String, Object> page = db.service.list(userId, 1, 20);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
        assertEquals(1, items.size(), "AI 回复只发一条通知");
        return items.get(0);
    }

    @Test
    void AI回复评论_文案是回复了你的评论() {
        long myComment = db.comment(postId, "u-alice", "我的楼");
        long aiReply = db.comment(postId, AiAccount.ID, "AI 的回答");

        db.service.onAiReply(postId, aiReply, "u-alice", false);

        Map<String, Object> item = onlyNotification("u-alice");
        assertEquals("REPLY_COMMENT", item.get("type"));
        String text = String.valueOf(item.get("text"));
        assertTrue(text.startsWith("DeepSeek 回复了你的评论："), text);
        assertTrue(text.contains("AI 的回答"), text);
        assertNotNull(myComment);
    }

    @Test
    void AI回复帖子_文案是回复了你的帖子() {
        long aiFloor = db.comment(postId, AiAccount.ID, "AI 在帖子下的楼");

        db.service.onAiReply(postId, aiFloor, "u-alice", true);

        Map<String, Object> item = onlyNotification("u-alice");
        String text = String.valueOf(item.get("text"));
        assertTrue(text.startsWith("DeepSeek 回复了你的帖子："), text);
        assertFalse(text.contains("评论"), "发帖场景不能写成「回复了你的评论」：" + text);
    }

    @Test
    void 通知里带得回楼层的跳转信息() {
        long aiFloor = db.comment(postId, AiAccount.ID, "AI 的楼");
        db.service.onAiReply(postId, aiFloor, "u-alice", true);

        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) onlyNotification("u-alice").get("link");
        assertEquals("community", link.get("view"));
        assertEquals(postId, ((Number) link.get("postId")).longValue());
        assertEquals(aiFloor, ((Number) link.get("commentId")).longValue(), "点通知要能跳到 AI 那条楼");
    }

    @Test
    void 未读角标加一() {
        long aiFloor = db.comment(postId, AiAccount.ID, "AI 的楼");
        assertEquals(0, db.service.unreadCount("u-alice"));

        db.service.onAiReply(postId, aiFloor, "u-alice", true);
        assertEquals(1, db.service.unreadCount("u-alice"));

        db.service.list("u-alice", 1, 20);
        assertEquals(0, db.service.unreadCount("u-alice"), "拉过列表就清零");
    }

    @Test
    void 通知的item不含内部标记note() {
        long aiFloor = db.comment(postId, AiAccount.ID, "AI 的楼");
        db.service.onAiReply(postId, aiFloor, "u-alice", true);

        Map<String, Object> item = onlyNotification("u-alice");
        assertFalse(item.containsKey("note"), "内部标记不能泄露给前端");
        assertFalse(String.valueOf(item.get("text")).contains("POST"), "文案里不能出现标记值");
    }

    @Test
    void 提问者不存在时不炸() {
        long aiFloor = db.comment(postId, AiAccount.ID, "AI 的楼");
        assertDoesNotThrow(() -> db.service.onAiReply(postId, aiFloor, null, true));
        assertDoesNotThrow(() -> db.service.onAiReply(postId, aiFloor, "", true));
    }
}
