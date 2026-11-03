package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A3：用户侧举报（提交 + 我的举报）。
 *
 * <p>打码用真 {@link SensitiveWordMasker}（自带词表），只为验证"举报补充说明也必须打码"。
 */
class ReportServiceTest {

    private final ReportRepo repo = mock(ReportRepo.class);
    private final CommunityRepo community = mock(CommunityRepo.class);
    private final SensitiveWordMasker masker = new SensitiveWordMasker(List.of("广告", "加微信"));
    private final ReportService service = new ReportService(repo, community, masker);

    private static Map<String, Object> post(String authorId, int status) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 7L);
        row.put("author_id", authorId);
        row.put("status", status);
        return row;
    }

    private static Map<String, Object> comment(String userId, int status) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 9L);
        row.put("user_id", userId);
        row.put("status", status);
        return row;
    }

    private static Map<String, Object> body(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    // ==================== 提交成功 ====================

    @Test
    void 举报别人的帖子成功() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists("POST", 7L, "zhang")).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(42L);

        Map<String, Object> out = service.submit("zhang",
                body("targetType", "POST", "targetId", 7, "reason", "SPAM"));

        assertEquals(42L, out.get("reportId"));
        verify(repo).insert(eq("POST"), eq(7L), eq("zhang"), eq("SPAM"), isNull());
    }

    @Test
    void targetType与reason统一转大写_前端传小写也认() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(1L);

        service.submit("zhang", body("targetType", "post", "targetId", "7", "reason", "abuse"));

        verify(repo).insert(eq("POST"), eq(7L), eq("zhang"), eq("ABUSE"), any());
    }

    @Test
    void 举报评论也支持() {
        when(community.findComment(9L)).thenReturn(comment("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(2L);

        Map<String, Object> out = service.submit("zhang",
                body("targetType", "COMMENT", "targetId", 9, "reason", "ILLEGAL"));

        assertEquals(2L, out.get("reportId"));
        verify(repo).insert(eq("COMMENT"), eq(9L), eq("zhang"), eq("ILLEGAL"), isNull());
    }

    @Test
    void 补充说明里的敏感词被打码后才落库() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(3L);

        service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM",
                "detail", "这是广告，加微信聊"));

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(repo).insert(anyString(), anyLong(), anyString(), anyString(), detail.capture());
        assertFalse(detail.getValue().contains("广告"), "敏感词没打码：" + detail.getValue());
        assertFalse(detail.getValue().contains("加微信"), "敏感词没打码：" + detail.getValue());
        assertTrue(detail.getValue().contains("＊"), "应替换成全角＊：" + detail.getValue());
    }

    @Test
    void 不填补充说明时落库为null() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(4L);

        service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "OTHER", "detail", "   "));

        verify(repo).insert(anyString(), anyLong(), anyString(), anyString(), isNull());
    }

    // ==================== 校验 ====================

    @Test
    void 不能举报自己的内容() {
        when(community.findPost(7L)).thenReturn(post("zhang", 1));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM")));
        assertTrue(e.getMessage().startsWith("INVALID_PARAM"));
        verify(repo, never()).insert(anyString(), anyLong(), anyString(), anyString(), any());
    }

    @Test
    void 重复举报返回ALREADY_REPORTED() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists("POST", 7L, "zhang")).thenReturn(true);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM")));
        assertTrue(e.getMessage().startsWith("ALREADY_REPORTED"), e.getMessage());
    }

    @Test
    void 并发撞唯一索引也返回ALREADY_REPORTED() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any()))
                .thenThrow(new DuplicateKeyException("ux_report_once"));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM")));
        assertTrue(e.getMessage().startsWith("ALREADY_REPORTED"), "唯一索引兜底应转成同一个错误码");
    }

    @Test
    void 目标类型只接受POST与COMMENT() {
        for (String bad : new String[]{"USER", "POSTS", "", null}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                    () -> service.submit("zhang", body("targetType", bad, "targetId", 7, "reason", "SPAM")),
                    "应拒绝 targetType=" + bad);
            assertTrue(e.getMessage().startsWith("INVALID_PARAM"));
        }
    }

    @Test
    void 原因必须在白名单内() {
        for (String bad : new String[]{"HATE", "", null}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                    () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", bad)),
                    "应拒绝 reason=" + bad);
            assertTrue(e.getMessage().startsWith("INVALID_PARAM"));
        }
    }

    @Test
    void targetId不合法要拒绝() {
        for (Object bad : new Object[]{0, -1, "abc", null}) {
            assertThrows(IllegalArgumentException.class,
                    () -> service.submit("zhang", body("targetType", "POST", "targetId", bad, "reason", "SPAM")),
                    "应拒绝 targetId=" + bad);
        }
    }

    @Test
    void 补充说明超过500字要拒绝() {
        when(community.findPost(7L)).thenReturn(post("lisi", 1));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM",
                        "detail", "字".repeat(501))));
        assertTrue(e.getMessage().contains("500"), e.getMessage());
    }

    @Test
    void 目标不存在返回对应的NOT_FOUND码() {
        when(community.findPost(7L)).thenReturn(null);
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM")));
        assertTrue(e1.getMessage().startsWith("POST_NOT_FOUND"), e1.getMessage());

        when(community.findComment(9L)).thenReturn(null);
        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "COMMENT", "targetId", 9, "reason", "SPAM")));
        assertTrue(e2.getMessage().startsWith("COMMENT_NOT_FOUND"), e2.getMessage());
    }

    @Test
    void 已被软删除的目标不让举报() {
        // 帖子：findPost 的 SQL 本身带 status = 1，删掉的查不出来 -> null
        when(community.findPost(7L)).thenReturn(null);
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "POST", "targetId", 7, "reason", "SPAM")));
        assertTrue(e1.getMessage().startsWith("POST_NOT_FOUND"), e1.getMessage());

        // 评论：findComment 返回 c.*（含 status），删掉的也在，必须按 status 判
        when(community.findComment(9L)).thenReturn(comment("lisi", 2));
        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> service.submit("zhang", body("targetType", "COMMENT", "targetId", 9, "reason", "SPAM")));
        assertTrue(e2.getMessage().startsWith("COMMENT_NOT_FOUND"), e2.getMessage());
    }

    @Test
    void 帖子行里没有status字段也能举报_不能误判成已删除() {
        // 回归保护：findPost 不 select status，字段取到 null 时不能当成"已删除"
        when(community.findPost(7L)).thenReturn(post("lisi", 1));
        when(repo.exists(anyString(), anyLong(), anyString())).thenReturn(false);
        when(repo.insert(anyString(), anyLong(), anyString(), anyString(), any())).thenReturn(11L);

        Map<String, Object> out = service.submit("zhang",
                body("targetType", "POST", "targetId", 7, "reason", "SPAM"));

        assertEquals(11L, out.get("reportId"));
    }

    // ==================== 我的举报 ====================

    @Test
    void 我的举报返回分页结构与处理状态() {
        when(repo.countMine("zhang")).thenReturn(1L);
        when(repo.listMine(eq("zhang"), anyInt(), anyInt())).thenReturn(List.of(row()));

        Map<String, Object> out = service.listMine("zhang", 1, 20);

        assertEquals(1L, out.get("total"));
        assertEquals(1, out.get("page"));
        assertEquals(20, out.get("size"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(1, items.size());
        Map<String, Object> item = items.get(0);
        assertEquals(5L, item.get("reportId"));
        assertEquals("POST", item.get("targetType"));
        assertEquals("ACCEPTED", item.get("status"));
        assertEquals("DELETE", item.get("action"));
        assertNotNull(item.get("handledAt"), "已处理必须有处理时间");
        assertNotNull(item.get("createdAt"));
    }

    @Test
    void 我的举报分页参数被夹在合理区间() {
        when(repo.countMine(anyString())).thenReturn(0L);
        when(repo.listMine(anyString(), anyInt(), anyInt())).thenReturn(List.of());

        Map<String, Object> out = service.listMine("zhang", 0, 999);
        assertEquals(1, out.get("page"), "page 最小 1");
        assertEquals(50, out.get("size"), "size 最大 50");

        Map<String, Object> out2 = service.listMine("zhang", 2, 0);
        assertEquals(20, out2.get("size"), "size 缺省 20");
    }

    private static Map<String, Object> row() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", 5L);
        r.put("target_type", "POST");
        r.put("target_id", 7L);
        r.put("target_summary", "一个很长的标题");
        r.put("reason", "SPAM");
        r.put("detail", "补充");
        r.put("status", "ACCEPTED");
        r.put("action", "DELETE");
        r.put("created_at", java.sql.Timestamp.valueOf("2026-11-03 10:00:00"));
        r.put("handled_at", java.sql.Timestamp.valueOf("2026-11-03 12:00:00"));
        return r;
    }
}
