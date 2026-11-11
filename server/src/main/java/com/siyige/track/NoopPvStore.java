package com.siyige.track;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 没有 Redis 时的空实现（{@code siyige.redis.enabled=false}，与 {@code InMemoryViewStore} 同款开关）。
 *
 * <p>为什么不做内存版：内存计数会随重启清零、还要考虑并发与内存增长，
 * 而它换来的数据本来就要等定时任务才落库 —— 收益太低。
 * 统计是后台功能，宁可这段时间没有数据，也不要给主流程加状态。
 *
 * <p>注意 {@link #takePv} / {@link #countUv} 等读方法返回空值，
 * 定时任务照常跑（只是写 0 行），不需要额外判断。
 */
@Component
@ConditionalOnProperty(name = "siyige.redis.enabled", havingValue = "false")
public class NoopPvStore implements PvStore {

    @Override
    public void addPv(String day, String module, long delta) {
        // 无 Redis：丢弃
    }

    @Override
    public void addUv(String day, String module, String userId) {
        // 无 Redis：丢弃
    }

    @Override
    public Map<String, Long> takePv(String day) {
        return Map.of();
    }

    @Override
    public void restorePv(String day, Map<String, Long> increments) {
        // 无 Redis：无处可补
    }

    @Override
    public long snapUv(String day, String module) {
        return 0L;
    }

    @Override
    public void saveUvSnap(String day, String module, long uv) {
        // 无 Redis：丢弃
    }

    @Override
    public long countUv(String day, String module) {
        return 0L;
    }

    @Override
    public void addActive(String day, String userId) {
        // 无 Redis：丢弃
    }

    @Override
    public long countActive(String day) {
        return 0L;
    }

    @Override
    public long unionActive(java.util.List<String> days) {
        return 0L;
    }
}
