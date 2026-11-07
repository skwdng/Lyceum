package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 未读：Redis 缓存是读路径，数据库的「已读位置」是真相（验收 #15、#16）。
 *
 * <p>这里测的其实是一组**一致性**问题：
 * <ul>
 *   <li>标已读要按「实际读掉几条」递减，不能一律 -1（用户可能一次滚过 20 条）；</li>
 *   <li>多端一致：手机读了，电脑端读同一份缓存，数字立刻同步；</li>
 *   <li>缓存丢了要能按库自愈（一条聚合 SQL），且只减不增不会出现负数。</li>
 * </ul>
 */
class UnreadTest {

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

    private long send(String from, String body) {
        Map<String, Object> m = db.chat.send(from, "bob".equals(from) ? "alice" : "bob", body, "TEXT", null);
        return ((Number) m.get("messageId")).longValue();
    }

    @Test
    void 只统计不是我发的_且id大于我的已读位置() {
        send("alice", "一");
        send("alice", "二");
        send("bob", "三");          // 我自己发的

        assertEquals(2, db.unread.of("bob", convId));
        assertEquals(1, db.unread.of("alice", convId), "对方也是 2 条里减掉自己那条");
    }

    @Test
    void 标已读到最新_未读清零() {
        send("alice", "一");
        send("alice", "二");

        db.chat.markRead("bob", convId, null);

        assertEquals(0, db.unread.of("bob", convId));
        assertEquals(0, db.unread.total("bob"));
    }

    @Test
    void 标已读到中间某条_只减掉真正读过的部分() {
        long m1 = send("alice", "一");
        long m2 = send("alice", "二");
        send("alice", "三");

        db.chat.markRead("bob", convId, m2);   // 只读到第二条

        assertEquals(1, db.unread.of("bob", convId), "还剩第三条没读");
        assertEquals(m2, db.repo.readPosition(convId, "bob"));

        db.chat.markRead("bob", convId, null); // 再标到最新
        assertEquals(0, db.unread.of("bob", convId));
        assertTrue(m1 > 0);
    }

    @Test
    void 重复标已读不会把未读减成负数() {
        send("alice", "一");
        send("alice", "二");

        db.chat.markRead("bob", convId, null);
        db.chat.markRead("bob", convId, null);
        db.chat.markRead("bob", convId, null);

        assertEquals(0, db.unread.of("bob", convId));
        assertEquals(0, db.unread.total("bob"));
    }

    @Test
    void 多端一致_另一端读到的就是同一份缓存() {
        send("alice", "一");
        send("alice", "二");
        send("alice", "三");
        assertEquals(3, db.unread.total("bob"));

        // 手机端标已读（同一账号，同一份缓存）
        db.chat.markRead("bob", convId, null);

        // 电脑端问角标：应该是 0，不需要自己再算一遍
        assertEquals(0, db.chat.unreadTotal("bob"));
    }

    @Test
    void 已读位置只前进_乱序的旧回执不会把已读打回去() {
        long m1 = send("alice", "一");
        long m2 = send("alice", "二");
        long m3 = send("alice", "三");

        db.repo.updateReadPosition(convId, "bob", m3);
        db.repo.updateReadPosition(convId, "bob", m1);   // 迟到的旧回执
        assertEquals(m3, db.repo.readPosition(convId, "bob"), "不能被打回 m1");
        assertTrue(m2 > 0);
    }

    @Test
    void 缓存丢了_角标按库自愈() {
        send("alice", "一");
        send("alice", "二");
        assertEquals(2, db.chat.unreadTotal("bob"));

        // 模拟 Redis 重启：缓存整块消失
        db.unread.clear("bob");

        assertEquals(2, db.chat.unreadTotal("bob"), "冷启动要能用一条聚合 SQL 重建");
        assertEquals(2, db.unread.of("bob", convId));
    }

    @Test
    void 进会话列表会校准缓存_把错数纠回来() {
        send("alice", "一");
        send("alice", "二");

        // 人为造一个错数（比如某次 Redis 写入失败留下的偏差）
        db.unread.incr("bob", convId);
        db.unread.incr("bob", convId);
        assertEquals(4, db.unread.of("bob", convId));

        // 打开会话列表 → 用库里真值校准
        db.chat.conversations("bob");

        assertEquals(2, db.unread.of("bob", convId), "校准后应与数据库一致");
    }

    @Test
    void 会话列表里的未读与会话数一致() {
        db.user("carol", "王小明");
        db.repo.insertFriend("alice", "carol");
        db.repo.insertFriend("carol", "bob");
        send("alice", "给 bob 一");
        send("alice", "给 bob 二");
        db.chat.send("carol", "bob", "给 bob 的另一条", "TEXT", null);

        Map<String, Object> page = db.chat.conversations("bob");
        List<Map<String, Object>> items = SocialTestSupport.castList(page.get("items"));

        int total = items.stream().mapToInt(m -> ((Number) m.get("unread")).intValue()).sum();
        assertEquals(3, total);
        assertEquals(3, ((Number) page.get("unreadTotal")).intValue());
        assertEquals(total, db.chat.unreadTotal("bob"));
    }

    @Test
    void 没有会话的新用户角标为0_不是null() {
        db.user("newbie", "新来的");
        assertEquals(0, db.chat.unreadTotal("newbie"));
    }
}
