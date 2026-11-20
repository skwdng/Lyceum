package com.siyige.community.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiQueue} 的消费组判定：BUSYGROUP 是**正常情况**（组已存在），不能当成失败。
 *
 * <p>回归背景：Spring Data Redis 抛的是 {@code RedisSystemException: Error in execution}，
 * 真正的 BUSYGROUP 在 cause 里。只看 getMessage() 会每次启动刷一条吓人的 WARN。
 */
class AiQueueGroupTest {

    @Test
    void 直接消息里的BUSYGROUP算已存在() {
        assertTrue(AiQueue.isBusyGroup(
                new RuntimeException("BUSYGROUP Consumer Group name already exists")));
    }

    @Test
    void 包在cause里的BUSYGROUP也要认出来() {
        RuntimeException inner = new RuntimeException("BUSYGROUP Consumer Group name already exists");
        RuntimeException outer = new RuntimeException("Error in execution", inner);
        assertTrue(AiQueue.isBusyGroup(outer));
    }

    @Test
    void 其它Redis错误不算已存在() {
        RuntimeException outer = new RuntimeException("Error in execution",
                new RuntimeException("NOAUTH Authentication required"));
        assertFalse(AiQueue.isBusyGroup(outer));
    }

    @Test
    void 没有cause时也不炸() {
        assertFalse(AiQueue.isBusyGroup(new RuntimeException((String) null)));
    }

    @Test
    void 日志取最内层原因() {
        RuntimeException e = new RuntimeException("outer", new RuntimeException("inner-cause"));
        assertTrue(AiQueue.rootMessage(e).contains("inner-cause"));
    }
}