package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 发消息（验收 #12~#14、#19、#20）。
 *
 * <p>一条消息落库时要同时动四处，缺一个就会出怪现象：
 * 会话表（列表里能看见）→ 消息表（历史里有）→ 发件人已读位置（自己的消息不显示未读）→
 * 收件人未读缓存（角标亮）。
 */
class MessageSendTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
    }

    private static String codeOf(IllegalArgumentException e) {
        String m = e.getMessage();
        int i = m.indexOf(':');
        return i > 0 ? m.substring(0, i) : m;
    }

    @Test
    void 非好友不能发消息_403语义() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "bob", "在吗", "TEXT", null));
        assertEquals("NOT_FRIEND", codeOf(e));
        assertEquals(0, db.count("select count(*) from sy_direct_message"), "一个字都不该落库");
    }

    @Test
    void 首次发消息自动建会话_并同时动四处() {
        db.repo.insertFriend("alice", "bob");

        Map<String, Object> msg = db.chat.send("alice", "bob", "在吗", "TEXT", null);

        long msgId = ((Number) msg.get("messageId")).longValue();
        long convId = ((Number) msg.get("convId")).longValue();
        assertEquals("在吗", msg.get("body"));
        assertEquals("TEXT", msg.get("type"));

        // ① 消息落库
        assertEquals(1, db.count("select count(*) from sy_direct_message where conv_id = ?", convId));
        // ② 会话的最近一条 = 这条（列表排序靠它）
        Map<String, Object> conv = db.repo.findConversationById(convId);
        assertEquals(msgId, ((Number) conv.get("last_msg_id")).longValue());
        // ③ 发的人自己算已读（否则自己的消息在自己这边显示未读）
        assertEquals(msgId, db.repo.readPosition(convId, "alice"));
        // ④ 收件人未读 +1
        assertEquals(1, db.unread.of("bob", convId));
        assertEquals(1, db.unread.total("bob"));
    }

    @Test
    void 收件人实时收到msg事件() {
        db.repo.insertFriend("alice", "bob");
        db.chat.send("alice", "bob", "在吗", "TEXT", null);

        List<Map<String, Object>> events = db.pusher.ofTypeTo("msg", "bob");
        assertEquals(1, events.size());
        Map<?, ?> m = (Map<?, ?>) events.get(0).get("message");
        assertEquals("在吗", m.get("body"));
        assertEquals("alice", m.get("fromId"));
    }

    @Test
    void 不能给自己发() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "alice", "自言自语", "TEXT", null));
        assertEquals("INVALID_TARGET", codeOf(e));
    }

    @Test
    void 空消息与超长消息() {
        db.repo.insertFriend("alice", "bob");

        assertEquals("INVALID_BODY", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "bob", "   ", "TEXT", null))));
        assertEquals("BODY_TOO_LONG", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "bob", "字".repeat(2001), "TEXT", null))));

        // 恰好 2000 字（按码点）要能发
        assertDoesNotThrow(() -> db.chat.send("alice", "bob", "字".repeat(2000), "TEXT", null));
    }

    @Test
    void 敏感词打码后再入库() {
        SocialTestSupport dirty = SocialTestSupport.fresh("广告");
        dirty.user("alice", "爱丽丝");
        dirty.user("bob", "王同学");
        dirty.repo.insertFriend("alice", "bob");

        Map<String, Object> msg = dirty.chat.send("alice", "bob", "这是广告内容", "TEXT", null);

        String body = String.valueOf(msg.get("body"));
        assertFalse(body.contains("广告"), "原文不能落库：" + body);
        assertTrue(body.contains("＊＊") || body.contains("＊"), "应被打码：" + body);
        assertEquals(body, dirty.jdbc.queryForObject(
                "select body from sy_direct_message where id = ?", String.class, msg.get("messageId")));
    }

    @Test
    void AI账号不能被私聊() {
        // ai_deepseek 由 schema-ai.sql 种下，is_bot=1；不能与它成为好友，因此也发不了消息
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "ai_deepseek", "你好", "TEXT", null));
        assertEquals("NOT_FRIEND", codeOf(e));
    }

    @Test
    void 删除好友之后不能再发_但历史消息还在() {
        db.repo.insertFriend("alice", "bob");
        db.chat.send("alice", "bob", "这是删好友之前的消息", "TEXT", null);
        long convId = db.repo.findOrCreateConversation("alice", "bob");

        db.friends.delete("alice", "bob");

        assertEquals("NOT_FRIEND", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.send("alice", "bob", "还能发吗", "TEXT", null))));
        assertEquals(1, db.count("select count(*) from sy_direct_message where conv_id = ?", convId),
                "历史消息必须保留");
    }

    @Test
    void 消息条数与未读随发送累加() {
        db.repo.insertFriend("alice", "bob");
        for (int i = 1; i <= 3; i++) db.chat.send("alice", "bob", "第" + i + "条", "TEXT", null);

        long convId = db.repo.findOrCreateConversation("alice", "bob");
        assertEquals(3, db.count("select count(*) from sy_direct_message where conv_id = ?", convId));
        assertEquals(3, db.unread.of("bob", convId));
        assertEquals(0, db.unread.of("alice", convId), "自己发的不算自己的未读");
    }
}
