package com.siyige.community.ai;

import com.siyige.ai.LlmClient;
import com.siyige.community.CommentService;
import com.siyige.community.CommunityRepo;
import com.siyige.community.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 单条任务处理：三层幂等 + 失败不回复 + 只发一条通知（方案 §3.4 / §12，决策 4 / 7）。
 *
 * <p>最重要的一条：**AI 回复绝不能走 {@code onComment}**，否则一次回答会发两条通知
 * （COMMENT_POST 给帖子作者 + REPLY_COMMENT 给提问者）。这里用 {@code verify(never())} 钉死。
 */
class AiReplyHandlerTest {

    private CommunityRepo repo;
    private CommentService comments;
    private NotificationService notifications;
    private LlmClient llm;
    private StringRedisTemplate redis;
    private ValueOperations<String, String> values;
    private AiReplyHandler handler;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() throws Exception {
        repo = mock(CommunityRepo.class);
        comments = mock(CommentService.class);
        notifications = mock(NotificationService.class);
        llm = mock(LlmClient.class);
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);

        when(redis.opsForValue()).thenReturn(values);
        when(values.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
        when(llm.chat(anyString(), anyString(), anyDouble(), anyInt(), anyInt())).thenReturn("我的看法是……");
        when(comments.createAiComment(anyLong(), any(), any(), anyString(), anyString())).thenReturn(99L);

        Map<String, Object> post = new HashMap<>();
        post.put("id", 7L);
        post.put("title", "论 AI 是否会取代辩手");
        post.put("body", "正文");
        when(repo.findPost(7L)).thenReturn(post);
        when(repo.listRecentForAi(7L, AiReplyHandler.RECENT_LIMIT)).thenReturn(List.of());

        handler = new AiReplyHandler(repo, comments, notifications, llm, redis);
    }

    private Map<String, String> fields(String commentId, String rootId) {
        Map<String, String> f = new HashMap<>();
        f.put("postId", "7");
        f.put("commentId", commentId == null ? "" : commentId);
        f.put("askerId", "u-bob");
        f.put("rootId", rootId == null ? "" : rootId);
        f.put("text", "@DeepSeek 你怎么看");
        return f;
    }

    // ==================== 幂等：结果层 ====================

    @Test
    void 这条评论已经被AI回复过_直接跳过() throws Exception {
        when(repo.countAiReplies(42L)).thenReturn(1L);

        handler.handle("1-0", fields("42", null));

        verifyNoInteractions(llm);
        verify(comments, never()).createAiComment(anyLong(), any(), any(), anyString(), anyString());
        verify(values, never()).setIfAbsent(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void 发帖场景已回复过_直接跳过() throws Exception {
        when(repo.countAiPostReply(7L)).thenReturn(1L);

        handler.handle("2-0", fields("", null));

        verifyNoInteractions(llm);
        verify(comments, never()).createAiComment(anyLong(), any(), any(), anyString(), anyString());
    }

    // ==================== 幂等：并发层 ====================

    @Test
    void 抢不到锁说明别人在处理_跳过() throws Exception {
        when(values.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);

        handler.handle("3-0", fields("42", null));

        verifyNoInteractions(llm);
        // 抢不到锁就不该去删别人的锁
        verify(redis, never()).delete(anyString());
    }

    @Test
    void 抢到锁用的key带commentId且300秒过期() throws Exception {
        handler.handle("4-0", fields("42", null));

        verify(values).setIfAbsent("ai:proc:42", "1", Duration.ofSeconds(300));
    }

    // ==================== 失败不回复（决策 7） ====================

    @Test
    void 模型抛异常_不落库不通知() throws Exception {
        when(llm.chat(anyString(), anyString(), anyDouble(), anyInt(), anyInt()))
                .thenThrow(new IllegalStateException("LLM HTTP 429"));

        assertDoesNotThrow(() -> handler.handle("5-0", fields("42", null)));

        verify(comments, never()).createAiComment(anyLong(), any(), any(), anyString(), anyString());
        verify(notifications, never()).onAiReply(anyLong(), anyLong(), anyString(), anyBoolean());
        verify(redis).delete("ai:proc:42");        // 锁必须释放，否则 5 分钟内不能重试
    }

    @Test
    void 空回复_不落库不通知() throws Exception {
        when(llm.chat(anyString(), anyString(), anyDouble(), anyInt(), anyInt())).thenReturn("   ");

        handler.handle("6-0", fields("42", null));

        verify(comments, never()).createAiComment(anyLong(), any(), any(), anyString(), anyString());
        verify(notifications, never()).onAiReply(anyLong(), anyLong(), anyString(), anyBoolean());
    }

    @Test
    void 帖子已被删_丢弃任务() throws Exception {
        when(repo.findPost(7L)).thenReturn(null);

        handler.handle("7-0", fields("42", null));

        verifyNoInteractions(llm);
        verify(redis).delete("ai:proc:42");
    }

    @Test
    void 字段不完整_直接丢弃() throws Exception {
        Map<String, String> bad = new HashMap<>();
        bad.put("postId", "0");
        bad.put("askerId", "");

        handler.handle("8-0", bad);

        verifyNoInteractions(llm);
        verify(comments, never()).createAiComment(anyLong(), any(), any(), anyString(), anyString());
    }

    // ==================== 正常路径 ====================

    @Test
    void 正常回答_落库一次且只发一条通知() throws Exception {
        when(repo.countAiReplies(42L)).thenReturn(0L);

        handler.handle("9-0", fields("42", "41"));

        // 落位参数：postId / rootId / replyToCommentId / askerId
        verify(comments).createAiComment(eq(7L), eq(41L), eq(42L), eq("u-bob"), anyString());

        // 决策 4：**只发一条** REPLY_COMMENT，绝不走 onComment / onMentions
        verify(notifications).onAiReply(eq(7L), eq(99L), eq("u-bob"), eq(false));
        verify(notifications, never()).onComment(anyLong(), anyString(), anyLong(), any());
        verify(notifications, never()).onMentions(anyLong(), any(), anyString(), any(), anyString());

        verify(redis).delete("ai:proc:42");
    }

    @Test
    void 调用参数符合方案_温度05超时60输出上限800() throws Exception {
        handler.handle("10-0", fields("42", null));

        verify(llm).chat(eq(AiPromptBuilder.SYSTEM), anyString(),
                eq(0.5), eq(60), eq(800));
    }

    @Test
    void 发帖场景落成一条楼() throws Exception {
        handler.handle("11-0", fields("", null));

        // commentId 为空 -> replyTo=null -> createAiComment 落成楼（rootId 也传 null）
        verify(comments).createAiComment(eq(7L), isNull(), isNull(), eq("u-bob"), anyString());
        // 发帖场景：toPost=true -> 文案是「回复了你的帖子」
        verify(notifications).onAiReply(eq(7L), eq(99L), eq("u-bob"), eq(true));
    }

    @Test
    void 锁key对发帖场景用postId区分() throws Exception {
        handler.handle("12-0", fields("", null));
        verify(values).setIfAbsent("ai:proc:p7", "1", Duration.ofSeconds(300));
    }
}
