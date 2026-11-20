package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 邀请组队（验收 #34~#37）：INVITE 是**消息的一种 type**，不是新表。
 *
 * <p>这样做的好处全都体现在这些用例里：好友校验、建会话、未读 +1、实时推送、
 * 历史分页、离线补拉 —— 全部自动复用，一行额外代码都不用写。
 */
class InviteMessageTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.repo.insertFriend("alice", "bob");
    }

    private static String codeOf(IllegalArgumentException e) {
        String m = e.getMessage();
        int i = m.indexOf(':');
        return i > 0 ? m.substring(0, i) : m;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> payloadOf(Object raw) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readValue(String.valueOf(raw), Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("payload 不是合法 JSON: " + raw, e);
        }
    }

    @Test
    void 发出后落库为INVITE_带payload() {
        Map<String, Object> msg = db.chat.sendInvite("alice", "bob", "SY-8F3K", "AI 会不会取代辩手");

        assertEquals("INVITE", msg.get("type"));
        assertEquals("INVITE", msg.get("id") == null ? "INVITE" : "INVITE");   // 只是确认没抛异常

        Map<String, Object> row = db.jdbc.queryForMap(
                "select type, body, payload from sy_direct_message where id = ?", msg.get("messageId"));
        assertEquals("INVITE", row.get("type"));

        Map<String, Object> p = payloadOf(row.get("payload"));
        assertEquals("SY-8F3K", p.get("roomCode"));
        assertEquals("AI 会不会取代辩手", p.get("topicTitle"));

        // 卡片上也要有人能读的一句话（列表摘要、通知文案都靠它）
        assertTrue(String.valueOf(row.get("body")).contains("SY-8F3K"));
    }

    @Test
    void 房间号统一转大写() {
        Map<String, Object> msg = db.chat.sendInvite("alice", "bob", " sy-8f3k ", "题");
        Map<String, Object> row = db.jdbc.queryForMap(
                "select payload from sy_direct_message where id = ?", msg.get("messageId"));
        assertEquals("SY-8F3K", payloadOf(row.get("payload")).get("roomCode"));
    }

    @Test
    void 房间号格式不对_400语义() {
        for (String bad : new String[]{null, "", "  ", "8F3K", "ROOM-1", "SY-", "SY-中文", "SY-8F3K!"}) {
            assertEquals("INVALID_ROOM_CODE", codeOf(assertThrows(IllegalArgumentException.class,
                    () -> db.chat.sendInvite("alice", "bob", bad, "题"))), "应该拒绝：" + bad);
        }
        assertEquals(0, db.count("select count(*) from sy_direct_message"), "一条都不该落库");
    }

    @Test
    void 非好友不能发邀请() {
        db.user("carol", "王小明");
        assertEquals("NOT_FRIEND", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.sendInvite("alice", "carol", "SY-8F3K", "题"))));
    }

    @Test
    void 邀请也会让对方未读加一并实时推送() {
        db.chat.sendInvite("alice", "bob", "SY-8F3K", "题");

        long convId = db.repo.findOrCreateConversation("alice", "bob");
        assertEquals(1, db.unread.of("bob", convId));

        List<Map<String, Object>> events = db.pusher.ofTypeTo("msg", "bob");
        assertEquals(1, events.size(), "邀请和被邀请者收到的也是 msg 帧，前端按 type 画卡片");
        Map<?, ?> m = (Map<?, ?>) events.get(0).get("message");
        assertEquals("INVITE", m.get("type"));
        assertNotNull(m.get("payload"));
    }

    @Test
    void 接受方能在聊天记录里翻到这张卡片() {
        db.chat.sendInvite("alice", "bob", "SY-8F3K", "题");
        long convId = db.repo.findOrCreateConversation("alice", "bob");

        Map<String, Object> page = db.chat.history("bob", convId, null);
        List<Map<String, Object>> items = SocialTestSupport.castList(page.get("items"));

        assertEquals(1, items.size());
        assertEquals("INVITE", items.get(0).get("type"));
        assertEquals("SY-8F3K", payloadOf(items.get(0).get("payload")).get("roomCode"));
    }

    @Test
    void 离线期间发的邀请_上线补拉也能拿到() {
        long convId = db.repo.findOrCreateConversation("alice", "bob");
        db.chat.sendInvite("alice", "bob", "SY-8F3K", "题");

        Map<String, Object> res = db.chat.syncAfter("bob", convId, 0);
        List<Map<String, Object>> items = SocialTestSupport.castList(res.get("items"));
        assertEquals(1, items.size());
        assertEquals("INVITE", items.get(0).get("type"));
    }

    @Test
    void 辩题标题过长会截断_不留半个字() {
        String longTitle = "辩".repeat(120);
        Map<String, Object> msg = db.chat.sendInvite("alice", "bob", "SY-8F3K", longTitle);

        Map<String, Object> row = db.jdbc.queryForMap(
                "select payload from sy_direct_message where id = ?", msg.get("messageId"));
        String title = String.valueOf(payloadOf(row.get("payload")).get("topicTitle"));
        assertEquals(ChatService.INVITE_TITLE_MAX, title.codePointCount(0, title.length()));
    }

    @Test
    void 标题为空也能发_卡片只显示房间号() {
        Map<String, Object> msg = db.chat.sendInvite("alice", "bob", "SY-8F3K", null);
        Map<String, Object> row = db.jdbc.queryForMap(
                "select body, payload from sy_direct_message where id = ?", msg.get("messageId"));

        assertEquals("", payloadOf(row.get("payload")).get("topicTitle"));
        assertTrue(String.valueOf(row.get("body")).contains("SY-8F3K"));
        assertFalse(String.valueOf(row.get("body")).contains("（）"), "空标题不该留个空括号");
    }
}
