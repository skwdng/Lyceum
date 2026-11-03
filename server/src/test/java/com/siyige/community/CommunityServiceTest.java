package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 发帖/编辑：命中敏感词改为「全角＊替换后落库」，且只有作者能改。 */
class CommunityServiceTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final SensitiveWordMasker masker = new SensitiveWordMasker(List.of("加微信", "代写"));
    private final CommunityViewService views = mock(CommunityViewService.class);
    private final com.siyige.community.MuteGuard muteGuard = mock(com.siyige.community.MuteGuard.class);
    private final CommunityService service = new CommunityService(repo, masker, views, muteGuard);

    private static Map<String, Object> postRow(String authorId) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", 1L);
        row.put("author_id", authorId);
        row.put("status", 1);
        row.put("title", "旧标题");
        row.put("body", "旧正文");
        row.put("comment_count", 0);
        row.put("like_count", 0);
        row.put("view_count", 0);
        row.put("created_at", System.currentTimeMillis());
        return row;
    }

    @Test
    void create_标题正文分别打码_摘要来自替换后的正文() {
        when(repo.insertPost(anyString(), anyString(), anyString(), anyString(), anyString(), any(), anyDouble()))
                .thenReturn(7L);

        Map<String, Object> body = new HashMap<>();
        body.put("type", "CHAT");
        body.put("title", "代写标题");
        body.put("body", "正文里写了加微信，请加我");

        Map<String, Object> out = service.create("u1", body);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> excerpt = ArgumentCaptor.forClass(String.class);
        verify(repo).insertPost(eq("u1"), eq("CHAT"), title.capture(), text.capture(), excerpt.capture(), isNull(), anyDouble());

        assertEquals("＊＊标题", title.getValue());
        assertEquals("正文里写了＊＊＊，请加我", text.getValue());
        assertTrue(excerpt.getValue().contains("＊＊＊"), "摘要要基于替换后的正文");
        assertFalse(excerpt.getValue().contains("加微信"), "摘要里不能出现原文");
        assertFalse(title.getValue().contains("代写"));
        assertEquals(7L, out.get("postId"));
    }

    @Test
    void create_无命中时内容原样() {
        when(repo.insertPost(anyString(), anyString(), anyString(), anyString(), anyString(), any(), anyDouble()))
                .thenReturn(8L);

        Map<String, Object> body = new HashMap<>();
        body.put("type", "GUIDE");
        body.put("title", "正常标题");
        body.put("body", "正常正文，没有敏感词。");

        service.create("u1", body);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(repo).insertPost(anyString(), anyString(), title.capture(), text.capture(), anyString(), any(), anyDouble());
        assertEquals("正常标题", title.getValue());
        assertEquals("正常正文，没有敏感词。", text.getValue());
    }

    @Test
    void update_只改标题也会打码_且不重算摘要() {
        when(repo.row(1L)).thenReturn(postRow("u1"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("title", "代写标题");
        service.update("u1", 1L, patch);

        ArgumentCaptor<Map<String, Object>> fields = ArgumentCaptor.forClass(Map.class);
        verify(repo).updatePost(eq(1L), fields.capture());
        assertEquals("＊＊标题", fields.getValue().get("title"));
        assertFalse(fields.getValue().containsKey("body"), "没传 body 不应更新正文");
        assertFalse(fields.getValue().containsKey("excerpt"), "只改标题不应重算摘要");
    }

    @Test
    void update_只改正文_摘要同步更新() {
        when(repo.row(1L)).thenReturn(postRow("u1"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("body", "新的正文包含加微信");
        service.update("u1", 1L, patch);

        ArgumentCaptor<Map<String, Object>> fields = ArgumentCaptor.forClass(Map.class);
        verify(repo).updatePost(eq(1L), fields.capture());
        assertFalse(fields.getValue().containsKey("title"));
        assertEquals("新的正文包含＊＊＊", fields.getValue().get("body"));
        String excerpt = String.valueOf(fields.getValue().get("excerpt"));
        assertTrue(excerpt.contains("＊＊＊"));
        assertFalse(excerpt.contains("加微信"));
    }

    @Test
    void update_非作者仍然NOT_AUTHOR_且不触发更新() {
        when(repo.row(1L)).thenReturn(postRow("u2"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("body", "别人想改");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.update("u1", 1L, patch));
        assertTrue(ex.getMessage().startsWith("NOT_AUTHOR"));
        verify(repo, never()).updatePost(anyLong(), anyMap());
    }

    // ==================== 浏览数读时叠加 pending ====================

    private static Map<String, Object> listRow(long id, long viewCount) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", id);
        row.put("type", "CHAT");
        row.put("title", "标题" + id);
        row.put("excerpt", "摘要" + id);
        row.put("body", "正文" + id);
        row.put("author_id", "u1");
        row.put("view_count", viewCount);
        row.put("comment_count", 0);
        row.put("like_count", 0);
        row.put("created_at", System.currentTimeMillis());
        return row;
    }

    @Test
    void list_viewCount等于数据库值加pending增量_且整页只查一次Redis() {
        when(repo.countPosts(any(), any(), any(), any())).thenReturn(2L);
        when(repo.listPosts(any(), any(), any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(List.of(listRow(1L, 7L), listRow(2L, 100L)));
        when(repo.likedPostIds(any(), any())).thenReturn(java.util.Set.of());
        // 帖子 1 有 3 次尚未回写的浏览；帖子 2 没有
        when(views.pendingCounts(any())).thenReturn(Map.of(1L, 3L));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items =
                (List<Map<String, Object>>) service.list(null, null, null, null, null, 1, 20, "u1").get("items");

        assertEquals(10L, items.get(0).get("viewCount"), "数据库 7 + pending 3");
        assertEquals(100L, items.get(1).get("viewCount"), "没有 pending 时等于数据库值");
        // 整页只调用一次，不允许在循环里逐条查
        verify(views, times(1)).pendingCounts(any());
    }

    @Test
    void detail_viewCount等于数据库值加pending增量() {
        when(repo.findPost(1L)).thenReturn(listRow(1L, 42L));
        when(repo.likedPostIds(any(), any())).thenReturn(java.util.Set.of());
        when(views.pendingCounts(any())).thenReturn(Map.of(1L, 5L));

        Map<String, Object> out = service.detail(1L, "u1");

        assertEquals(47L, out.get("viewCount"), "数据库 42 + pending 5");
        assertNotNull(out.get("body"));
        verify(views, times(1)).pendingCounts(any());
    }

    @Test
    void detail_pending查询失败时降级为只显示数据库值() {
        when(repo.findPost(2L)).thenReturn(listRow(2L, 9L));
        when(repo.likedPostIds(any(), any())).thenReturn(java.util.Set.of());
        when(views.pendingCounts(any())).thenReturn(Map.of());   // 服务内部已吞掉异常、返回空 Map

        Map<String, Object> out = service.detail(2L, "u1");

        assertEquals(9L, out.get("viewCount"));
    }
}
