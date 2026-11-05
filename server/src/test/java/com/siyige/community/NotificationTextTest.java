package com.siyige.community;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 列表行的 {@code text} 与 {@code link} 拼装（方案 §7：**文案全由后端拼好**，前端不判断 type）。
 *
 * <p>一次把 11 种 type 全钉住：V1 只产生评论/回复/点赞四类，V2 接 MENTION、
 * V3 接删除/禁言/封禁，本测试保证后两期接线时文案不会走样。
 */
class NotificationTextTest {

    private NotifyTestSupport db;

    private static final long POST_ID = 7L;
    private static final long COMMENT_ID = 42L;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> itemsByType() {
        Map<String, Object> page = db.service.list("u-alice", 1, 50);
        Map<String, Map<String, Object>> out = new HashMap<>();
        for (Map<String, Object> it : (List<Map<String, Object>>) page.get("items")) {
            out.put(String.valueOf(it.get("type")), it);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> linkOf(Map<String, Object> item) {
        return (Map<String, Object>) item.get("link");
    }

    @Test
    void 十一种type的文案与跳转() {
        db.repo.insert("u-alice", "COMMENT_POST", "u-bob", "王同学",
                COMMENT_ID, POST_ID, "论 AI 是否会取代辩手", null);
        db.repo.insert("u-alice", "REPLY_COMMENT", "u-bob", "王同学",
                COMMENT_ID, POST_ID, "我觉得不会", null);
        db.repo.insertAgg("u-alice", "LIKE_POST", "LIKE_POST:7", 3, "u-bob", "王同学", POST_ID, POST_ID,
                "论 AI 是否会取代辩手");
        db.repo.insertAgg("u-alice", "LIKE_COMMENT", "LIKE_COMMENT:42", 2, "u-bob", "王同学",
                COMMENT_ID, POST_ID, "我觉得不会");
        db.repo.insert("u-alice", "MENTION", "u-bob", "王同学", COMMENT_ID, POST_ID, "同意 @爱丽丝 说的", null);
        db.repo.insert("u-alice", "MENTION", "u-bob", "王同学", null, POST_ID, "发帖 @爱丽丝", null);
        db.repo.insert("u-alice", "POST_DELETED", null, null, POST_ID, POST_ID, "论 AI 是否会取代辩手", "含广告");
        db.repo.insert("u-alice", "COMMENT_DELETED", null, null, COMMENT_ID, POST_ID, "我觉得不会", null);
        db.repo.insert("u-alice", "MUTED", null, null, null, null, null, "至 2026-11-10 10:00，理由：刷屏");
        db.repo.insert("u-alice", "UNMUTED", null, null, null, null, null, null);
        db.repo.insert("u-alice", "BANNED", null, null, null, null, null, "违规内容");
        db.repo.insert("u-alice", "UNBANNED", null, null, null, null, null, null);

        Map<String, Map<String, Object>> byType = itemsByType();

        assertEquals("王同学 评论了你的帖子《论 AI 是否会取代辩手》", byType.get("COMMENT_POST").get("text"));
        assertEquals("王同学 回复了你的评论：我觉得不会", byType.get("REPLY_COMMENT").get("text"));
        assertEquals("王同学 等 3 人赞了你的帖子《论 AI 是否会取代辩手》", byType.get("LIKE_POST").get("text"));
        assertEquals(3L, ((Number) byType.get("LIKE_POST").get("aggCount")).longValue(), "N 含被显示的那个人（决策 D）");
        assertEquals("王同学 等 2 人赞了你的评论「我觉得不会」", byType.get("LIKE_COMMENT").get("text"));
        assertEquals("王同学 在评论里 @ 了你：同意 @爱丽丝 说的", byType.get("MENTION").get("text"));
        assertEquals("你的帖子《论 AI 是否会取代辩手》被管理员删除，理由：含广告",
                byType.get("POST_DELETED").get("text"));
        assertEquals("你的评论「我觉得不会」被管理员删除", byType.get("COMMENT_DELETED").get("text"));
        assertEquals("你被社区禁言：至 2026-11-10 10:00，理由：刷屏", byType.get("MUTED").get("text"));
        assertEquals("你的社区禁言已被解除", byType.get("UNMUTED").get("text"));
        assertEquals("你的账号被全站封禁，理由：违规内容", byType.get("BANNED").get("text"));
        assertEquals("你的账号已解封", byType.get("UNBANNED").get("text"));
        assertEquals(11, byType.size(), "11 种 type 都在（MENTION 两条同 type，byType 取最后一条）");
    }

    @Test
    void 跳转链接_内容类到社区_账号类到我的() {
        db.repo.insert("u-alice", "COMMENT_POST", "u-bob", "王同学", COMMENT_ID, POST_ID, "题", null);
        db.repo.insert("u-alice", "REPLY_COMMENT", "u-bob", "王同学", COMMENT_ID, POST_ID, "内容", null);
        db.repo.insertAgg("u-alice", "LIKE_COMMENT", "LIKE_COMMENT:42", 1, "u-bob", "王同学",
                COMMENT_ID, POST_ID, "内容");
        db.repo.insert("u-alice", "MUTED", null, null, null, null, null, "理由");
        db.repo.insert("u-alice", "BANNED", null, null, null, null, null, "理由");

        Map<String, Map<String, Object>> byType = itemsByType();

        // 评论类：精确到楼层
        assertEquals("community", linkOf(byType.get("REPLY_COMMENT")).get("view"));
        assertEquals(POST_ID, linkOf(byType.get("REPLY_COMMENT")).get("postId"));
        assertEquals(COMMENT_ID, linkOf(byType.get("REPLY_COMMENT")).get("commentId"),
                "回复类通知要能跳到被回复的那一楼（V3 用）");
        assertEquals(COMMENT_ID, linkOf(byType.get("LIKE_COMMENT")).get("commentId"));

        // 帖子类：只到帖子
        assertEquals(POST_ID, linkOf(byType.get("COMMENT_POST")).get("postId"));
        assertNull(linkOf(byType.get("COMMENT_POST")).get("commentId"));

        // 禁言/封禁：没有内容可跳，去「我的」
        assertEquals("me", linkOf(byType.get("MUTED")).get("view"));
        assertNull(linkOf(byType.get("MUTED")).get("postId"));
        assertEquals("me", linkOf(byType.get("BANNED")).get("view"));
    }

    @Test
    void 超长摘要按码点截断到列宽以内() {
        String longTitle = "很长的标题".repeat(60);            // 300 字
        db.repo.insert("u-alice", "COMMENT_POST", "u-bob", "王同学", COMMENT_ID, POST_ID, longTitle, null);

        Map<String, Object> item = itemsByType().get("COMMENT_POST");
        String text = String.valueOf(item.get("text"));

        String excerptInDb = String.valueOf(db.field("sy_notification", "excerpt", "type = 'COMMENT_POST'"));
        assertTrue(excerptInDb.codePointCount(0, excerptInDb.length()) <= 120, "excerpt 必须塞得进 varchar(120)");
        assertTrue(excerptInDb.endsWith("…"), "截断要带省略号");
        assertEquals("王同学 评论了你的帖子《" + excerptInDb + "》", text, "文案用的是截断后的快照");
    }

    @Test
    void 行结构符合契约() {
        db.repo.insertAgg("u-alice", "LIKE_POST", "LIKE_POST:7", 2, "u-bob", "王同学", POST_ID, POST_ID, "题");

        Map<String, Object> item = itemsByType().get("LIKE_POST");

        assertNotNull(item.get("id"));
        assertEquals("LIKE_POST", item.get("type"));
        assertEquals(2L, ((Number) item.get("aggCount")).longValue());
        assertEquals(false, item.get("read"));
        assertNotNull(item.get("createdAt"), "createdAt 是毫秒时间戳");
        assertTrue(((Number) item.get("createdAt")).longValue() > 1_600_000_000_000L);
        assertEquals(7, item.size(), "行里只有契约字段（id/type/text/aggCount/read/link/createdAt），不透出 actor_id 等内部字段");
    }
}
