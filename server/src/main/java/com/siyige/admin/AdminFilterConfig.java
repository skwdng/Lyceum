package com.siyige.admin;

import com.siyige.auth.JwtService;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/**
 * 把 {@link AdminAuthFilter} 只挂到 {@code /api/admin/*}。
 *
 * <p>与社区的 {@code AuthFilterConfig} 是**并列**关系，两个 URL 前缀互不重叠：
 * `/api/community/*` 走用户过滤器，`/api/admin/*` 走管理员过滤器，
 * `/api/auth/*` 与 `/api/topics` 等辩论接口两个都不过。
 *
 * <p>过滤器刻意不加 {@code @Component}——否则 Spring Boot 会自动注册到 `/*`，
 * 变成全站要求管理员令牌，把社区和辩论全打死。
 */
@Configuration
public class AdminFilterConfig {

    @Bean
    public FilterRegistrationBean<AdminAuthFilter> adminAuthFilter(JwtService jwt, AdminStatusSource adminStatus) {
        FilterRegistrationBean<AdminAuthFilter> reg =
                new FilterRegistrationBean<>(new AdminAuthFilter(jwt, adminStatus));
        reg.addUrlPatterns("/api/admin/*");
        reg.setName("adminAuthFilter");
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return reg;
    }
}
