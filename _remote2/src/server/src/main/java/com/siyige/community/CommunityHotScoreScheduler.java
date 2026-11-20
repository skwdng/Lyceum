package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 热度重算任务（R-COM-13）：每 10 分钟批量重算最近 7 天帖子的 hot_score。
 *
 * <p>用 fixedDelay 而不是 fixedRate，避免上一轮没跑完就叠加下一轮。
 * 单独成 Bean：浏览回写只负责 view_count，热度统一在这里算，互不耦合。
 */
@Component
public class CommunityHotScoreScheduler {

    private static final Logger log = LoggerFactory.getLogger(CommunityHotScoreScheduler.class);

    private final CommunityRepo repo;

    public CommunityHotScoreScheduler(CommunityRepo repo) {
        this.repo = repo;
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 600_000)
    public void recalculateHotScores() {
        try {
            int rows = repo.recalculateRecentHotScores();
            log.info("热度重算完成 affectedRows={}", rows);
        } catch (Exception e) {
            // 不能让调度线程退出
            log.error("热度重算任务异常", e);
        }
    }
}
