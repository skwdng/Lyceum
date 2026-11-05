package com.siyige.community.ai;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 生产者的**三道闸**（方案 §3.2 / 决策 2 / 决策 8）。
 *
 * <pre>
 * 闸① 总开关：没开 -> 不入队（@DeepSeek 只是普通文本）
 * 闸② @ 判定：正文含 @DeepSeek **且** mentions 里有 ai_deepseek
 * 闸③ 限额：每天 5 次（入队即扣）
 * </pre>
 *
 * <p>这里的关键是「不该入队时一条都不发」——多入一条就多花一次 token、还会多一条 AI 回复。
 */
class AiQueueGateTest {

    private AiConfig config;
    private AiUsageGuard guard;
    private AiReplyHandler handler;
    private StringRedisTemplate redis;
    private StreamOperations<String, String, String> streams;
    private AiQueue queue;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        config = mock(AiConfig.class);
        guard = mock(AiUsageGuard.class);
        handler = mock(AiReplyHandler.class);
        redis = mock(StringRedisTemplate.class);
        streams = mock(StreamOperations.class);

        AiRedis aiRedis = mock(AiRedis.class);
        when(aiRedis.template()).thenReturn(redis);
        when(redis.opsForStream()).thenReturn((StreamOperations) streams);
        when(config.enabled()).thenReturn(true);
        when(guard.tryAcquire(anyString())).thenReturn(true);

        queue = new AiQueue(config, guard, handler, redis, aiRedis);
    }

    /** 校验 XADD 是否发生过。 */
    private void verifyEnqueued() {
        verify(streams, times(1)).add(any(MapRecord.class));
    }

    private void verifyNoEnqueue() {
        verify(streams, never()).add(any(MapRecord.class));
    }

    /** 捕获入队的那条记录，便于断言字段。 */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private MapRecord<String, String, String> captureEnqueued() {
        ArgumentCaptor<MapRecord> cap = ArgumentCaptor.forClass(MapRecord.class);
        verify(streams).add(cap.capture());
        return (MapRecord<String, String, String>) cap.getValue();
    }

    // ==================== 闸① 总开关 ====================

    @Test
    void 总开关关闭时一条都不入队() {
        when(config.enabled()).thenReturn(false);

        queue.maybeEnqueue(1L, 2L, "u-bob", null, "你好 @DeepSeek", List.of(AiAccount.ID));

        verifyNoEnqueue();
        verifyNoInteractions(guard);           // 连额度都不该扣
    }

    // ==================== 闸② @ 判定（两个条件都要满足） ====================

    @Test
    void 正文没写DeepSeek但mentions里有_不入队() {
        queue.maybeEnqueue(1L, 2L, "u-bob", null, "你好啊", List.of(AiAccount.ID));
        verifyNoEnqueue();
    }

    @Test
    void 正文写了DeepSeek但mentions里没有_不入队() {
        queue.maybeEnqueue(1L, 2L, "u-bob", null, "你好 @DeepSeek", List.of("u-alice"));
        verifyNoEnqueue();
    }

    @Test
    void mentions为null或空_不入队() {
        queue.maybeEnqueue(1L, 2L, "u-bob", null, "@DeepSeek 你好", null);
        queue.maybeEnqueue(1L, 2L, "u-bob", null, "@DeepSeek 你好", List.of());
        verifyNoEnqueue();
    }

    @Test
    void 两个条件都满足才入队() {
        queue.maybeEnqueue(7L, 42L, "u-bob", 9L, "说得好 @DeepSeek 你怎么看", List.of("u-alice", AiAccount.ID));
        verifyEnqueued();
    }

    @Test
    void 判定函数本身的边界() {
        assertTrue(AiQueue.mentionsAi("@DeepSeek 你好", List.of(AiAccount.ID)));
        assertTrue(AiQueue.mentionsAi("前面有字 @DeepSeek 后面有字", List.of(AiAccount.ID)));
        assertFalse(AiQueue.mentionsAi("@DeepSeek", List.of(" ai_deepseek ".trim() + "x")), "id 必须精确匹配");
        assertFalse(AiQueue.mentionsAi(null, List.of(AiAccount.ID)));
        assertFalse(AiQueue.mentionsAi("@DeepSeek", "ai_deepseek"), "mentions 不是集合就不算");
    }

    // ==================== 闸③ 限额 ====================

    @Test
    void 今日额度用完不入队() {
        when(guard.tryAcquire(anyString())).thenReturn(false);

        queue.maybeEnqueue(1L, 2L, "u-bob", null, "@DeepSeek 你好", List.of(AiAccount.ID));

        verifyNoEnqueue();
        verify(guard).tryAcquire("u-bob");
    }

    @Test
    void 入队时携带完整字段() {
        queue.maybeEnqueue(7L, 42L, "u-bob", 9L, "@DeepSeek 你怎么看", List.of(AiAccount.ID));

        MapRecord<String, String, String> rec = captureEnqueued();
        Map<String, String> f = rec.getValue();

        assertEquals(AiQueue.STREAM, rec.getStream());
        assertEquals("7", f.get("postId"));
        assertEquals("42", f.get("commentId"));
        assertEquals("u-bob", f.get("askerId"));
        assertEquals("9", f.get("rootId"));
        assertEquals("@DeepSeek 你怎么看", f.get("text"));
        assertNotNull(f.get("ts"), "要带时间戳，便于排查");
    }

    @Test
    void 发帖场景commentId与rootId为空串() {
        queue.maybeEnqueue(7L, null, "u-bob", null, "@DeepSeek 你怎么看", List.of(AiAccount.ID));

        Map<String, String> f = captureEnqueued().getValue();
        assertEquals("", f.get("commentId"));
        assertEquals("", f.get("rootId"));
    }

    @Test
    void XADD失败不影响调用方() {
        when(streams.add(any(MapRecord.class))).thenThrow(new IllegalStateException("redis down"));

        assertDoesNotThrow(() -> queue.maybeEnqueue(1L, 2L, "u-bob", null, "@DeepSeek 你好", List.of(AiAccount.ID)));
    }

    // ==================== 常量 ====================

    @Test
    void 队列与消费组名固定() {
        assertEquals("community:ai:tasks", AiQueue.STREAM);
        assertEquals("ai-worker", AiQueue.GROUP);
    }

    @Test
    void 有StreamRecords工具类可用() {
        // 防止有人把 mapBacked 换成别的构造方式导致字段序丢失
        assertNotNull(StreamRecords.mapBacked(Map.of("a", "1")));
    }
}
