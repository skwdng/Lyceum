package com.siyige.community;

import java.util.Collection;
import java.util.Map;

/**
 * 浏览计数的 Redis 访问面（R-COM-31~35）。
 *
 * <p>抽成接口只是为了让 {@link CommunityViewService} 的单元测试不依赖真实 Redis；
 * 生产实现见 {@link RedisViewStore}。
 */
public interface ViewStore {

    /**
     * 记录一次浏览（Lua 内原子执行 SADD + HINCRBY）。
     *
     * @return 1 = 当天首次浏览并已计数；0 = 今天已经看过
     */
    long recordSeen(String seenKey, String pendingKey, String userId, long postId, long expireAtEpochSecond);

    /** 原子地「读取并清空」待回写 Hash，返回 postId -> 增量。 */
    Map<Long, Long> takePending(String pendingKey);

    /** 回写失败时把已取出的增量补回。 */
    void restorePending(String pendingKey, Map<Long, Long> increments);

    /**
     * 批量读取待回写增量（<b>只读窥视</b>：不过期、不清空、不修改）。
     *
     * <p>给读路径用：界面上的浏览数 = 数据库 view_count + 这里的增量，
     * 这样刚看完刷新就能看到变化，不必等回写任务。
     *
     * <p>与 {@link #takePending} 的区别是语义性的：那个会 <b>删掉</b> Hash，
     * 这个方法绝对不能删——否则回写时增量就丢了，浏览数会倒退。
     *
     * @param postIds 要查的帖子 id
     * @return postId -> 增量；缺失的 id 不出现（调用方按 0 处理）。不应返回 null。
     */
    Map<Long, Long> peekPending(String pendingKey, Collection<Long> postIds);
}
