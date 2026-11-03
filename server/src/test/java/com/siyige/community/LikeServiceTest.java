package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 点赞：幂等、计数、负数保护、热度重算与 404。 */
class LikeServiceTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final LikeService service = new LikeService(repo);

    private static Map<String, Object> postRow(long likeCount) {
        Map<String, Object> post = new HashMap<>();
        post.put("id", 1L);
        post.put("comment_count", 3);
        post.put("like_count", likeCount);
        post.put("view_count", 10);
        post.put("created_at", System.currentTimeMillis());
        return post;
    }

    private static Map<String, Object> commentRow(long likeCount) {
        Map<String, Object> c = new HashMap<>();
        c.put("id", 9L);
        c.put("post_id", 1L);
        c.put("like_count", likeCount);
        c.put("status", 1);
        return c;
    }

    @Test
    void 首次点赞帖子_count加一() {
        when(repo.lockPostForLike(1L)).thenReturn(postRow(5));
        when(repo.insertLike("u1", "POST", 1L)).thenReturn(1);

        service.likePost("u1", 1L);

        ArgumentCaptor<Double> hot = ArgumentCaptor.forClass(Double.class);
        verify(repo).updatePostLikeStats(eq(1L), eq(6L), hot.capture());
        assertTrue(hot.getValue() > 0, "帖子点赞必须重算 hot_score");
    }

    @Test
    void 重复点赞帖子_不重复计数() {
        when(repo.lockPostForLike(1L)).thenReturn(postRow(5));
        when(repo.insertLike("u1", "POST", 1L)).thenReturn(0);

        service.likePost("u1", 1L);

        verify(repo, never()).updatePostLikeStats(anyLong(), anyLong(), anyDouble());
    }

    @Test
    void 取消点赞帖子_count减一() {
        when(repo.lockPostForLike(1L)).thenReturn(postRow(5));
        when(repo.deleteLike("u1", "POST", 1L)).thenReturn(1);

        service.unlikePost("u1", 1L);

        verify(repo).updatePostLikeStats(eq(1L), eq(4L), anyDouble());
    }

    @Test
    void 取消不存在的点赞_计数不变() {
        when(repo.lockPostForLike(1L)).thenReturn(postRow(5));
        when(repo.deleteLike("u1", "POST", 1L)).thenReturn(0);

        service.unlikePost("u1", 1L);

        verify(repo, never()).updatePostLikeStats(anyLong(), anyLong(), anyDouble());
    }

    @Test
    void 计数不会减成负数() {
        when(repo.lockPostForLike(1L)).thenReturn(postRow(0));
        when(repo.deleteLike("u1", "POST", 1L)).thenReturn(1);

        service.unlikePost("u1", 1L);

        verify(repo).updatePostLikeStats(eq(1L), eq(0L), anyDouble());
    }

    @Test
    void 首次点赞评论_不重算帖子热度() {
        when(repo.lockCommentForLike(9L)).thenReturn(commentRow(2));
        when(repo.findPost(1L)).thenReturn(postRow(0));
        when(repo.insertLike("u1", "COMMENT", 9L)).thenReturn(1);

        service.likeComment("u1", 9L);

        verify(repo).updateCommentLikeCount(9L, 3L);
        verify(repo, never()).updatePostLikeStats(anyLong(), anyLong(), anyDouble());
        verify(repo, never()).lockPostForLike(anyLong());
    }

    @Test
    void 重复点赞评论_计数不变() {
        when(repo.lockCommentForLike(9L)).thenReturn(commentRow(2));
        when(repo.findPost(1L)).thenReturn(postRow(0));
        when(repo.insertLike("u1", "COMMENT", 9L)).thenReturn(0);

        service.likeComment("u1", 9L);

        verify(repo, never()).updateCommentLikeCount(anyLong(), anyLong());
    }

    @Test
    void 取消评论点赞_计数减一() {
        when(repo.lockCommentForLike(9L)).thenReturn(commentRow(2));
        when(repo.findPost(1L)).thenReturn(postRow(0));
        when(repo.deleteLike("u1", "COMMENT", 9L)).thenReturn(1);

        service.unlikeComment("u1", 9L);

        verify(repo).updateCommentLikeCount(9L, 1L);
        verify(repo, never()).updatePostLikeStats(anyLong(), anyLong(), anyDouble());
    }

    @Test
    void 点赞不存在的帖子或评论_抛404() {
        when(repo.lockPostForLike(404L)).thenReturn(null);
        IllegalArgumentException p = assertThrows(IllegalArgumentException.class, () -> service.likePost("u1", 404L));
        assertTrue(p.getMessage().startsWith("POST_NOT_FOUND"));

        when(repo.lockCommentForLike(404L)).thenReturn(null);
        IllegalArgumentException c = assertThrows(IllegalArgumentException.class, () -> service.likeComment("u1", 404L));
        assertTrue(c.getMessage().startsWith("COMMENT_NOT_FOUND"));
    }

    @Test
    void 评论所属帖子已删除_拒绝点赞() {
        when(repo.lockCommentForLike(9L)).thenReturn(commentRow(2));
        when(repo.findPost(1L)).thenReturn(null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.likeComment("u1", 9L));
        assertTrue(ex.getMessage().startsWith("COMMENT_NOT_FOUND"));
        verify(repo, never()).insertLike(anyString(), anyString(), anyLong());
    }

    @Test
    void controller_点赞成功返回204且不读响应体() throws Exception {
        CommunityService community = mock(CommunityService.class);
        CommentService comments = mock(CommentService.class);
        LikeService likes = mock(LikeService.class);
        CommunityViewService views = mock(CommunityViewService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CommunityController(community, comments, likes, views)).build();

        // 身份改由 UserContext 提供（JwtAuthFilter 在真实链路里填好；这里直接塞）
        com.siyige.auth.UserContext.set("u1");
        try {
            mvc.perform(post("/api/community/posts/1/like"))
                    .andExpect(status().isNoContent());
            mvc.perform(delete("/api/community/posts/1/like"))
                    .andExpect(status().isNoContent());
            mvc.perform(post("/api/community/comments/9/like"))
                    .andExpect(status().isNoContent());
            mvc.perform(delete("/api/community/comments/9/like"))
                    .andExpect(status().isNoContent());
        } finally {
            com.siyige.auth.UserContext.clear();
        }

        verify(likes).likePost("u1", 1L);
        verify(likes).unlikePost("u1", 1L);
        verify(likes).likeComment("u1", 9L);
        verify(likes).unlikeComment("u1", 9L);
    }
}
