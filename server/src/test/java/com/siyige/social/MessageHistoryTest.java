package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 历史分页与断线补拉（验收 #17、#18、#21）。
 *
 * <p>两个游标各有分工：
 * <ul>
 *   <li>{@code beforeId}：向上翻页。**不用 offset** —— 翻页时新消息正在进来，offset 会错位；</li>
 *   <li>{@code afterId}：补拉。WebSocket 断了多久都无所谓，一条 SQL 补齐（不漏的保证）。</li>
 * </ul>
 */
class MessageHistoryTest {

    private SocialTestSupport db;
    private long convId;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.repo.insertFriend("alice", "bob");
        convId = db.repo.findOrCreateConversation("alice", "bob");
    }

    private static String codeOf(IllegalArgumentException e) {
        String m = e.getMessage();
        int i = m.indexOf(':');
        return i > 0 ? m.substring(0, i) : m;
    }

    private List<Map<String, Object>> items(Object page) {
        return SocialTestSupport.castList(((Map<?, ?>) page).get("items"));
    }

    /** 发 n 条消息，返回它们的 id（正序）。 */
    private long[] sendN(int n) {
        long[] ids = new long[n];
        for (int i = 0; i < n; i++) {
            Map<String, Object> m = db.chat.send("alice", "bob", "第" + (i + 1) + "条", "TEXT", null);
            ids[i] = ((Number) m.get("messageId")).longValue();
        }
        return ids;
    }

    @Test
    void 打开会话返回最近一页_按时间正序() {
        long[] ids = sendN(5);

        Map<String, Object> page = db.chat.history("bob", convId, null);
        List<Map<String, Object>> items = items(page);

        assertEquals(5, items.size());
        assertEquals(ids[0], ((Number) items.get(0).get("id")).longValue(), "最早的在最上面");
        assertEquals(ids[4], ((Number) items.get(4).get("id")).longValue(), "最新的在最下面（前端滚到底）");
    }

    @Test
    void 超过一页时hasMore为真_且只返回20条() {
        sendN(25);

        Map<String, Object> page = db.chat.history("bob", convId, null);
        assertEquals(20, items(page).size());
        assertEquals(true, page.get("hasMore"));
    }

    @Test
    void 向上翻页_不重不漏() {
        long[] ids = sendN(25);

        // 第一页（最近 20 条）
        Map<String, Object> p1 = db.chat.history("bob", convId, null);
        List<Map<String, Object>> it1 = items(p1);
        long oldestInP1 = ((Number) it1.get(0).get("id")).longValue();

        // 按游标翻上一页
        Map<String, Object> p2 = db.chat.history("bob", convId, oldestInP1);
        List<Map<String, Object>> it2 = items(p2);

        assertEquals(5, it2.size(), "剩下最早那 5 条");
        assertEquals(false, p2.get("hasMore"));
        assertEquals(ids[0], ((Number) it2.get(0).get("id")).longValue());

        // 两页拼起来 = 全部，且没有任何重复
        java.util.Set<Long> all = new java.util.HashSet<>();
        for (Map<String, Object> m : it1) assertTrue(all.add(((Number) m.get("id")).longValue()), "第一页内部不能重复");
        for (Map<String, Object> m : it2) assertTrue(all.add(((Number) m.get("id")).longValue()), "两页之间不能重复");
        assertEquals(25, all.size(), "合起来正好 25 条，不漏");
    }

    @Test
    void 翻页期间来了新消息_旧游标依然正确() {
        long[] ids = sendN(21);
        Map<String, Object> p1 = db.chat.history("bob", convId, null);
        long cursor = ((Number) items(p1).get(0).get("id")).longValue();

        // 翻页过程中又来了 3 条新消息
        sendN(3);

        List<Map<String, Object>> p2 = items(db.chat.history("bob", convId, cursor));
        assertEquals(ids[0], ((Number) p2.get(0).get("id")).longValue(), "游标翻页不受新消息影响");
        assertTrue(p2.stream().allMatch(m -> ((Number) m.get("id")).longValue() < cursor));
    }

    @Test
    void 补拉只返回afterId之后的消息_且正序() {
        long[] ids = sendN(5);

        Map<String, Object> res = db.chat.syncAfter("bob", convId, ids[2]);
        List<Map<String, Object>> items = items(res);

        assertEquals(2, items.size(), "只补 4、5 两条");
        assertEquals(ids[3], ((Number) items.get(0).get("id")).longValue());
        assertEquals(ids[4], ((Number) items.get(1).get("id")).longValue(), "补拉也按正序，直接追加即可");
    }

    @Test
    void 补拉没有新消息时返回空数组() {
        long[] ids = sendN(3);
        assertEquals(0, items(db.chat.syncAfter("bob", convId, ids[2])).size());
    }

    @Test
    void 读别人的会话_403语义_不返回内容() {
        sendN(1);

        // 第三个人不是这个会话的成员
        db.user("carol", "王小明");
        assertEquals("NOT_MEMBER", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.history("carol", convId, null))));
        assertEquals("NOT_MEMBER", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.syncAfter("carol", convId, 0))));
    }

    @Test
    void 会话不存在_404语义() {
        assertEquals("CONV_NOT_FOUND", codeOf(assertThrows(IllegalArgumentException.class,
                () -> db.chat.history("bob", 999999, null))));
    }
}
