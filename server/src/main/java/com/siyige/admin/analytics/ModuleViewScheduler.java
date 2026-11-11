package com.siyige.admin.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 模块浏览的两个定时任务（设计文档 §2.1）：
 * <ul>
 *   <li><b>PV 落库</b>：每 5 分钟（与社区浏览回写同频，运维一眼就能对上）；</li>
 *   <li><b>UV 快照</b>：每 1 小时（HLL 只能整体读，没必要 5 分钟刷一次库）。</li>
 * </ul>
 *
 * <p>只做调度，逻辑在 {@link ModuleViewFlushService}（第二个 @Scheduled 也算一次外部调用，
 * 但把事务放在独立 Bean 里更稳妥，也不会踩自调用失效）。
 */
@Component
public class ModuleViewScheduler {

    private static final Logger log = LoggerFactory.getLogger(ModuleViewScheduler.class);

    private final ModuleViewFlushService flush;

    public ModuleViewScheduler(ModuleViewFlushService flush) {
        this.flush = flush;
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 300_000)
    public void flushPv() {
        try {
            int modules = flush.flushPv();
            if (modules > 0) log.info("定时回写 PV：{} 个模块", modules);
        } catch (Exception e) {
            // 回写失败已经补回增量，这里只保证调度不被中断
            log.error("模块浏览回写任务异常", e);
        }
    }

    /**
     * UV 快照：每小时一次。
     *
     * <p>首次延迟只给 60 秒（不是 1 小时）：发布/重启后如果等到 1 小时才快照，
     * 报表里的 UV 会在这一小时内一直显示 0，看起来像"抓不到数据"。
     * 快照本身是「取大覆盖」，多跑一次无副作用。
     */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    public void snapshotUv() {
        try {
            int written = flush.snapshotUv();
            if (written > 0) log.info("定时快照 UV：{} 个 (day,module)", written);
        } catch (Exception e) {
            log.error("UV 快照任务异常", e);
        }
    }
}
