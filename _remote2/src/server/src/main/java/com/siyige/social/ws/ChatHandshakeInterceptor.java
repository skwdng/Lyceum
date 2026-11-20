package com.siyige.social.ws;

import com.siyige.auth.JwtService;
import com.siyige.auth.TokenBlacklist;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/**
 * WebSocket 握手阶段的鉴权（等价于 HTTP 侧的 {@code JwtAuthFilter}）。
 *
 * <h3>为什么必须在这里验，而不是复用 JwtAuthFilter</h3>
 * <ul>
 *   <li>{@code JwtAuthFilter} 只注册在 {@code /api/community/*}、{@code /api/social/*} 等
 *       白名单路径上，WS 是 {@code /ws/chat}，压根不经过它；</li>
 *   <li>就算把过滤器扩到 {@code /ws/**} 也没意义：握手是「GET + Upgrade」，
 *       过滤器里写 401，浏览器拿到的是握手失败（onerror），不是可读的错误体；</li>
 *   <li>更重要的是：扩范围会破坏「只对 /events 回退 query token」的既有规则（红线）。</li>
 * </ul>
 *
 * <h3>令牌为什么走查询参数</h3>
 * 浏览器的 WebSocket API 不允许自定义请求头，没法像 fetch 那样带 Authorization。
 * 这和 EventSource 的限制一模一样，项目里 SSE 的 {@code /events} 已经用过这套先例。
 *
 * <h3>安全性</h3>
 * 令牌进 URL 会留在 Nginx access log 里。缓解：① 令牌本身 2 小时过期；
 * ② 退出登录会进黑名单；③ 生产可在 Nginx 上对 {@code /ws/} 关掉 access_log 或脱敏。
 */
@Component
public class ChatHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(ChatHandshakeInterceptor.class);

    private final JwtService jwt;
    private final TokenBlacklist blacklist;

    public ChatHandshakeInterceptor(JwtService jwt, TokenBlacklist blacklist) {
        this.jwt = jwt;
        this.blacklist = blacklist;
    }

    /**
     * 握手前调用。返回 false = 拒绝握手：浏览器会触发 onerror / onclose，
     * 前端据此显示「请重新登录」并降级到轮询。
     *
     * <p>拒绝时**显式写 401**：Spring 默认只"不升级"并留个空 200 响应，
     * 用 curl 来排查的人会以为握手成功了。写清楚状态码，日志和抓包都对得上。
     */
    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        String token = UriComponentsBuilder.fromUri(request.getURI())
                .build()
                .getQueryParams()
                .getFirst("token");

        if (token == null || token.isBlank()) {
            log.debug("WS 握手被拒：没有 token");
            return reject(response);
        }

        JwtService.ParsedToken parsed = jwt.parse(token);
        if (parsed == null) {
            log.debug("WS 握手被拒：token 无效或已过期");
            return reject(response);
        }

        // 只有普通用户能连私聊；管理员令牌不认（与 HTTP 侧 SOCIAL scope 一致）
        if (!parsed.isUser()) {
            log.debug("WS 握手被拒：不是用户令牌");
            return reject(response);
        }

        if (blacklist.contains(parsed.jti())) {
            log.debug("WS 握手被拒：token 已登出 jti={}", parsed.jti());
            return reject(response);
        }

        // 把身份塞进 session attributes —— Handler 里靠它知道「当前是谁」
        //（WebSocket 没有 RequestContext，这是唯一途径）
        attributes.put("userId", parsed.userId());
        log.debug("WS 握手通过 userId={}", parsed.userId());
        return true;
    }

    /** 统一的拒绝出口：写 401 再返回 false（让失败原因在 curl / 日志里可见）。 */
    private static boolean reject(ServerHttpResponse response) {
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        return false;
    }

    /** 握手完成后调用（成功失败都会进），这里不需要做事。 */
    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // 需要记录握手耗时 / 失败原因时才在这里写日志
    }
}
