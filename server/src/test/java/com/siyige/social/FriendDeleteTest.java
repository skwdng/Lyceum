package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 好友列表与删除（验收 #34）。
 *
 * <p>删除的关键是「一行关系代表双向」：删掉那一行，两边同时不再是好友；
 * 但历史消息（V2 起）不跟着删。
 */
class FriendDeleteTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.user("carol", "王小明");
        db.repo.insertFriend("alice", "bob");
    }

    private static String codeOf(IllegalArgumentException e) {
        String m = e.getMessage();
        int i = m.indexOf(':');
        return i > 0 ? m.substring(0, i) : m;
    }

    private List<Map<String, Object>> friendsOf(String me) {
        return SocialTestSupport.castList(db.friends.friends(me).get("items"));
    }

    @Test
    void 删除后双方都不再是好友_列表里也消失() {
        assertEquals(1, friendsOf("alice").size());
        assertEquals(1, friendsOf("bob").size());

        db.friends.delete("alice", "bob");

        assertFalse(db.isFriend("alice", "bob"));
        assertEquals(0, friendsOf("alice").size(), "对方列表里也没有我了");
        assertEquals(0, friendsOf("bob").size());
        assertEquals(0, db.count("select count(*) from sy_friend"));
    }

    @Test
    void 任何一方发起删除效果相同() {
        db.friends.delete("bob", "alice");     // 反向删也一样
        assertFalse(db.isFriend("alice", "bob"));
    }

    @Test
    void 删除不是好友的关系() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.delete("alice", "carol"));
        assertEquals("NOT_FRIEND", codeOf(e));
    }

    @Test
    void 删除后可以重新加回来() {
        db.friends.delete("alice", "bob");

        Map<String, Object> out = db.friends.request("alice", "bob", "重新加一下");
        assertEquals("PENDING", out.get("status"), "删除不产生黑名单，可以再发请求");
    }

    @Test
    void 好友列表带昵称与来源时间() {
        List<Map<String, Object>> items = friendsOf("alice");
        assertEquals("bob", items.get(0).get("id"));
        assertEquals("王同学", items.get(0).get("name"));
        assertEquals(false, items.get(0).get("isBot"));
        assertNotNull(items.get(0).get("createdAt"));
    }
}
