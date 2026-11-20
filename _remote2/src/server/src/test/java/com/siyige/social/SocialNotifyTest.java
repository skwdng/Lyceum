package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 好友类通知的文案与跳转（决策 11）。
 *
 * <p>两个必须钉住的点：
 * <ul>
 *   <li>文案要能读出「谁、要干什么」——附言要跟出来，但不能把通知撑爆；</li>
 *   <li>{@code link.view} 必须是 {@code friends}：这批通知与帖子无关，
 *       落到「我的」页会让人一脸问号。</li>
 * </ul>
 */
class SocialNotifyTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
    }

    private Map<String, Object> firstNotification(String userId) {
        List<Map<String, Object>> items = SocialTestSupport.castList(
                db.notifications.list(userId, 1, 20).get("items"));
        assertFalse(items.isEmpty(), "应该有通知");
        return items.get(0);
    }

    @Test
    void 好友请求通知_带附言() {
        db.friends.request("alice", "bob", "上次那局打得不错");

        Map<String, Object> it = firstNotification("bob");
        assertEquals("FRIEND_REQUEST", it.get("type"));
        String text = String.valueOf(it.get("text"));
        assertTrue(text.contains("爱丽丝"), text);
        assertTrue(text.contains("想加你为好友"), text);
        assertTrue(text.contains("上次那局打得不错"), "附言要跟出来：" + text);
    }

    @Test
    void 好友请求通知_没有附言时不出冒号() {
        db.friends.request("alice", "bob", null);

        String text = String.valueOf(firstNotification("bob").get("text"));
        assertEquals("爱丽丝 想加你为好友", text);
    }

    @Test
    void 成为好友通知的文案() {
        db.friends.request("alice", "bob", null);
        db.friends.accept("bob", db.firstPendingId("bob"));

        String text = String.valueOf(firstNotification("alice").get("text"));
        assertEquals("王同学 和你成为了好友", text);
    }

    @Test
    void 好友类通知的link指向好友页而不是我的页() {
        db.friends.request("alice", "bob", null);

        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) firstNotification("bob").get("link");
        assertEquals("friends", link.get("view"));
        assertNull(link.get("postId"));
        assertNull(link.get("commentId"));
    }

    @Test
    void 通知角标按条累加() {
        db.friends.request("alice", "bob", null);
        assertEquals(1, db.counter.get("bob"));
        assertEquals(1, db.notifications.unreadCount("bob"));

        db.friends.accept("bob", db.firstPendingId("bob"));
        assertEquals(1, db.counter.get("alice"), "接受方也收到一条");
    }
}
