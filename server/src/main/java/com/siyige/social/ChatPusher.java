package com.siyige.social;

import java.util.Map;

/**
 * 推送抽象：让业务层（{@link FriendService} / {@link ChatService}）不必知道消息是
 * 走 WebSocket 推出去的，还是根本没有推送通道。
 *
 * <p>为什么要抽这一层：
 * <ul>
 *   <li>V1/V2 还没有 WebSocket（{@code ChatWsHandler} 是 V3 才有的类），直接依赖会编译不过；</li>
 *   <li>更重要的：{@code ChatService} 与 {@code ChatWsHandler} 天然互相依赖
 *       （Service 要推送 → 依赖 Handler；Handler 收到帧 → 依赖 Service）。
 *       中间隔一个接口，Spring 的构造器注入就不会成环。</li>
 * </ul>
 *
 * <p>V3 的 {@code ChatWsHandler} 实现本接口后，{@link SocialPushConfig} 里的空实现会自动让位。
 */
public interface ChatPusher {

    /**
     * 给某个用户的**所有在线连接**推一条事件；用户不在线就什么都不做。
     *
     * <p>实现必须自己吞掉所有异常：推送失败只能说明连接断了，
     * 绝不能反过来让「消息入库」「加好友」这些主流程失败。
     */
    void push(String userId, Map<String, Object> event);
}
