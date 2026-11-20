package com.siyige.admin.alert;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 定时扫描（照 {@code admin/analytics/ModuleViewScheduler} 的写法）。
 *
 * <p>节奏：启动后 60 秒先扫一次（不用等 5 分钟），之后每 5 分钟一次；
 * `fixedDelay` 而不是 `fixedRate` —— 上一轮没结束就不叠加，慢库也不会积压任务。
 *
 * <p>异常一律在这里吞掉并记 error：扫描挂了**不能**让调度线程死掉，
 * 否则之后再也不会有告警，而且没人知道。
 */
@Component
public class AlertScheduler {

    private static final Logger log = LoggerFactory.getLogger(AlertScheduler.class);

    private final AlertService alerts;

    public AlertScheduler(AlertService alerts) {
        this.alerts = alerts;
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    public void scan() {
        try {
            AlertService.ScanResult r = alerts.scan();
            if (r.raised() > 0 || r.resolved() > 0) {
                log.info("定时告警扫描：新增 {} / 回落 {} / 静音跳过 {}",
                        r.raised(), r.resolved(), r.skippedRules());
            }
        } catch (Exception e) {
            log.error("告警扫描任务异常", e);
        }
    }
}
