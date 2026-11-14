package com.siyige.admin.analytics;

import com.siyige.track.DayKeys;
import com.siyige.track.PvStore;
import com.siyige.track.TrackService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 把 Redis 里的实时计数落到两张表（设计文档 §2.5）。
 *
 * <p><b>为什么单独成 Bean</b>：与 {@code CommunityViewScheduler} 同一个理由 ——
 * 定时任务里调本类自己的 {@code @Transactional} 方法会绕过代理，事务不生效。
 *
 * <p><b>为什么每次都处理「昨天 + 今天」</b>：
 * 5 分钟一次的回写，最后一次可能停在 23:59，零点后的那次如果只处理"今天"，
 * 昨天最后几十秒的 PV/UV 就永远留在一个再也没人读的 key 里（H2 内存库重启还会清空）。
 * 多处理一个昨天的 key 只多一次 Redis 往返，换来跨零点不丢数。
 *
 * <p>失败语义：先取走（Redis 里已删）再落库；落库失败必须把增量补回去，否则这段计数静默消失。
 */
@Service
public class ModuleViewFlushService {

    private static final Logger log = LoggerFactory.getLogger(ModuleViewFlushService.class);

    private final PvStore store;
    private final ModuleViewRepo repo;

    public ModuleViewFlushService(PvStore store, ModuleViewRepo repo) {
        this.store = store;
        this.repo = repo;
    }

    /** 一次「取走 + 落库」的批次。 */
    private record Batch(LocalDate day, Map<String, Long> pending) { }

    /**
     * PV 回写：把 {@code pv:cnt:{day}} 里的增量累加进 {@code sy_module_view.pv}。
     *
     * @return 本次落库的模块数（0 表示这段时间没人浏览）
     */
    @Transactional
    public int flushPv() {
        List<Batch> batches = new ArrayList<>();
        for (LocalDate day : window()) {
            try {
                Map<String, Long> pending = store.takePv(DayKeys.dayKey(day));
                if (pending != null && !pending.isEmpty()) batches.add(new Batch(day, pending));
            } catch (Exception e) {
                // Redis 不可用：本次没有可落的数据，不要因此中断调度
                log.warn("读取模块浏览增量失败，跳过 {} 的回写", DayKeys.dayKey(day), e);
            }
        }
        if (batches.isEmpty()) return 0;

        try {
            int modules = 0;
            for (Batch batch : batches) {
                for (Map.Entry<String, Long> entry : batch.pending().entrySet()) {
                    long delta = entry.getValue() == null ? 0 : entry.getValue();
                    if (delta <= 0) continue;
                    repo.addPv(batch.day(), entry.getKey(), delta);
                }
                modules += batch.pending().size();
            }
            log.info("模块浏览回写完成 modules={}", modules);
            return modules;
        } catch (RuntimeException e) {
            restore(batches);
            log.error("模块浏览回写失败，已回滚并把增量补回 Redis", e);
            throw e;
        }
    }

    /**
     * UV 快照：HyperLogLog 只能整体读，所以按「取大」覆盖写，同一天多次快照不会叠加。
     *
     * @return 本次真正写库的 (day, module) 个数
     */
    public int snapshotUv() {
        int written = 0;
        for (LocalDate day : window()) {
            String dayKey = DayKeys.dayKey(day);
            for (String module : TrackService.MODULES) {
                try {
                    long uv = store.countUv(dayKey, module);
                    if (uv <= 0) continue;
                    // 和上次快照一样就不必再写库（每小时一次，11 个模块，省下的都是白写的行）
                    if (uv <= store.snapUv(dayKey, module)) continue;
                    repo.mergeUv(day, module, uv);
                    store.saveUvSnap(dayKey, module, uv);
                    written++;
                } catch (Exception e) {
                    // 单个模块失败不影响其它模块（统计不追求强一致）
                    log.warn("UV 快照失败 day={} module={}", dayKey, module, e);
                }
            }
        }
        return written;
    }

    /** 昨天 + 今天（见类注释：跨零点不丢数）。 */
    private static List<LocalDate> window() {
        LocalDate today = DayKeys.todayDate();
        return List.of(today.minusDays(1), today);
    }

    private void restore(List<Batch> batches) {
        for (Batch batch : batches) {
            try {
                store.restorePv(DayKeys.dayKey(batch.day()), batch.pending());
            } catch (Exception e) {
                // 补不回去就等于这段计数丢了：按设计文档「统计可丢」记 error 即可
                log.error("补回模块浏览增量失败，本次增量丢失 day={}", DayKeys.dayKey(batch.day()), e);
            }
        }
    }
}
