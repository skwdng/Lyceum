package com.siyige.track;

import java.util.Map;

/**
 * 模块浏览 / 活跃用户的**实时计数**存储（Redis 实现；Redis 关掉时用空实现）。
 *
 * <p>为什么抽接口：与社区的 {@code ViewStore} 同一套路 —— 生产用 Redis，
 * 单测和「本地不起 Redis」的场景用 {@link NoopPvStore}，业务代码不用写 if。
 *
 * <p>所有方法都可能抛异常：<b>调用方负责吞掉</b>。统计不是关键路径，
 * Redis 抖动不能让人打不开页面（设计文档 §5.5 的降级精神）。
 */
public interface PvStore {

    /** 累加某个模块当天的 PV。 */
    void addPv(String day, String module, long delta);

    /** 把一个用户记进某模块当天的 UV（HyperLogLog，重复添加不重复计数）。 */
    void addUv(String day, String module, String userId);

    /**
     * 原子地「读取并清空」当天各模块的 PV 增量，供定时任务落库。
     *
     * @return module -> 次数；没有数据时返回空 Map（不为 null）
     */
    Map<String, Long> takePv(String day);

    /** 落库失败时把刚取走的 PV 增量补回去，避免静默丢计数。 */
    void restorePv(String day, Map<String, Long> increments);

    /** 上次已经落过库的 UV 快照（没有则 0）。 */
    long snapUv(String day, String module);

    /** 记录这次落库的 UV 快照值。 */
    void saveUvSnap(String day, String module, long uv);

    /** 某模块当天的去重 UV。 */
    long countUv(String day, String module);

    /** 把一个用户记进当天的活跃集合（DAU 也是 HyperLogLog）。 */
    void addActive(String day, String userId);

    /** 当天的去重活跃人数。 */
    long countActive(String day);
}
