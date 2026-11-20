package com.siyige.community;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 翻页已读（方案 §5 与决策 K）：**只把本页标已读、计数按本页实际条数递减**。
 *
 * <p>被钉住的四个行为：
 * <ol>
 *   <li>返回的是**标记前**状态（本页未读行 read=false，前端才画得出深底色）</li>
 *   <li>翻一页只减一页的条数；翻完所有页角标才归零（field 被删）</li>
 *   <li>重复拉同一页不再递减（第二次实际标记 0 条）</li>
 *   <li>Redis field 不存在（重启过）→ 计数不动、接口不报错（决策 G，禁止回源兜底）</li>
 * </ol>
 */
class NotificationReadPageTest {

    private NotifyTestSupport db;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
    }

    /** 造 n 条未读（同时把计数加到位，模拟真实历史）。 */
    private void unread(String userId, int n) {
        for (int i = 1; i <= n; i++) {
            db.notify(userId, "COMMENT_POST", "u-bob", "王同学", (long) i, 1L, "第" + i + "条", null);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> items(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }

    @Test
    void 只标本页_计数按本页实际条数递减() {
        unread("u-alice", 25);
        assertEquals(25, db.counter.get("u-alice"));

        Map<String, Object> page1 = db.service.list("u-alice", 1, 10);

        assertEquals(10, items(page1).size());
        for (Map<String, Object> it : items(page1)) {
            assertEquals(false, it.get("read"), "返回的是标记前状态，本页仍是未读");
        }
        assertEquals(25L, page1.get("total"));
        assertEquals(15, db.counter.get("u-alice"), "25 - 10 = 15");
        assertEquals(15L, db.repo.countUnreadInDb("u-alice"), "数据库里也确实只剩 15 条未读");
    }

    @Test
    void 翻完所有页角标才归零_field被删() {
        unread("u-alice", 25);

        db.service.list("u-alice", 1, 10);
        assertEquals(15, db.counter.get("u-alice"));

        db.service.list("u-alice", 2, 10);
        assertEquals(5, db.counter.get("u-alice"));

        db.service.list("u-alice", 3, 10);
        assertEquals(0, db.counter.get("u-alice"), "最后一页减到 0 -> field 删除（红点消失）");
        assertEquals(0L, db.repo.countUnreadInDb("u-alice"));
    }

    @Test
    void 重复拉同一页不再递减() {
        unread("u-alice", 25);

        db.service.list("u-alice", 1, 10);
        assertEquals(15, db.counter.get("u-alice"));

        Map<String, Object> again = db.service.list("u-alice", 1, 10);

        assertEquals(15, db.counter.get("u-alice"), "第二次实际标记 0 条，计数不动");
        for (Map<String, Object> it : items(again)) {
            assertEquals(true, it.get("read"), "已经读过的行，这次返回 read=true（不再加深底色）");
        }
    }

    @Test
    void 已读状态不影响别人() {
        unread("u-alice", 3);
        unread("u-bob", 2);
        assertEquals(2, db.counter.get("u-bob"));

        db.service.list("u-alice", 1, 20);

        assertEquals(0, db.counter.get("u-alice"));
        assertEquals(2, db.counter.get("u-bob"), "A 翻页不许动 B 的角标");
        assertEquals(2L, db.repo.countUnreadInDb("u-bob"), "也不许动 B 的未读行");
        assertEquals(0L, db.repo.countUnreadInDb("u-alice"));
    }

    @Test
    void Redis重启后field不存在_计数不动且不报错() {
        // 直接写库、不加计数 —— 模拟「Redis 重启丢了 field，但库里还有 5 条未读」
        for (int i = 1; i <= 5; i++) {
            db.repo.insert("u-alice", "COMMENT_POST", "u-bob", "王同学", (long) i, 1L, "x", null);
        }
        assertEquals(0, db.counter.get("u-alice"));

        Map<String, Object> page = db.service.list("u-alice", 1, 20);

        assertEquals(5, items(page).size());
        assertEquals(0, db.counter.get("u-alice"), "field 不在 -> 计数保持 0，**不回源查库**（决策 G）");
        assertEquals(0L, db.repo.countUnreadInDb("u-alice"), "但数据库的 is_read 照常被标掉");
    }

    @Test
    void 分页参数被夹紧() {
        unread("u-alice", 3);

        Map<String, Object> page0 = db.service.list("u-alice", 0, 1000);
        assertEquals(1, page0.get("page"), "page 夹到 >=1");
        assertEquals(50, page0.get("size"), "size 夹到 <=50");

        Map<String, Object> pageNeg = db.service.list("u-alice", -3, -5);
        assertEquals(1, pageNeg.get("page"));
        assertEquals(1, pageNeg.get("size"), "size 夹到 >=1");
    }

    @Test
    void 空列表也是合法响应() {
        Map<String, Object> page = db.service.list("u-alice", 1, 20);
        assertEquals(0, items(page).size());
        assertEquals(0L, page.get("total"));
        assertEquals(0, db.counter.get("u-alice"));
    }
}
