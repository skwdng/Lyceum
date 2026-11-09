package com.siyige.auth;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 把 {@link JwtAuthFilter} 按路径组注册成多个实例（同一个类，不同 {@link JwtAuthFilter.Scope}）。
 *
 * <p>几点刻意为之：
 * <ul>
 *   <li>过滤器<b>不加 @Component</b>——否则 Spring Boot 会自动把它注册到 {@code /*}，
 *       变成全站鉴权，匿名该能看的（{@code /api/topics}、{@code /api/hot}、{@code /api/health}、
 *       {@code /api/format}）会被 401 打死。这里用 FilterRegistrationBean 精确控范围。</li>
 *   <li>{@code /api/auth/*} 完全不经过它：注册/登录/登出/我的 自己在 Controller 里校验 Bearer，
 *       否则登录接口会被"需要登录"挡住，形成死结。</li>
 *   <li>匿名可访问的辩论侧路径**不注册**任何过滤器 —— 靠"不注册"而不是"注册了再放行"。</li>
 * </ul>
 *
 * <p>路径写法注意：servlet 的 {@code /x/*} 在部分容器里不匹配裸路径 {@code /x}，
 * 所以形如 {@code /api/matches}、{@code /api/rooms} 的裸路径都**显式列出来**，
 * 否则 {@code POST /api/matches}（建对局）会漏过鉴权。
 */
@Configuration
public class AuthFilterConfig {

    /** 靠前一点，保证业务代码看到的 UserContext 已经就绪；但仍晚于编码过滤器等基础设施。 */
    private static final int FILTER_ORDER = Ordered.HIGHEST_PRECEDENCE + 10;

    @Bean
    public FilterRegistrationBean<JwtAuthFilter> communityJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                   UserStatusSource userStatus) {
        return register("communityJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.COMMUNITY, "/api/community/*");
    }

    /**
     * 视频模块（辩论短视频）。
     *
     * <p>与社区同构：**浏览匿名可看、写操作要登录**——广场/详情不登录也能刷，
     * 发布、点赞、评论必须登录。用 COMMUNITY 作用域即可（规则一致）。
     */
    /** 钱包与计费：读写都要登录（余额、充值、流水）。 */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> walletJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                 UserStatusSource userStatus) {
        return register("walletJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.DEBATE, "/api/wallet", "/api/wallet/*");
    }

    @Bean
    public FilterRegistrationBean<JwtAuthFilter> videoJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                UserStatusSource userStatus) {
        return register("videoJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.DEBATE_WRITE, "/api/video/*");
    }

    /**
     * 辩论侧主体：**全部**要登录（含 {@code GET /api/matches/{id}} 与 SSE）。
     *
     * <p>覆盖：建对局、查对局、对局内所有操作、SSE、战绩、诊断、房间全系列。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> debateJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                UserStatusSource userStatus) {
        return register("debateJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.DEBATE,
                "/api/matches", "/api/matches/*",
                "/api/records", "/api/diag",
                "/api/rooms", "/api/rooms/*");
    }

    /**
     * 辩论侧的"内容类写接口"：只有写操作要登录，读操作不受影响。
     *
     * <p>按决策 1（辩论侧所有写操作都要登录）收紧这两条，同时保证
     * {@code GET /api/hot} 之类的读接口仍然匿名可用。
     *
     * <p>{@code /api/topics/audit} = 自定义辩题送审（POST，会调 AI）；
     * {@code /api/hot/*} 下当前只有 {@code POST /{topicId}/boost}（热榜助力）。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> debateWriteJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                     UserStatusSource userStatus) {
        return register("debateWriteJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.DEBATE_WRITE,
                "/api/topics/audit", "/api/hot/*");
    }

    /**
     * 社交：好友 / 私聊。
     *
     * <p>与社区、辩论都不同：这里**没有任何匿名可看的数据**——好友列表、会话、消息
     * 全是私人内容，所以用 {@link JwtAuthFilter.Scope#SOCIAL}（读也要登录）。
     *
     * <p>注意 {@code /ws/**} **不在这里注册**：WebSocket 握手是 GET 升级请求，
     * 鉴权由 {@code ChatHandshakeInterceptor} 自己做（红线要求，也避免破坏
     * 「只对 /events 回退 query token」的既有规则）。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> socialJwtFilter(JwtService jwt, TokenBlacklist blacklist,
                                                                UserStatusSource userStatus) {
        return register("socialJwtFilter", jwt, blacklist, userStatus,
                JwtAuthFilter.Scope.SOCIAL, "/api/social/*");
    }

    private FilterRegistrationBean<JwtAuthFilter> register(String name, JwtService jwt,
                                                           TokenBlacklist blacklist, UserStatusSource userStatus,
                                                           JwtAuthFilter.Scope scope, String... patterns) {
        FilterRegistrationBean<JwtAuthFilter> reg =
                new FilterRegistrationBean<>(new JwtAuthFilter(jwt, blacklist, userStatus, scope));
        reg.addUrlPatterns(patterns);
        reg.setName(name);
        reg.setOrder(FILTER_ORDER);
        return reg;
    }
}
