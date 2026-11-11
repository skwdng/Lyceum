package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 日活落库（设计文档 §3.2）：每天 00:05 把**昨天**的 {@code act:dau:{yyyyMMdd}} 写进 {@code sy_daily_active}。
 *
 * <p>为什么写"昨天"而不是"今天"：当天还没过完，HLL 还在长；00:05 时昨天的已经定型。
 * 为什么用 cron 而不是 fixedDelay：它必须卡在自然日边界上，漂移会让数据显示到错的日期。
 *
 * <p>{@code new_users} 不用埋点：{@code sy_user.created_at} 本来就是可靠来源（设计文档 §2.5 的同一思路）。
 * 不做好历史回填 / 不补跑：H2 内存库重启即空，补跑没有意义（决策 3）。
 */
@Component
public class DailyActiveScheduler {

    private static final Logger log = LoggerFactory.getLogger(DailyActiveScheduler.class);

    private final PvStore store;
    private final ModuleViewRepo repo;

    public DailyActiveScheduler(PvStore store, ModuleViewRepo repo) {
        this.store = store;
        this.repo = repo;
    }

    @Scheduled(cron = "0 5 0 * * *")
    public void flushYesterday() {
        LocalDate yesterday = DayKeys.todayDate().minusDays(1);
        try {
            long dau = store.countActive(DayKeys.dayKey(yesterday));
            int newUsers = repo.countNewUsers(yesterday);
            repo.upsertDailyActive(yesterday, (int) Math.min(Integer.MAX_VALUE, dau), newUsers);
            log.info("日活落库 day={} dau={} newUsers={}", yesterday, dau, newUsers);
        } catch (Exception e) {
            // 一天的日活丢了可以接受（统计），但调度不能停
            log.error("日活落库失败 day={}", yesterday, e);
        }
    }
}
