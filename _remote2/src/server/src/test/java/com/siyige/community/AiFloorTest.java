package com.siyige.community;

import com.siyige.auth.UserNames;
import com.siyige.community.ai.AiAccount;
import com.siyige.community.ai.AiQueue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 楼层归属（决策 3）——**AI 回到哪一层**。
 *
 * <pre>
 * 发帖里 @       -> AI 回一条**楼**        （commentId=null, rootId=null）
 * 楼里 @         -> AI 回到**这楼的楼中楼** （rootId = 楼自己的 id）
 * 楼中楼里 @     -> AI 回到**同楼的楼中楼** （rootId = 原来的 rootId，仍是第二层，不会更深）
 * </pre>
 *
 * <p>这个测试是补出来的：第一版把「楼里 @」错传成 rootId=null，结果 AI 的回复变成了
 * 一条**新的楼**，而不是挂在那条楼下面。curl 实测才发现，这里用单测钉死。
 */
class AiFloorTest {

    private NotifyTestSupport db;
    private CommunityRepo repo;
    private AiQueue aiQueue;
    private CommentService comments;
    private long postId;

    @BeforeEach
    void setUp() {
        db = NotifyTestSupport.fresh();
        db.user("u-bob", "王同学");
        postId = db.post("u-bob", "论 AI 是否会取代辩手");

        aiQueue = mock(AiQueue.class);
        repo = new CommunityRepo(db.jdbc);
        comments = new CommentService(repo,
                new SensitiveWordMasker(List.of()), mock(MuteGuard.class),
                new NotificationService(new NotificationRepo(db.jdbc),
                        new InMemoryUnreadCounter(), new UserNames(db.jdbc)),
                aiQueue);
    }

    private Map<String, Object> body(String text, Long replyToCommentId) {
        Map<String, Object> b = new java.util.HashMap<>();
        b.put("body", text);
        b.put("mentions", List.of(AiAccount.ID));
        if (replyToCommentId != null) {
            b.put("replyObjectType", "COMMENT");
            b.put("replyObjectCommentId", replyToCommentId);
        }
        return b;
    }

    /** 捕获入队时传的 (commentId, rootId)。 */
    private long[] capturedIds() {
        var capComment = org.mockito.ArgumentCaptor.forClass(Long.class);
        var capRoot = org.mockito.ArgumentCaptor.forClass(Long.class);
        verify(aiQueue).maybeEnqueue(anyLong(), capComment.capture(), anyString(),
                capRoot.capture(), anyString(), any());
        return new long[]{
                capComment.getValue() == null ? -1 : capComment.getValue(),
                capRoot.getValue() == null ? -1 : capRoot.getValue()
        };
    }

    @Test
    void 楼里atAI_入队时rootId是这一楼自己() {
        long id = CommunityService.num(comments.create("u-bob", postId, body("@DeepSeek 你怎么看", null))
                .get("commentId"));

        long[] ids = capturedIds();
        assertEquals(id, ids[0], "commentId 是被 @ 的那条评论");
        assertEquals(id, ids[1], "楼里 @ -> AI 回复挂在这条楼下（rootId = 它自己）");
    }

    @Test
    void 楼中楼里atAI_入队时沿用原rootId() {
        long root = CommunityService.num(comments.create("u-bob", postId, body("楼主发言", null))
                .get("commentId"));
        reset(aiQueue);

        long replyId = CommunityService.num(comments.create("u-bob", postId, body("@DeepSeek 你说呢", root))
                .get("commentId"));

        long[] ids = capturedIds();
        assertEquals(replyId, ids[0]);
        assertEquals(root, ids[1], "楼中楼 @ -> 仍回到同一个楼，不会变成第三层");
    }

    @Test
    void AI回复自己的落库位置由入队参数决定() {
        long root = CommunityService.num(comments.create("u-bob", postId, body("楼主发言", null))
                .get("commentId"));

        // 模拟 handler 拿到入队参数后落库：rootId=root, replyTo=root
        long ai = comments.createAiComment(postId, root, root, "u-bob", "AI 的回答");

        Map<String, Object> row = repo.findComment(ai);
        assertEquals(root, CommunityService.num(row.get("root_id")), "必须是楼中楼（挂在 root 下）");
        assertEquals("COMMENT", row.get("reply_object_type"));
        assertEquals(1L, repo.countAiReplies(root), "幂等判重能认出来");
    }

    @Test
    void 发帖场景invariant_commentId为null时下结论() {
        // 发帖走的是 CommunityService.create -> maybeEnqueue(postId, null, uid, null, ...)
        // 这里只断言常量关系：commentId=null 时 handler 会落成楼（rootId=null）
        long ai = comments.createAiComment(postId, null, null, "u-bob", "AI 在帖子下的楼");
        Map<String, Object> row = repo.findComment(ai);
        assertNull(row.get("root_id"), "发帖 @ -> AI 的回复是楼级别");
        assertEquals(1L, repo.countAiPostReply(postId));
    }
}
