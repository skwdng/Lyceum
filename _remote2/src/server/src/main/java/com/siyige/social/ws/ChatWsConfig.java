package com.siyige.social.ws;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 的「入口登记处」：告诉 Spring 路径 {@code /ws/chat} 由 {@link ChatWsHandler} 处理，
 * 握手时先过 {@link ChatHandshakeInterceptor}（鉴权在那儿）。
 *
 * <h3>为什么用 @EnableWebSocket 而不是 @EnableWebSocketMessageBroker</h3>
 * 后者是 STOMP 那套（订阅 / 广播模型），对「一对一私聊」是杀鸡用牛刀：
 * 要多配消息代理、改前端协议、还要处理订阅权限。这里用原生 WebSocket：
 * 一条连接 = 一个用户，收到 JSON 自己分发，最直接。
 *
 * <h3>为什么 /ws/** 不注册任何 Servlet 过滤器</h3>
 * 一、{@code JwtAuthFilter} 只注册在 {@code /api/**} 白名单路径上，本来就不覆盖 /ws；
 * 二、握手是「GET + Upgrade」的特殊请求，在过滤器里写 401，浏览器拿到的是握手失败，
 *    不是可读的 JSON；三、把 WS 鉴权塞进 JwtAuthFilter 会破坏它
 *    「只对 /events 回退 query token」的既有规则（红线）。
 *
 * <h3>跨域</h3>
 * 用 {@code setAllowedOriginPatterns("*")}（生产建议收窄成自己的域名）。
 * 不用 {@code setAllowedOrigins}：它不支持通配符，且带 cookie 的场景更容易被浏览器拒。
 */
@Configuration
@EnableWebSocket
public class ChatWsConfig implements WebSocketConfigurer {

    private final ChatWsHandler handler;
    private final ChatHandshakeInterceptor interceptor;

    public ChatWsConfig(ChatWsHandler handler, ChatHandshakeInterceptor interceptor) {
        this.handler = handler;
        this.interceptor = interceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/chat")
                // 拦截器负责鉴权：握手通过后才会进 Handler 的 afterConnectionEstablished
                .addInterceptors(interceptor)
                .setAllowedOriginPatterns("*");
    }
}
