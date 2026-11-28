package com.siyige.community;

import com.siyige.auth.UserNames;
import com.siyige.community.ai.AiAccount;
import com.siyige.community.ai.AiConfig;
import com.siyige.community.ai.AiQueue;
import com.siyige.community.ai.AiRedis;
import com.siyige.community.ai.AiReplyHandler;
import com.siyige.community.ai.AiUsageGuard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 触发 AI 的两条路（2026-11-28 扩展第二条）。
 *
 * <pre>
 * ① 正文含 @DeepSeek 且 mentions 里有 ai_deepseek   -> 入队、扣额度（现状，不能改坏）
 * ② 直接回复 AI 的某条评论（不需要 @）              -> 入队、扣额度（本次新增）
 * 回复普通用户 / 额度用完 / 提问者本身是 AI         -> 不入队
 * </pre>
 *
 * <p>这里用**真 CommentService + 真 AiQueue**（H2 + 只 mock 掉 Redis 那一层）：
 * 要验的正是「service 算出的 replyToAi 有没有走到队列的闸②、额度有没有被扣一次」——
 * 把 AiQueue 整个 mock 掉就什么都验不到了。
 */
class AiReplyTriggerTest {

    private NotifyTestSupport db;
    private CommunityRepo repo;
    private CommentService comments;
    private AiUsageGuard guard;
    private StreamOperations<String, String, String> streams;
    private long postId;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-bob", "王同学");
        db.user("u-alice", "爱丽丝");
        postId = db.post("u-bob", "论 AI 是否会取代辩手");

        AiConfig config = mock(AiConfig.class);
        guard = mock(AiUsageGuard.class);
        AiReplyHandler handler = mock(AiReplyHandler.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        streams = mock(StreamOperations.class);
        AiRedis aiRedis = mock(AiRedis.class);
        when(aiRedis.template()).thenReturn(redis);
        when(redis.opsForStream()).thenReturn((StreamOperations) streams);
        when(config.enabled()).thenReturn(true);
        when(guard.tryAcquire(anyString())).thenReturn(true);

        AiQueue aiQueue = new AiQueue(config, guard, handler, redis, aiRedis);
        repo = new CommunityRepo(db.jdbc);
        comments = new CommentService(repo,
                new SensitiveWordMasker(List.of()), mock(MuteGuard.class),
                new NotificationService(new NotificationRepo(db.jdbc),
                        new InMemoryUnreadCounter(), new UserNames(db.jdbc)),
                aiQueue);
    }

    /** 发一条评论；replyTo 为 null 表示顶层评论。返回新评论 id。 */
    private long say(String userId, String text, Long replyTo) {
        Map<String, Object> b = new HashMap<>();
        b.put("body", text);
        if (replyTo != null) {
            b.put("replyObjectType", "COMMENT");
            b.put("replyObjectCommentId", replyTo);
        }
        return CommunityService.num(comments.create(userId, postId, b).get("commentId"));
    }

    private void verifyEnqueuedOnce() {
        verify(streams, times(1)).add(any(MapRecord.class));
    }

    private void verifyNoEnqueue() {
        verify(streams, never()).add(any(MapRecord.class));
    }

    /** AI 在帖子里的一条楼评论（ai_deepseek 种子行由 schema-ai.sql 建好）。 */
    private long aiRootComment() {
        return db.comment(postId, AiAccount.ID, "我是 DeepSeek，先说说我的看法。");
    }

    // ==================== ② 回复 AI（本次新增） ====================

    @Test
    void 回复AI的评论_正文不含at也入队() {
        long aiComment = aiRootComment();

        say("u-bob", "我不同意，理由是这样……", aiComment);

        verifyEnqueuedOnce();
    }

    @Test
    void 回复AI的评论_额度照扣一次() {
        long aiComment = aiRootComment();

        say("u-bob", "再说说？", aiComment);

        verify(guard, times(1)).tryAcquire("u-bob");
    }

    @Test
    void 回复AI的楼中楼_rootId仍是同一个楼不会变第三层() {
        long root = say("u-bob", "楼主先发言", null);
        reset(streams);
        // AI 的回复是楼中楼（第二层）：rootId=root, replyTo=root
        long aiReply = comments.createAiComment(postId, root, root, "u-bob", "AI 的回答");

        say("u-bob", "针对你这句，我再问一点", aiReply);

        ArgumentCaptor<MapRecord> cap = ArgumentCaptor.forClass(MapRecord.class);
        verify(streams).add(cap.capture());
        Map<String, String> fields = ((MapRecord<String, String, String>) cap.getValue()).getValue();
        assertEquals(String.valueOf(root), fields.get("rootId"),
                "回复 AI 的楼中楼 -> 仍回到同一个楼，不会产生第三层");
    }

    @Test
    void 回复普通用户的评论_不入队也不扣额度() {
        long normal = say("u-alice", "我觉得不会取代", null);
        reset(streams);

        say("u-bob", "我也这么觉得", normal);

        verifyNoEnqueue();
        verifyNoInteractions(guard);
    }

    @Test
    void 回复AI但额度用完_不入队而评论本身仍然成功() {
        long aiComment = aiRootComment();
        when(guard.tryAcquire(anyString())).thenReturn(false);

        long id = say("u-bob", "额度用完了也得让我说话", aiComment);

        verifyNoEnqueue();
        assertTrue(id > 0);
        assertNotNull(repo.findComment(id), "评论必须照常落库（AI 不回不影响用户操作）");
    }

    @Test
    void 正文只写DeepSeek但mentions空且没回复AI_不入队() {
        long normal = say("u-alice", "我觉得不会取代", null);
        reset(streams);

        say("u-bob", "@DeepSeek 你怎么看", normal);   // 手打 @ 但没点选 -> mentions 为空

        verifyNoEnqueue();
    }

    @Test
    void 提问者本身就是AI账号_不入队() {
        long aiComment = aiRootComment();
        long other = db.comment(postId, "u-alice", "普通人说一句");

        say(AiAccount.ID, "@DeepSeek 自我提问", other);      // @ 路径
        say(AiAccount.ID, "回复自己", aiComment);            // 回复路径

        verifyNoEnqueue();
        verifyNoInteractions(guard);
    }

    @Test
    void AI自己的回复落库时不入队_防无限自我触发() {
        long root = say("u-bob", "楼主先发言", null);
        reset(streams);

        // createAiComment 刻意不调 maybeEnqueue（红线：这段逻辑别动）
        comments.createAiComment(postId, root, root, "u-bob", "AI 的回答 @DeepSeek 顺便提一句");

        verifyNoEnqueue();
        verifyNoInteractions(guard);
    }

    // ==================== ① @ 路径回归 ====================

    @Test
    void 正文at且mentions有id_照常入队() {
        Map<String, Object> b = new HashMap<>();
        b.put("body", "@DeepSeek 你怎么看");
        b.put("mentions", List.of(AiAccount.ID));

        comments.create("u-bob", postId, b);

        verifyEnqueuedOnce();
    }
}
