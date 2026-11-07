package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 发好友请求的各条分支（决策 3/5/6/9 + 验收 #5~#9、#35）。
 *
 * <p>这一层最容易漏的是「状态机」：PENDING / ACCEPTED / REJECTED 必须互斥，
 * 而且**被拒绝过的人可以重新发**（不是永久拉黑）。
 */
class FriendRequestTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
    }

    /** 从异常里取错误码（服务层消息形如 "CODE: 中文"）。 */
    private static String codeOf(IllegalArgumentException e) {
        String m = e.getMessage();
        int i = m.indexOf(':');
        return i > 0 ? m.substring(0, i) : m;
    }

    @Test
    void 正常发请求_落库为PENDING_对方收到通知与实时事件() {
        Map<String, Object> out = db.friends.request("alice", "bob", "一起打辩论？");

        assertEquals("PENDING", out.get("status"));
        long reqId = ((Number) out.get("requestId")).longValue();
        assertEquals("PENDING", db.requestStatus(reqId));

        // 角标要先断言：notifications.list() 会把本页标成已读并递减计数器
        assertEquals(1, db.counter.get("bob"), "角标 +1");

        // 通知对方一条 FRIEND_REQUEST
        List<Map<String, Object>> toBob = db.notificationsOf("bob");
        assertEquals(1, toBob.size());
        assertEquals("FRIEND_REQUEST", toBob.get(0).get("type"));

        // 实时事件（V3 之前由 no-op 实现接住，这里用记录器验证"事件已发出"）
        List<Map<String, Object>> pushed = db.pusher.ofTypeTo("friend_request", "bob");
        assertEquals(1, pushed.size());
        assertEquals(reqId, ((Number) pushed.get(0).get("requestId")).longValue());
    }

    @Test
    void 不能加自己() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.request("alice", "alice", null));
        assertEquals("CANT_ADD_SELF", codeOf(e));
        assertEquals(0, db.count("select count(*) from sy_friend_request"));
    }

    @Test
    void 目标不存在() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.request("alice", "nobody", null));
        assertEquals("USER_NOT_FOUND", codeOf(e));
    }

    @Test
    void 已经是好友不能再发() {
        db.repo.insertFriend("alice", "bob");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.request("alice", "bob", null));
        assertEquals("ALREADY_FRIEND", codeOf(e));
    }

    @Test
    void 重复发同向请求_409语义() {
        db.friends.request("alice", "bob", null);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.request("alice", "bob", null));
        assertEquals("PENDING_EXISTS", codeOf(e));
        assertEquals(1, db.count("select count(*) from sy_friend_request where status = 'PENDING'"),
                "不能插出第二条 PENDING");
    }

    @Test
    void 不能加AI账号() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> db.friends.request("alice", "ai_deepseek", null));
        assertEquals("TARGET_IS_BOT", codeOf(e));
    }

    @Test
    void 附言超过100字_静默截断到100() {
        String longNote = "字".repeat(150);
        db.friends.request("alice", "bob", longNote);

        String saved = db.jdbc.queryForObject(
                "select note from sy_friend_request where from_id = 'alice'", String.class);
        assertEquals(100, saved.codePointCount(0, saved.length()), "按码点截到 100（中文不会被切坏）");

        // 通知里的附言也是截断后的（不能让 200 字的 note 撑爆通知文案）
        Map<String, Object> it = db.notificationsOf("bob").get(0);
        assertTrue(String.valueOf(it.get("text")).length() < 200);
    }

    @Test
    void 附言为空时不落空串() {
        db.friends.request("alice", "bob", "   ");
        assertNull(db.jdbc.queryForObject(
                "select note from sy_friend_request where from_id = 'alice'", String.class));
    }

    @Test
    void 被拒绝后可以重新发请求() {
        db.friends.request("alice", "bob", null);
        long first = db.firstPendingId("bob");
        db.friends.reject("bob", first);
        assertEquals("REJECTED", db.requestStatus(first));

        Map<String, Object> again = db.friends.request("alice", "bob", "再试一次");
        assertEquals("PENDING", again.get("status"), "旧 REJECTED 不挡新请求");
        assertNotEquals(first, ((Number) again.get("requestId")).longValue());
    }
}
