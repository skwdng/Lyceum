package com.siyige.community;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 热度任务：调用 repo、异常不外抛、10 分钟 fixedDelay。 */
class CommunityHotScoreSchedulerTest {

    private final CommunityRepo repo = mock(CommunityRepo.class);
    private final CommunityHotScoreScheduler scheduler = new CommunityHotScoreScheduler(repo);

    @Test
    void 每次执行都会调用repo重算() {
        when(repo.recalculateRecentHotScores()).thenReturn(7);

        scheduler.recalculateHotScores();

        verify(repo, times(1)).recalculateRecentHotScores();
    }

    @Test
    void repo异常时调度器不向外抛() {
        when(repo.recalculateRecentHotScores()).thenThrow(new RuntimeException("db down"));

        assertDoesNotThrow(() -> scheduler.recalculateHotScores());
    }

    @Test
    void 调度注解是10分钟fixedDelay() throws Exception {
        Scheduled scheduled = CommunityHotScoreScheduler.class
                .getMethod("recalculateHotScores")
                .getAnnotation(Scheduled.class);

        assertNotNull(scheduled, "必须标注 @Scheduled");
        assertEquals(600_000L, scheduled.fixedDelay(), "fixedDelay 应为 10 分钟");
        assertEquals(600_000L, scheduled.initialDelay(), "initialDelay 应为 10 分钟");
        assertEquals(-1L, scheduled.fixedRate(), "不能用 fixedRate，避免重叠执行");
    }
}
