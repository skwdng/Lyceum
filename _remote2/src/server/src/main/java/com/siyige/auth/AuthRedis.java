package com.siyige.auth;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.autoconfigure.data.redis.RedisProperties;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 认证模块专用的 Redis 客户端（黑名单 + 登录限流）。
 *
 * <p><b>为什么不用自动装配的 StringRedisTemplate：</b>
 * {@code application.yml} 里 {@code spring.data.redis.timeout=50ms} 是给社区浏览计数定的
 * （R-COM-37 要求读写极短超时、绝不阻塞详情页），它同时作用于自动装配的模板。
 * 认证场景是"要么成功要么明确失败"，冷连接建连 + INCR/EXPIRE 两跳用 50ms 会误判成
 * "Redis 不可用"——实测首次登录直接 503（{@code Command timed out after 50 millisecond(s)}）。
 *
 * <p>所以这里自建一个 500ms 命令超时的连接：连接参数仍读 {@code spring.data.redis.*}
 * （host/port/password），**不改任何共享配置**。
 *
 * <p>超时值取舍：500ms 足够覆盖冷连接与两跳命令，用户也无感；真宕机时 500ms 内必然报错，
 * 仍然走 Q1 的 fail-closed（503），不会被拖成"假成功"。
 */
@Component
public class AuthRedis implements DisposableBean {

    private static final Duration COMMAND_TIMEOUT = Duration.ofMillis(500);

    private final LettuceConnectionFactory factory;
    private final StringRedisTemplate template;

    public AuthRedis(RedisProperties props) {
        RedisStandaloneConfiguration standalone =
                new RedisStandaloneConfiguration(props.getHost(), props.getPort());
        if (props.getPassword() != null && !props.getPassword().isEmpty()) {
            standalone.setPassword(RedisPassword.of(props.getPassword()));
        }
        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
                .commandTimeout(COMMAND_TIMEOUT)
                .build();
        this.factory = new LettuceConnectionFactory(standalone, client);
        this.factory.afterPropertiesSet();
        this.template = new StringRedisTemplate(factory);
        this.template.afterPropertiesSet();
    }

    public StringRedisTemplate template() {
        return template;
    }

    @Override
    public void destroy() {
        try { factory.destroy(); } catch (Exception ignored) { }
    }
}
