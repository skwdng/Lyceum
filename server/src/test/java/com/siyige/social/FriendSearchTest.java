package com.siyige.social;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 搜人（验收 #1~#4）：精确命中优先、昵称模糊兜底、bot 永不出现、状态字段正确。
 */
class FriendSearchTest {

    private SocialTestSupport db;

    @BeforeEach
    void setUp() {
        db = SocialTestSupport.fresh();
        db.user("alice", "爱丽丝");
        db.user("bob", "王同学");
        db.user("carol", "王小明");
        db.user("dave", "王大锤");
    }

    private List<Map<String, Object>> items(Object page) {
        return SocialTestSupport.castList(((Map<?, ?>) page).get("items"));
    }

    @Test
    void 按用户id精确命中_即使昵称完全不同() {
        List<Map<String, Object>> items = items(db.friends.search("alice", "bob"));
        assertEquals(1, items.size());
        assertEquals("bob", items.get(0).get("id"));
        assertEquals("王同学", items.get(0).get("name"));
    }

    @Test
    void 按昵称前缀模糊命中_最多10条() {
        for (int i = 0; i < 15; i++) db.user("w" + i, "王五" + i);

        List<Map<String, Object>> items = items(db.friends.search("alice", "王"));
        assertTrue(items.size() <= 10, "上限 10 条，实际 " + items.size());
        assertTrue(items.stream().allMatch(m -> String.valueOf(m.get("name")).startsWith("王")));
    }

    @Test
    void AI账号不出现在任何搜索结果里() {
        // schema-ai.sql 种下的 ai_deepseek（昵称 DeepSeek）必须被 is_bot=0 过滤掉
        assertEquals(0, items(db.friends.search("alice", "deepseek")).size());
        assertEquals(0, items(db.friends.search("alice", "ai_deepseek")).size());
        assertEquals(0, items(db.friends.search("alice", "DeepSeek")).size());
    }

    @Test
    void 结果里带足前端画按钮需要的状态() {
        db.friends.request("alice", "bob", null);          // alice 已发给 bob
        db.friends.request("dave", "alice", null);         // dave 已发给 alice

        List<Map<String, Object>> items = items(db.friends.search("alice", "bob"));
        Map<String, Object> bob = items.stream().filter(m -> "bob".equals(m.get("id"))).findFirst().orElseThrow();
        assertEquals(false, bob.get("isFriend"));
        assertEquals(true, bob.get("hasPendingRequest"), "我已发出 → 按钮显示「已发送」");
        assertEquals(false, bob.get("pendingIn"));

        List<Map<String, Object>> items2 = items(db.friends.search("alice", "dave"));
        Map<String, Object> dave = items2.get(0);
        assertEquals(false, dave.get("hasPendingRequest"));
        assertEquals(true, dave.get("pendingIn"), "对方已发给我 → 按钮显示「接受」");

        List<Map<String, Object>> items3 = items(db.friends.search("alice", "alice"));
        assertEquals(true, items3.get(0).get("isSelf"));
    }

    @Test
    void 空查询返回空数组() {
        assertEquals(0, items(db.friends.search("alice", "")).size());
        assertEquals(0, items(db.friends.search("alice", null)).size());
        assertEquals(0, items(db.friends.search("alice", "   ")).size());
    }

    @Test
    void 搜不到的人返回空数组而不是报错() {
        assertEquals(0, items(db.friends.search("alice", "查无此人")).size());
    }
}
