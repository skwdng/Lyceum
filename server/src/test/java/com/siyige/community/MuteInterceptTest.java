package com.siyige.community;

import com.siyige.auth.AuthException;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * A3：禁言拦截集合（决策 D10）。
 *
 * <p>拦：发帖 / 评论 / **编辑帖子** / 点赞。
 * 不拦：删除自己的帖或评论、取消点赞、浏览——删除是净化行为，不能被禁言卡住。
 *
 * <p>这一组测的是"拦截点确实在 Service 入口、且只拦该拦的"，SQL 细节由
 * {@link MuteGuardTest} 覆盖。
 */
class MuteInterceptTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final SensitiveWordMasker masker = new SensitiveWordMasker(List.of());
    private final CommunityViewService views = mock(CommunityViewService.class);
    private final MuteGuard guard = mock(MuteGuard.class);

    private final NotificationService notifications = mock(NotificationService.class);
    private final com.siyige.community.ai.AiQueue aiQueue = mock(com.siyige.community.ai.AiQueue.class);
    private final CommunityService posts = new CommunityService(repo, masker, views, guard, notifications, aiQueue);
    private final CommentService comments = new CommentService(repo, masker, guard, notifications, aiQueue);
    private final LikeService likes = new LikeService(repo, guard, notifications);

    private void muted() {
        doThrow(AuthException.muted("2026-11-10 12:00")).when(guard).assertNotMuted(anyString());
    }

    private static Map<String, Object> ownPost() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 1L);
        row.put("author_id", "zhang");
        row.put("status", 1);
        return row;
    }

    private static Map<String, Object> newPostBody() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("type", "CHAT");
        b.put("title", "标题");
        b.put("body", "正文");
        return b;
    }

    // ---------- 该拦的 ----------

    @Test
    void 被禁言不能发帖() {
        muted();

        AuthException e = assertThrows(AuthException.class, () -> posts.create("zhang", newPostBody()));

        assertEquals("MUTED", e.code());
        verify(repo, never()).insertPost(anyString(), anyString(), anyString(), anyString(),
                anyString(), any(), anyDouble());
    }

    @Test
    void 被禁言不能编辑帖子() {
        muted();

        Map<String, Object> b = new LinkedHashMap<>();
        b.put("title", "改标题");

        AuthException e = assertThrows(AuthException.class, () -> posts.update("zhang", 1L, b));

        assertEquals("MUTED", e.code());
        verify(repo, never()).updatePost(anyLong(), any());
    }

    @Test
    void 被禁言不能发评论() {
        muted();

        Map<String, Object> b = new LinkedHashMap<>();
        b.put("body", "一条评论");

        AuthException e = assertThrows(AuthException.class, () -> comments.create("zhang", 1L, b));

        assertEquals("MUTED", e.code());
        verify(repo, never()).insertComment(anyLong(), anyString(), any(), anyString(),
                any(), any(), anyString());
    }

    @Test
    void 被禁言不能点赞帖子() {
        muted();

        AuthException e = assertThrows(AuthException.class, () -> likes.likePost("zhang", 1L));

        assertEquals("MUTED", e.code());
        verify(repo, never()).insertLike(anyString(), anyString(), anyLong());
    }

    @Test
    void 被禁言不能点赞评论() {
        muted();

        assertThrows(AuthException.class, () -> likes.likeComment("zhang", 9L));
        verify(repo, never()).insertLike(anyString(), anyString(), anyLong());
    }

    // ---------- 不该拦的 ----------

    @Test
    void 被禁言仍然可以删除自己的帖子() {
        muted();
        when(repo.row(1L)).thenReturn(ownPost());

        assertDoesNotThrow(() -> posts.delete("zhang", 1L));

        verify(repo).softDeletePost(1L);
        verify(guard, never()).assertNotMuted(anyString());
    }

    @Test
    void 被禁言仍然可以取消点赞() {
        muted();

        assertDoesNotThrow(() -> likes.unlikePost("zhang", 1L));
        assertDoesNotThrow(() -> likes.unlikeComment("zhang", 9L));

        verify(repo).deleteLike("zhang", "POST", 1L);
        verify(repo).deleteLike("zhang", "COMMENT", 9L);
        verify(guard, never()).assertNotMuted(anyString());
    }

    @Test
    void 没被禁言时写操作正常放行() {
        when(repo.row(1L)).thenReturn(ownPost());

        Map<String, Object> b = new LinkedHashMap<>();
        b.put("title", "改标题");
        posts.update("zhang", 1L, b);

        verify(guard).assertNotMuted("zhang");
        verify(repo).updatePost(eq(1L), any());
    }
}
