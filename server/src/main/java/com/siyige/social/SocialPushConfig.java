package com.siyige.social;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 推送通道的兜底装配。
 *
 * <p>V1/V2 没有 WebSocket，容器里没有任何 {@link ChatPusher} 实现，业务层却已经需要注入它
 * （好友请求、消息推送的调用点先接好，V3 只补实现）。这里提供一个**什么都不做**的实现。
 *
 * <p>V3 的 {@code ChatWsHandler implements ChatPusher} 是一个 {@code @Component}，
 * 组件扫描会先注册它，于是这里的 {@code @ConditionalOnMissingBean} 不成立、空实现不再创建 ——
 * 全程不需要改业务代码。
 */
@Configuration
public class SocialPushConfig {

    @Bean
    @ConditionalOnMissingBean(ChatPusher.class)
    public ChatPusher noopChatPusher() {
        return (userId, event) -> {
            // 没有推送通道：消息照样入库，用户下次打开页面靠接口/补拉拿到
        };
    }
}
