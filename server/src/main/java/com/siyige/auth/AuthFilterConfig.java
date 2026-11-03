package com.siyige.auth;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 把 {@link JwtAuthFilter} 只挂到 {@code /api/community/*}。
 *
 * <p>几点刻意为之：
 * <ul>
 *   <li>过滤器<b>不加 @Component</b>——否则 Spring Boot 会自动把它注册到 {@code /*}，
 *       变成全站鉴权，辩论接口（/api/topics 等）会被 401 打死。这里用 FilterRegistrationBean 精确控范围。</li>
 *   <li>{@code /api/auth/*} 完全不经过它：注册/登录/登出/我的 自己在 Controller 里校验 Bearer，
 *       否则登录接口会被"需要登录"挡住，形成死结。</li>
 * </ul>
 */
@Configuration
public class AuthFilterConfig {

    @Bean
    public FilterRegistrationBean<JwtAuthFilter> communityJwtFilter(JwtService jwt, TokenBlacklist blacklist) {
        FilterRegistrationBean<JwtAuthFilter> reg =
                new FilterRegistrationBean<>(new JwtAuthFilter(jwt, blacklist));
        reg.addUrlPatterns("/api/community/*");
        reg.setName("communityJwtFilter");
        // 靠前一点，保证业务代码看到的 UserContext 已经就绪；但仍晚于编码过滤器等基础设施
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return reg;
    }
}
