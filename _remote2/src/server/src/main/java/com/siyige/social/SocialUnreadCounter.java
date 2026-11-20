package com.siyige.social;

import java.util.Map;

/**
 * 私聊未读的**读路径**（侧栏角标 + 会话列表每行的数字都从这里取，不查库）。
 *
 * <h3>与「已读位置」的分工（别混）</h3>
 * <ul>
 *   <li>数据库 {@code sy_conversation.read_a/read_b}：**读到哪条消息 id**，是真相。
 *       用来算「这次标已读到底读掉几条」和「缓存丢了怎么重建」。</li>
 *   <li>本接口：**还剩几条没读**，是按会话拆的计数缓存。轮询/刷新角标只读它。</li>
 * </ul>
 *
 * <h3>为什么按会话拆</h3>
 * 通知那边的 {@code notify:unread} 一个用户只存一个总数就够；消息这边会话列表每行
 * 都要显示各自的未读数，所以是「每个会话一个 field」，侧栏角标由它们求和得出。
 *
 * <h3>key 为什么和通知分开</h3>
 * 两个角标必须互不影响：进通知页清掉通知红点，不能把「消息」红点也清掉（决策 12）。
 *
 * <h3>缓存丢了怎么办</h3>
 * {@link #total} 返回 {@code null} 表示「缓存里没有这个人」（Redis 重启 / 首次），
 * 调用方用数据库的一条聚合 SQL 重建一次；重建后即使没有任何会话也写一个哨兵字段，
 * 避免每次都判成冷缓存、把查询又带回轮询路径上。
 */
public interface SocialUnreadCounter {

    /** 所有会话未读之和；{@code null} = 缓存未初始化（调用方需要重建）。 */
    Integer total(String userId);

    /** 某个会话的未读数（没有就是 0）。 */
    int of(String userId, long convId);

    /** 收到一条新消息：该会话 +1。 */
    void incr(String userId, long convId);

    /**
     * 标已读：按**实际读掉的条数**递减，减到 ≤0 时删掉该 field。
     *
     * @return 递减后的剩余条数（0 表示这个会话已经清空）
     */
    int decr(String userId, long convId, long n);

    /** 用数据库算出来的各会话未读重建缓存（会话列表页/冷启动时调用）。 */
    void rebuild(String userId, Map<Long, Integer> perConv);

    /** 登录态失效/退出时清掉（可选）。 */
    void clear(String userId);
}
