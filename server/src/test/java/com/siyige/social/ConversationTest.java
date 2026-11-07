package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 会话表的「有则取、无则建」与字典序（方案 §2.4）。
 *
 * <p>两个必须钉死的点：
 * <ul>
 *   <li><b>字典序</b>：{@code (A,B)} 与 {@code (B,A)} 必须落到同一行，
 *       否则同两个人之间会出现两条会话，消息被劈成两半；</li>
 *   <li><b>并发兜底</b>：两边同时第一次发消息时会各插一次，撞唯一键不能报错，
 *       回查即可（这里用「已经存在一行」来模拟那个分支）。</li>
 * </ul>
 */
class ConversationTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
    }

    @Test
    void 一对人只有一行_与传入顺序无关() {
        long a = db.repo.findOrCreateConversation("alice", "bob");
        long b = db.repo.findOrCreateConversation("bob", "alice");

        assertEquals(a, b, "谁当第一个参数都必须是同一行");
        assertEquals(1, db.count("select count(*) from sy_conversation"));

        Map<String, Object> conv = db.repo.findConversationById(a);
        assertEquals("alice", conv.get("user_a"), "user_a 存字典序小的那个");
        assertEquals("bob", conv.get("user_b"));
    }

    @Test
    void 重复调用不会建出第二行() {
        for (int i = 0; i < 5; i++) db.repo.findOrCreateConversation("alice", "bob");
        assertEquals(1, db.count("select count(*) from sy_conversation"));
    }

    @Test
    void 已经存在会话时直接回查_不抛唯一键异常() {
        // 先手插一行（模拟"另一个线程刚建好"），再走 findOrCreate
        db.jdbc.update("insert into sy_conversation(user_a, user_b) values ('alice','bob')");
        long id = db.repo.findOrCreateConversation("alice", "bob");
        assertTrue(id > 0);
        assertEquals(1, db.count("select count(*) from sy_conversation"));
    }

    @Test
    void 不同的人之间是不同会话() {
        db.user("carol", "王小明");
        long ab = db.repo.findOrCreateConversation("alice", "bob");
        long ac = db.repo.findOrCreateConversation("alice", "carol");
        assertNotEquals(ab, ac);
        assertEquals(2, db.count("select count(*) from sy_conversation"));
    }

    @Test
    void 新会话的已读位置从0开始() {
        long convId = db.repo.findOrCreateConversation("alice", "bob");
        assertEquals(0, db.repo.readPosition(convId, "alice"));
        assertEquals(0, db.repo.readPosition(convId, "bob"));
    }

    @Test
    void 找对端() {
        long convId = db.repo.findOrCreateConversation("alice", "bob");
        Map<String, Object> conv = db.repo.findConversationById(convId);
        assertEquals("bob", SocialRepo.peerOf(conv, "alice"));
        assertEquals("alice", SocialRepo.peerOf(conv, "bob"));
    }
}
