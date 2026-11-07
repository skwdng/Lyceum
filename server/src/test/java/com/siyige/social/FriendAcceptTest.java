package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 接受 / 拒绝 / **双向互发自动成好友**（决策 6 + 验收 #9~#11）。
 *
 * <p>双向那条是整个模块最容易写错的地方：如果只判断「我已经发过」就 409，
 * 两个互相想加的人会永远卡在「已发送」状态，谁都点不了接受。
 */
class FriendAcceptTest {

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
    void 接受后成为好友_请求置ACCEPTED_请求方收到通知与实时事件() {
        db.friends.request("alice", "bob", null);
        long reqId = db.firstPendingId("bob");

        db.friends.accept("bob", reqId);

        assertTrue(db.isFriend("alice", "bob"));
        assertEquals("ACCEPTED", db.requestStatus(reqId));

        List<Map<String, Object>> toAlice = db.notificationsOf("alice");
        assertEquals(1, toAlice.size(), "只有请求方收到 FRIEND_ACCEPTED");
        assertEquals("FRIEND_ACCEPTED", toAlice.get(0).get("type"));

        assertEquals(1, db.pusher.ofTypeTo("friend_accepted", "alice").size());
        assertEquals(0, db.pusher.ofTypeTo("friend_accepted", "bob").size(),
                "接受方不需要再被推一条");
    }

    @Test
    void 拒绝只改状态_请求方收不到任何通知() {
        db.friends.request("alice", "bob", null);
        long reqId = db.firstPendingId("bob");
        db.counter.getClass(); // 保持夹具引用，便于阅读

        db.friends.reject("bob", reqId);

        assertEquals("REJECTED", db.requestStatus(reqId));
        assertFalse(db.isFriend("alice", "bob"));
        assertEquals(0, db.count("select count(*) from sy_notification where user_id = 'alice' and type = 'FRIEND_ACCEPTED'"),
                "拒绝不打扰对方（决策）");
        assertEquals(0, db.pusher.ofType("friend_accepted").size());
    }

    @Test
    void 双向互发请求_直接成为好友_两条都ACCEPTED_双方各一条通知() {
        // A 先发给 B
        db.friends.request("alice", "bob", "我先加你");
        long firstReq = db.firstPendingId("bob");

        // B 也点「加 A」→ 不应该 409，应该直接成好友
        Map<String, Object> out = db.friends.request("bob", "alice", "我也正想加你");

        assertEquals("ACCEPTED", out.get("status"), "反向 PENDING 存在时必须自动成好友");
        assertTrue(db.isFriend("alice", "bob"));

        // 两条请求都 ACCEPTED
        assertEquals("ACCEPTED", db.requestStatus(firstReq));
        long secondReq = ((Number) out.get("requestId")).longValue();
        assertEquals("ACCEPTED", db.requestStatus(secondReq), "本次请求也留痕并置 ACCEPTED");

        // 双方各收到一条 FRIEND_ACCEPTED
        assertEquals(1, db.count("select count(*) from sy_notification where user_id = 'alice' and type = 'FRIEND_ACCEPTED'"));
        assertEquals(1, db.count("select count(*) from sy_notification where user_id = 'bob' and type = 'FRIEND_ACCEPTED'"));
        assertEquals(1, db.pusher.ofTypeTo("friend_accepted", "alice").size());
        assertEquals(1, db.pusher.ofTypeTo("friend_accepted", "bob").size());
    }

    @Test
    void 不能接受别人的请求() {
        db.friends.request("alice", "bob", null);
        long reqId = db.firstPendingId("bob");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.accept("alice", reqId));   // 这条是 alice 发出的，只有 bob 能处理
        assertEquals("NOT_REQUEST_TARGET", codeOf(e));
        assertFalse(db.isFriend("alice", "bob"));
    }

    @Test
    void 已处理的请求不能再接受() {
        db.friends.request("alice", "bob", null);
        long reqId = db.firstPendingId("bob");
        db.friends.accept("bob", reqId);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.accept("bob", reqId));
        assertEquals("REQUEST_NOT_PENDING", codeOf(e));
    }

    @Test
    void 不存在的请求() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.accept("bob", 9999));
        assertEquals("REQUEST_NOT_FOUND", codeOf(e));
    }

    @Test
    void 重复接受也不会插出第二行好友关系() {
        db.friends.request("alice", "bob", null);
        long reqId = db.firstPendingId("bob");
        db.friends.accept("bob", reqId);

        // 再插一次（模拟并发/重放）：insertFriend 幂等，不应该 500
        assertDoesNotThrow(() -> db.repo.insertFriend("bob", "alice"));
        assertEquals(1, db.count("select count(*) from sy_friend"));
    }
}
