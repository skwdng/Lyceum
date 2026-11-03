package com.siyige.community;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 浏览数回写任务（R-COM-36）：每 5 分钟把 view:pending 落到 post.view_count。
 *
 * <p>单独成 Bean，避免在 CommunityViewService 内自调用导致 @Transactional 失效。
 */
@Component
public class CommunityViewScheduler {

    private static final Logger log = LoggerFactory.getLogger(CommunityViewScheduler.class);

    private final CommunityViewService viewService;

    public CommunityViewScheduler(CommunityViewService viewService) {
        this.viewService = viewService;
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 300_000)
    public void flushViews() {
        try {
            viewService.flushPending();
        } catch (Exception e) {
            // 回写失败已经补回增量，这里只保证调度不被中断
            log.error("浏览回写任务异常", e);
        }
    }
}
