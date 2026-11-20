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
 *   <li>匿名可访问的辩论侧路径**不注册**任何过滤器 —— 靠"不�