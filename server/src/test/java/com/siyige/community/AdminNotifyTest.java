package com.siyige.community;

import com.siyige.admin.BanRepo;
import com.siyige.admin.BanService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * V3：管理员侧三类通知（删内容 / 禁言 / 封禁）与「解禁也通知」。
 *
 * <p>钉住的行为：
 * <ul>
 *   <li>删内容 → 作者收 POST_DELETED / COMMENT_DELETED，**带理由**，link 能跳回去</li>
 *   <li>禁言 → MUTED，note = 「至 yyyy-MM-dd HH:mm，理由：xxx」</li>
 *   <li>解禁 → UNMUTED（决策：解除禁言要通知）</li>
 *   <li>封禁 / 解封 → BANNED / UNBANNED（link 指向「我的」）</li>
 *   <li>取不到作者时不发、也不抛异常</li>
 * </ul>
 */
class AdminNotifyTest {

    private NotifyTestSupport db;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-alice", "爱丽丝");
        db.user("u-bob", "王同学");
    }

    @SuppressWarnings("unchecked")
    private java.util.List<Map<String, Object>> items(String userId) {
        Map<String, Object> page = db.service.list(userId, 1, 20);
        return (java.util.List<Map<String, Object>>) page.get("items");
    }

    private Map<String, Object> only(String userId, String type) {
        return items(userId).stream().filter(x -> type.equals(x.get("type"))).findFirst().orElse(null);
    }

    // ==================== 删内容 ====================

    @Test
    void 帖子被管理员删_作者收到带理由的通知() {
        long postId = db.post("u-alice", "论 AI 是否会取代辩手");

        db.service.onContentDeleted("POST", postId, "u-alice", "含广告");

        // ⚠️ 顺序：list() 会把本页标已读并递减角标，所以计数必须在读列表**之前**断言
        assertEquals(1, db.counter.get("u-alice"));
        Map<String, Object> it = only("u-alice", "POST_DELETED");
        assertNotNull(it);
        assertEquals("你的帖子《论 AI 是否会取代辩手》被管理员删除，理由：含广告", it.get("text"));
        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) it.get("link");
        assertEquals("community", link.get("view"));
        assertEquals(postId, link.get("postId"));
        assertNull(link.get("commentId"));
    }

    @Test
    void 评论被管理员删_作者收到通知且能跳回原帖楼层() {
        long postId = db.post("u-alice", "一个帖子");
        long commentId = db.comment(postId, "u-bob", "这是会被删的评论");

        db.service.onContentDeleted("COMMENT", commentId, "u-bob", null);

        Map<String, Object> it = only("u-bob", "COMMENT_DELETED");
        assertNotNull(it);
        assertEquals("你的评论「这是会被删的评论」被管理员删除", it.get("text"));
        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) it.get("link");
        assertEquals(postId, link.get("postId"));
        assertEquals(commentId, link.get("commentId"), "评论被删也要能跳回它所在的那一楼");
    }

    @Test
    void 取不到作者时不发通知也不抛异常() {
        assertDoesNotThrow(() -> db.service.onContentDeleted("POST", 999L, null, "理由"));
        assertDoesNotThrow(() -> db.service.onContentDeleted("POST", 999L, "", "理由"));
        assertEquals(0L, db.jdbc.queryForObject("select count(*) from sy_notification", Long.class));
    }

    // ==================== 禁言（真 BanService + 真 BanRepo） ====================

    @Test
    void 禁言_收MUTED带到期时间与理由() {
        BanService bans = new BanService(new BanRepo(db.jdbc), db.service);

        bans.ban("u-bob", 3, "刷屏", 7L);

        assertEquals(1, db.counter.get("u-bob"));
        Map<String, Object> it = only("u-bob", "MUTED");
        assertNotNull(it, "被禁言的人应收到 MUTED");
        String text = String.valueOf(it.get("text"));
        assertTrue(text.startsWith("你被社区禁言：至 "), text);
        assertTrue(text.contains("理由：刷屏"), text);
    }

    @Test
    void 解禁_收UNMUTED() {
        BanService bans = new BanService(new BanRepo(db.jdbc), db.service);
        bans.ban("u-bob", 1, null, 7L);

        bans.unban("u-bob", 7L);

        Map<String, Object> it = only("u-bob", "UNMUTED");
        assertNotNull(it, "解除禁言要通知（用户明确要求）");
        assertEquals("你的社区禁言已被解除", it.get("text"));
    }

    @Test
    void 本来就没禁言时解禁不发通知() {
        BanService bans = new BanService(new BanRepo(db.jdbc), db.service);

        bans.unban("u-bob", 7L);

        assertNull(only("u-bob", "UNMUTED"), "没有生效中的禁言就别发「已解除」");
    }

    // ==================== 全站封禁 / 解封 ====================

    @Test
    void 封禁与解封都发通知_跳转到我的() {
        db.service.onBanned("u-bob", 7L, "违规内容");
        db.service.onUnbanned("u-bob", 7L);

        assertEquals(2, db.counter.get("u-bob"));
        Map<String, Object> banned = only("u-bob", "BANNED");
        assertNotNull(banned);
        assertEquals("你的账号被全站封禁，理由：违规内容", banned.get("text"));
        @SuppressWarnings("unchecked")
        Map<String, Object> link = (Map<String, Object>) banned.get("link");
        assertEquals("me", link.get("view"), "与内容无关的通知点进去看「我的」");
        assertNull(link.get("postId"));

        Map<String, Object> unbanned = only("u-bob", "UNBANNED");
        assertNotNull(unbanned);
        assertEquals("你的账号已解封", unbanned.get("text"));
    }

    @Test
    void 禁言note的拼装() {
        assertEquals("至 2026-11-11 22:00，理由：刷屏", NotificationService.composeNote("2026-11-11 22:00", "刷屏"));
        assertEquals("至 2026-11-11 22:00", NotificationService.composeNote("2026-11-11 22:00", null));
        assertEquals("理由：刷屏", NotificationService.composeNote(null, "刷屏"));
        assertNull(NotificationService.composeNote(null, "  "));
    }

    @Test
    void 超长理由被截断到列宽以内() {
        String longReason = "理由".repeat(200);         // 400 字
        db.service.onBanned("u-bob", 7L, longReason);

        String note = String.valueOf(db.field("sy_notification", "note", "type = 'BANNED'"));
        assertTrue(note.codePointCount(0, note.length()) <= 200, "note 列宽 200");
    }
}
