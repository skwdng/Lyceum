package com.siyige.community.ai;

import com.siyige.ai.LlmClient;
import com.siyige.community.CommentService;
import com.siyige.community.CommunityRepo;
import com.siyige.community.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.redis.core.StringRedisTemplate;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 处理一条 AI 任务：幂等 → 调模型 → 落库 → 通知（方案 §3.4 / §12）。
 *
 * <h3>为什么不重试、不回复失败（决策 7）</h3>
 * 超时 / 429 / 5xx / 空回复：{@code log.warn} 后**直接返回**，外层照常 XACK。
 * 评论已经发出去了，「AI 没答」是用户能自然接受的失败；重试只会多花钱、还可能答两遍。
 *
 * <h3>三层幂等（方案 §12.2）</h3>
 * <ol>
 *   <li><b>结果层（权威）</b>：库里已经答过就不再答 —— 覆盖「落库后、XACK 前崩溃」的重投</li>
 *   <li><b>并发层</b>：{@code SET NX ai:proc:{commentId} EX 300} 抢处理权，抢不到直接放弃</li>
 *   <li><b>兜底层</b>：锁 5 分钟自动过期，覆盖「调模型时崩溃」</li>
 * </ol>
 *
 * <p>「发帖 @AI」没有 commentId，幂等键退化成「这个帖子下 AI 是否已经回过一条楼」
 * （{@code countAiPostReply}）—— 帖子只会创建一次，所以这条判重足够。
 */
@Component
public class AiReplyHandler {

    private static final Logger log = LoggerFactory.getLogger(AiReplyHandler.class);

    /** 抢处理权用的锁：{@code ai:proc:{commentId}}，NX + 300s（方案 §12.3）。 */
    static final String LOCK_PREFIX = "ai:proc:";
    static final Duration LOCK_TTL = Duration.ofSeconds(300);

    /** 模型调用参数：温度 0.5、超时 60s、max_tokens 800（方案 §2 实测：给小了会拿到空 content）。 */
    static final double TEMPERATURE = 0.5;
    static final int TIMEOUT_SEC = 60;
    static final int MAX_TOKENS = 800;
    /** 带多少条最近评论进 prompt。 */
    static final int RECENT_LIMIT = 8;

    private final CommunityRepo repo;
    private final CommentService comments;
    private final NotificationService notifications;
    private final LlmClient llm;
    private final StringRedisTemplate redis;

    /**
     * @param comments 用 {@code @Lazy} 打断循环依赖：
     *                 CommentService → AiQueue → AiReplyHandler → CommentService。
     *                 不打断 Spring 启动时就会因为构造器成环而失败。
     */
    public AiReplyHandler(CommunityRepo repo, @Lazy CommentService comments,
                          NotificationService notifications, LlmClient llm,
                          StringRedisTemplate redis) {
        this.repo = repo;
        this.comments = comments;
        this.notifications = notifications;
        this.llm = llm;
        this.redis = redis;
    }

    /**
     * 处理一条 Stream 消息；任何异常都在内部吃掉（外层只负责 XACK）。
     *
     * <p>入参刻意用「id + Map」而不是 Spring 的 {@code MapRecord}：这个类只关心字段内容，
     * 不依赖 Spring Data 的记录类型，单测里可以直接构造一个 Map 调用。
     */
    public void handle(String recordId, Map<String, String> f) {
        long postId = parseLong(f.get("postId"), 0L);
        Long commentId = parseLongOrNull(f.get("commentId"));
        Long rootId = parseLongOrNull(f.get("rootId"));
        String askerId = f.get("askerId");
        String question = f.getOrDefault("text", "");

        if (postId <= 0 || askerId == null || askerId.isBlank()) {
            log.warn("AI 任务字段不完整，丢弃 id={} fields={}", recordId, f);
            return;
        }

        // ① 结果层：已经答过了吗（重投 / 另一个消费者刚答完）
        if (alreadyAnswered(postId, commentId)) return;

        // ② 并发层：抢处理权
        String lockKey = LOCK_PREFIX + (commentId != null ? commentId : "p" + postId);
        Boolean got;
        try {
            got = redis.opsForValue().setIfAbsent(lockKey, "1", LOCK_TTL);
        } catch (RuntimeException e) {
            log.warn("AI 抢锁失败（Redis 异常），放弃本条 commentId={} 原因={}", commentId, e.toString());
            return;
        }
        if (!Boolean.TRUE.equals(got)) {
            log.info("另一个消费者正在处理，跳过 commentId={}", commentId);
            return;
        }

        try {
            doReply(postId, commentId, rootId, askerId, question);
        } catch (RuntimeException e) {
            log.warn("AI 回复处理失败（不重试、不回复）commentId={} 原因={}", commentId, e.toString());
        } finally {
            try {
                redis.delete(lockKey);
            } catch (RuntimeException ignore) {
                // 删锁失败无所谓：300 秒后自动过期
            }
        }
    }

    private void doReply(long postId, Long commentId, Long rootId, String askerId, String question) {
        // ③ 复查：排队期间帖子可能被删了
        Map<String, Object> post = repo.findPost(postId);
        if (post == null) {
            log.info("AI 任务丢弃：帖子已删除或不可见 postId={}", postId);
            return;
        }

        List<Map<String, Object>> recent = repo.listRecentForAi(postId, RECENT_LIMIT);
        String userMsg = AiPromptBuilder.buildUser(post, recent, question);

        String reply;
        try {
            reply = llm.chat(AiPromptBuilder.SYSTEM, userMsg, TEMPERATURE, TIMEOUT_SEC, MAX_TOKENS);
        } catch (Exception e) {
            // 超时 / 429 / 5xx / 网络：不重试、不回复、不通知（决策 7）
            log.warn("AI 调用失败（不重试、不回复）postId={} commentId={} 原因={}",
                    postId, commentId, e.toString());
            return;
        }
        if (reply == null || reply.isBlank()) {
            log.warn("AI 空回复（不重试、不回复）postId={} commentId={}", postId, commentId);
            return;
        }

        // 落库：AI 以普通用户身份插入评论（不触发 onComment / onMentions / maybeEnqueue，防递归）
        long aiCommentId = comments.createAiComment(postId, rootId, commentId, askerId, reply);

        // 通知：**只发一条** REPLY_COMMENT 给提问者（决策 4，不复用 onComment）
        notifications.onAiReply(postId, aiCommentId, askerId, commentId == null);

        log.info("AI 已回复 postId={} asker={} aiCommentId={} rootId={} 长度={}",
                postId, askerId, aiCommentId, rootId, reply.length());
    }

    /** 结果层判重：评论看「这条评论下有没有 AI 回复」，发帖看「这个帖子下有没有 AI 的楼」。 */
    private boolean alreadyAnswered(long postId, Long commentId) {
        try {
            if (commentId != null && repo.countAiReplies(commentId) > 0) {
                log.info("AI 回复已存在，跳过 commentId={}", commentId);
                return true;
            }
            if (commentId == null && repo.countAiPostReply(postId) > 0) {
                log.info("AI 已回复过这个帖子，跳过 postId={}", postId);
                return true;
            }
            return false;
        } catch (RuntimeException e) {
            log.warn("AI 幂等判重失败（按未答处理）postId={} commentId={} 原因={}", postId, commentId, e.toString());
            return false;
        }
    }

    private static Long parseLongOrNull(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return Long.parseLong(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static long parseLong(String v, long def) {
        Long n = parseLongOrNull(v);
        return n == null ? def : n;
    }
}
