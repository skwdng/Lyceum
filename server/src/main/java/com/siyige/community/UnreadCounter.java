package com.siyige.community;

/**
 * 未读角标计数（唯一来源）。
 *
 * <pre>
 * Key:    notify:unread   (Hash)
 * Field:  userId
 * Value:  未读数
 * </pre>
 *
 * <p><b>不做回源查库的兜底</b>（方案决策 G）：Redis 重启后 field 消失 = 角标从 0 重新起算，
 * 数据库里的 {@code is_read} 仍然准确，只是角标不拿它补。这条是**明确接受**的行为，
 * 谁改成都去查库谁就违背了决策。
 *
 * <p>实现有两个：{@link RedisUnreadCounter}（默认）与 {@link InMemoryUnreadCounter}
 * （{@code siyige.redis.enabled=false} 时，本机开发/单元测试用）。
 */
public interface UnreadCounter {

    /** 读角标：没有该 field 就是 0。 */
    long get(String userId);

    /** 新通知 / 点赞聚合首次 / 点赞聚合「已读→未读」→ +1。 */
    void incr(String userId);

    /**
     * 拉列表后把「本页实际标记条数」原子减掉（Lua）。
     *
     * @return -1 = 本来没有该 field（计数不动）；0 = 减到 ≤0 已删除 field；&gt;0 = 剩余未读
     */
    long decrement(String userId, int n);
}
