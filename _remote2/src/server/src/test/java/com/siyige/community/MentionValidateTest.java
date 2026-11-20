package com.siyige.community;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * @ 提及的反向校验（决策 1/3）：**只认 userId**，其余一律静默丢弃。
 *
 * <p>被钉住的规则：
 * <ol>
 *   <li>id 不存在 / 不是真实账号 → 丢</li>
 *   <li>该 id 的昵称没有以 {@code @昵称} 出现在正文里 → 丢（防止伪造/过期提交）</li>
 *   <li>去重、最多 10 个（第 11 个起丢）</li>
 *   <li>自己 @ 自己 → 不发</li>
 * </ol>
 */
class MentionValidateTest {

    private NotifyTestSupport db;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
        db.user("u-carol", "卡罗尔");
        db.user("u-dave", "戴维");
    }

    private long mentionCount(String userId) {
        Long n = db.jdbc.queryForObject(
                "select count(*) from sy_notification where user_id = ? and type = 'MENTION'", Long.class, userId);
        return n == null ? 0L : n;
    }

    @Test
    void 合法at_给被提及的人各发一条() {
        long postId = db.post("u-alice", "一个帖子");
        long commentId = db.comment(postId, "u-alice", "正文");

        db.service.onMentions(postId, commentId, "u-bob",
                List.of("u-alice", "u-carol"), "同意 @爱丽丝 和 @卡罗尔 的说法");

        assertEquals(1L, mentionCount("u-alice"));
        assertEquals(1L, mentionCount("u-carol"));
        assertEquals(0L, mentionCount("u-bob"), "发起人不该给自己发");
        assertEquals(2, db.counter.get("u-alice") + db.counter.get("u-carol"));
    }

    @Test
    void 不存在的id_静默丢弃() {
        long postId = db.post("u-alice", "帖子");

        db.service.onMentions(postId, 1L, "u-bob",
                List.of("u-ghost", "u-alice"), "hello @爱丽丝");

        assertEquals(1L, mentionCount("u-alice"), "只有真实存在的那一个收到");
    }

    @Test
    void 昵称没出现在正文里_静默丢弃() {
        long postId = db.post("u-alice", "帖子");

        // 提交了 u-carol，但正文里只 @ 了爱丽丝 —— 卡罗尔不该收到
        db.service.onMentions(postId, 1L, "u-bob",
                List.of("u-alice", "u-carol"), "只 @爱丽丝 一个人");

        assertEquals(1L, mentionCount("u-alice"));
        assertEquals(0L, mentionCount("u-carol"), "正文里没有 @卡罗尔，就不发（决策 3）");
    }

    @Test
    void 自己at自己_不发() {
        long postId = db.post("u-alice", "帖子");

        db.service.onMentions(postId, 1L, "u-bob", List.of("u-bob"), "@王同学 我自己");

        assertEquals(0L, mentionCount("u-bob"));
        assertEquals(0, db.counter.get("u-bob"));
    }

    @Test
    void 超过十个_只发前十个() {
        // 造 12 个人
        List<String> ids = new ArrayList<>();
        StringBuilder body = new StringBuilder();
        for (int i = 1; i <= 12; i++) {
            String id = "u-m" + i;
            db.user(id, "成员" + i);
            ids.add(id);
            body.append("@成员").append(i).append(" ");
        }
        long postId = db.post("u-alice", "帖子");

        db.service.onMentions(postId, 1L, "u-bob", ids, body.toString());

        long total = db.jdbc.queryForObject(
                "select count(*) from sy_notification where type = 'MENTION'", Long.class);
        assertEquals(10L, total, "一次最多 10 个（决策 3）");
        assertEquals(1L, mentionCount("u-m10"), "前 10 个都发到了");
        assertEquals(0L, mentionCount("u-m11"), "第 11 个起丢弃");
    }

    @Test
    void 重复id_只发一条() {
        long postId = db.post("u-alice", "帖子");

        db.service.onMentions(postId, 1L, "u-bob",
                List.of("u-alice", "u-alice", "u-alice"), "@爱丽丝");

        assertEquals(1L, mentionCount("u-alice"), "去重");
        assertEquals(1, db.counter.get("u-alice"), "计数也只加一次");
    }

    @Test
    void 帖子里的at_跳转只到帖子() {
        long postId = db.post("u-alice", "帖子正文里 @王同学");

        db.service.onMentions(postId, null, "u-alice", List.of("u-bob"), "帖子正文里 @王同学 你好");

        Map<String, Object> page = db.service.list("u-bob", 1, 10);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
        assertEquals(1, items.size());

        Map<String, Object> it = items.get(0);
        assertEquals("MENTION", it.get("type"));
        assertTrue(String.valueOf(it.get("text")).contains("在帖子里 @ 了你"), it.get("text").toString());
        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) it.get("link");
        assertEquals("community", link.get("view"));
        assertEquals(postId, link.get("postId"));
        assertNull(link.get("commentId"), "发帖里的 @ 只跳到帖子");
    }

    @Test
    void 评论里的at_跳转到该楼层() {
        long postId = db.post("u-alice", "帖子");
        long commentId = db.comment(postId, "u-alice", "评论里 @王同学");

        db.service.onMentions(postId, commentId, "u-alice", List.of("u-bob"), "评论里 @王同学 你看");

        Map<String, Object> page = db.service.list("u-bob", 1, 10);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
        Map<String, Object> it = items.get(0);
        assertTrue(String.valueOf(it.get("text")).contains("在评论里 @ 了你"), it.get("text").toString());
        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) it.get("link");
        assertEquals(commentId, link.get("commentId"), "评论里的 @ 要能跳到那一楼（V3 用）");
    }

    @Test
    void 非真实账号的行不算候选_也不会被at到() {
        // sy_user 里存在但 account 为空 = 历史数据（u1 / gXXXX），不该能被 @
        db.jdbc.update("insert into sy_user(id, name) values('u-legacy', '老数据')");
        long postId = db.post("u-alice", "帖子");

        db.service.onMentions(postId, 1L, "u-bob", List.of("u-legacy"), "@老数据 你好");

        assertEquals(0L, mentionCount("u-legacy"), "没有 account 的历史行不参与 @");
    }

    @Test
    void 空或非列表入参_不报错也不发() {
        long postId = db.post("u-alice", "帖子");

        assertDoesNotThrow(() -> db.service.onMentions(postId, 1L, "u-bob", null, "x"));
        assertDoesNotThrow(() -> db.service.onMentions(postId, 1L, "u-bob", "", "x"));
        assertDoesNotThrow(() -> db.service.onMentions(postId, 1L, "u-bob", List.of(), "x"));
        assertEquals(0L, db.jdbc.queryForObject("select count(*) from sy_notification", Long.class));
    }
}
