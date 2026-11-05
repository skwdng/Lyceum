package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 评论：楼层派生、打码、作者权限、统计重算。 */
class CommentServiceTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final SensitiveWordMasker masker = new SensitiveWordMasker(List.of("加微信"));
    private final com.siyige.community.MuteGuard muteGuard = mock(com.siyige.community.MuteGuard.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final com.siyige.community.ai.AiQueue aiQueue = mock(com.siyige.community.ai.AiQueue.class);
    private final CommentService service = new CommentService(repo, masker, muteGuard, notifications, aiQueue);

    private static Map<String, Object> postRow() {
        Map<String, Object> post = new HashMap<>();
        post.put("id", 1L);
        post.put("status", 1);
        post.put("like_count", 0);
        post.put("view_count", 0);
        post.put("created_at", System.currentTimeMillis());
        return post;
    }

    private static Map<String, Object> commentRow(long id, long postId, Long rootId, String userId) {
        Map<String, Object> c = new HashMap<>();
        c.put("id", id);
        c.put("post_id", postId);
        c.put("root_id", rootId);
        c.put("user_id", userId);
        c.put("status", 1);
        return c;
    }

    private void stubStats(long postId) {
        when(repo.lockPost(postId)).thenReturn(postRow());
        when(repo.countComments(postId)).thenReturn(1L);
        when(repo.maxCommentAt(postId)).thenReturn(null);
    }

    private static Map<String, Object> body(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    @Test
    void 回复帖子_root为空_回复对象字段为空() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString())).thenReturn(11L);
        stubStats(1L);

        Map<String, Object> out = service.create("u1", 1L, body("body", "第一楼"));

        ArgumentCaptor<Long> root = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> replyId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<String> replyUser = ArgumentCaptor.forClass(String.class);
        verify(repo).insertComment(eq(1L), eq("u1"), root.capture(), eq("POST"), replyId.capture(), replyUser.capture(), eq("第一楼"));
        assertNull(root.getValue());
        assertNull(replyId.getValue());
        assertNull(replyUser.getValue());
        assertEquals(11L, out.get("commentId"));
    }

    @Test
    void 回复楼_root等于目标楼id() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.findComment(5L)).thenReturn(commentRow(5L, 1L, null, "u2"));
        when(repo.insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString())).thenReturn(12L);
        stubStats(1L);

        service.create("u1", 1L, body("body", "回复楼", "replyObjectType", "COMMENT", "replyObjectCommentId", 5));

        ArgumentCaptor<Long> root = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> replyId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<String> replyUser = ArgumentCaptor.forClass(String.class);
        verify(repo).insertComment(eq(1L), eq("u1"), root.capture(), eq("COMMENT"), replyId.capture(), replyUser.capture(), eq("回复楼"));
        assertEquals(5L, root.getValue());
        assertEquals(5L, replyId.getValue());
        assertEquals("u2", replyUser.getValue());
    }

    @Test
    void 回复楼中楼_仍挂在同一root下_不产生第三层() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.findComment(9L)).thenReturn(commentRow(9L, 1L, 5L, "u3"));
        when(repo.insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString())).thenReturn(13L);
        stubStats(1L);

        service.create("u1", 1L, body("body", "回复楼中楼", "replyObjectType", "COMMENT", "replyObjectCommentId", 9));

        ArgumentCaptor<Long> root = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Long> replyId = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<String> replyUser = ArgumentCaptor.forClass(String.class);
        verify(repo).insertComment(eq(1L), eq("u1"), root.capture(), eq("COMMENT"), replyId.capture(), replyUser.capture(), eq("回复楼中楼"));
        assertEquals(5L, root.getValue(), "root_id 必须是所属楼，不能是楼中楼 id");
        assertEquals(9L, replyId.getValue());
        assertEquals("u3", replyUser.getValue());
    }

    @Test
    void 目标评论属于其他帖子_拒绝且不插入() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.findComment(7L)).thenReturn(commentRow(7L, 2L, null, "u2"));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.create("u1", 1L, body("body", "跨帖回复", "replyObjectType", "COMMENT", "replyObjectCommentId", 7)));
        assertTrue(ex.getMessage().startsWith("COMMENT_NOT_FOUND"));
        verify(repo, never()).insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString());
    }

    @Test
    void 正文含敏感词_落库为全角星且无原文() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString())).thenReturn(14L);
        stubStats(1L);

        service.create("u1", 1L, body("body", "请加微信聊"));

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(repo).insertComment(eq(1L), eq("u1"), any(), eq("POST"), any(), any(), text.capture());
        assertEquals("请＊＊＊聊", text.getValue());
        assertFalse(text.getValue().contains("加微信"));
    }

    @Test
    void 非作者删除_抛NOT_AUTHOR且不软删除() {
        when(repo.findComment(5L)).thenReturn(commentRow(5L, 1L, null, "u2"));
        when(repo.findPost(1L)).thenReturn(postRow());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.delete("u1", 5L));
        assertTrue(ex.getMessage().startsWith("NOT_AUTHOR"));
        verify(repo, never()).softDeleteComment(anyLong());
        verify(repo, never()).softDeleteReplies(anyLong());
    }

    @Test
    void 作者删除楼_连带软删除楼中楼并重算统计() {
        when(repo.findComment(5L)).thenReturn(commentRow(5L, 1L, null, "u1"));
        when(repo.findPost(1L)).thenReturn(postRow());
        stubStats(1L);

        service.delete("u1", 5L);

        verify(repo).softDeleteComment(5L);
        verify(repo).softDeleteReplies(5L);
        verify(repo).updatePostStats(eq(1L), anyLong(), any(), anyDouble());
    }

    @Test
    void 作者删除楼中楼_只删这一条_楼保留() {
        when(repo.findComment(9L)).thenReturn(commentRow(9L, 1L, 5L, "u1"));
        when(repo.findPost(1L)).thenReturn(postRow());
        stubStats(1L);

        service.delete("u1", 9L);

        verify(repo).softDeleteComment(9L);
        verify(repo, never()).softDeleteReplies(anyLong());
        verify(repo).updatePostStats(eq(1L), anyLong(), any(), anyDouble());
    }

    @Test
    void 插入后必须触发帖子统计更新() {
        when(repo.findPost(1L)).thenReturn(postRow());
        when(repo.insertComment(anyLong(), anyString(), any(), anyString(), any(), any(), anyString())).thenReturn(15L);
        stubStats(1L);

        service.create("u1", 1L, body("body", "统计测试"));

        verify(repo).lockPost(1L);
        verify(repo).countComments(1L);
        verify(repo).maxCommentAt(1L);
        verify(repo).updatePostStats(eq(1L), eq(1L), isNull(), anyDouble());
    }
}
