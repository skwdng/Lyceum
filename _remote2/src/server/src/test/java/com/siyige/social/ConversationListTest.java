package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 会话列表（验收 #13、#14）：排序、摘要、未读、以及「没消息的会话也要出现」。
 *
 * <p>排序用 {@code last_msg_id} 而不是时间戳：同一秒发的两条消息时间戳可能相同，
 * id 一定不同 —— 用 id 排永远不会出现两条消息在列表里来回跳。
 */
class ConversationListTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.user("carol", "王小明");
        db.repo.insertFriend("alice", "bob");
        db.repo.insertFriend("alice", "carol");
        db.repo.insertFriend("carol", "bob");
    }

    private List<Map<String, Object>> items(String me) {
        return SocialTestSupport.castList(db.chat.conversations(me).get("items"));
    }

    @Test
    void 按最近消息倒序_新消息的会话顶上去() {
        db.chat.send("alice", "bob", "先跟 bob 说话", "TEXT", null);
        db.chat.send("carol", "alice", "carol 后来居上", "TEXT", null);

        List<Map<String, Object>> list = items("alice");
        assertEquals(2, list.size());
        assertEquals("carol", ((Map<?, ?>) list.get(0).get("peer")).get("id"), "最新的排最前");

        // 再给 bob 发一条，bob 应该顶上来
        db.chat.send("bob", "alice", "bob 又说话了", "TEXT", null);
        assertEquals("bob", ((Map<?, ?>) items("alice").get(0).get("peer")).get("id"));
    }

    @Test
    void 每行带对端昵称_最近一条摘要_是否我发的() {
        db.chat.send("alice", "bob", "晚上一起打一局？", "TEXT", null);

        Map<String, Object> row = items("bob").get(0);
        assertEquals("alice", ((Map<?, ?>) row.get("peer")).get("id"));
        assertEquals("爱丽丝", ((Map<?, ?>) row.get("peer")).get("name"));

        @SuppressWarnings("unchecked")
        Map<String, Object> last = (Map<String, Object>) row.get("last");
        assertEquals("晚上一起打一局？", last.get("preview"));
        assertEquals(false, last.get("fromMe"), "对 bob 来说这条是别人发的");
        assertEquals("TEXT", last.get("type"));
    }

    @Test
    void 我自己发的消息fromMe为真() {
        db.chat.send("alice", "bob", "我先说的", "TEXT", null);
        @SuppressWarnings("unchecked")
        Map<String, Object> last = (Map<String, Object>) items("alice").get(0).get("last");
        assertEquals(true, last.get("fromMe"));
    }

    @Test
    void 只有会话没有消息时last为null也能出现在列表里() {
        // 会话已经建好（比如对方打开了聊天窗但还没说话）
        db.repo.findOrCreateConversation("alice", "bob");

        List<Map<String, Object>> list = items("alice");
        assertEquals(1, list.size());
        assertNull(list.get(0).get("last"));
        assertEquals(0, ((Number) list.get(0).get("unread")).intValue());
    }

    @Test
    void 摘要过长会截断并带省略号() {
        db.chat.send("alice", "bob", "很长的消息".repeat(20), "TEXT", null);

        @SuppressWarnings("unchecked")
        Map<String, Object> last = (Map<String, Object>) items("bob").get(0).get("last");
        String preview = String.valueOf(last.get("preview"));
        assertTrue(preview.endsWith("…"), preview);
        assertTrue(preview.codePointCount(0, preview.length()) <= 41, "40 字 + 省略号");
    }

    @Test
    void 换行不会把列表撑开() {
        db.chat.send("alice", "bob", "第一行\n第二行", "TEXT", null);
        @SuppressWarnings("unchecked")
        Map<String, Object> last = (Map<String, Object>) items("bob").get(0).get("last");
        assertFalse(String.valueOf(last.get("preview")).contains("\n"));
    }

    @Test
    void 看不到别人的会话() {
        db.chat.send("alice", "bob", "只有他俩能看到", "TEXT", null);

        assertEquals(0, items("carol").size(), "carol 与 alice 还没聊过，不该看到别人的会话");
    }

    @Test
    void 未读总数与各行之和一致() {
        db.chat.send("alice", "bob", "一", "TEXT", null);
        db.chat.send("alice", "bob", "二", "TEXT", null);
        db.chat.send("carol", "bob", "三", "TEXT", null);

        Map<String, Object> page = db.chat.conversations("bob");
        List<Map<String, Object>> list = SocialTestSupport.castList(page.get("items"));
        int sum = list.stream().mapToInt(m -> ((Number) m.get("unread")).intValue()).sum();

        assertEquals(3, sum);
        assertEquals(3, ((Number) page.get("unreadTotal")).intValue(), "角标就是这些数字的和，不另存一份");
    }
}
