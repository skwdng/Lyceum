package com.siyige.community.ai;

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
 * 社区 AI 专用的 Redis 客户端（只给**阻塞读**和启动自检用）。
 *
 * <p><b>为什么不能直接用自动装配的 {@link StringRedisTemplate}：</b>
 * {@code application.yml} 里 {@code spring.data.redis.timeout=50ms} 是给社区浏览计数定的
 * （R-COM-37 要求极短超时、绝不阻塞详情页），它同时作用于自动装配的模板。
 * 而 {@code XREADGROUP ... BLOCK 5000} 要阻塞 5 秒才返回，
 * 50ms 的命令超时会把它掐断 —— 实测现象是消费者每 5 秒打一条
 * {@code QueryTimeoutException: Redis command timed out}，永远读不到消息。
 *
 * <p>所以这里照 {@code com.siyige.auth.AuthRedis} 的同一做法：自建一个 15 秒命令超时的连接
 * （＝ BLOCK 5s + 余量），连接参数仍读 {@code spring.data.redis.*}，
 * <b>不改任何共享配置</b>。
 *
 * <p>分工很清楚：
 * <ul>
 *   <li>生产者 XADD、配额、锁 → 共享模板（50ms 快速失败，绝不拖慢用户的发帖/评论）</li>
 *   <li>消费者的 XREADGROUP / XACK / XPENDING / XCLAIM → 本模板（长超时）</li>
 * </ul>
 */
@Component
public class AiRedis implements DisposableBean {

    /** 必须大于 {@code AiQueue.READ_BLOCK}(5s)，留 10 秒余量。 */
    private static final Duration COMMAND_TIMEOUT = Duration.ofSeconds(15);

    private final LettuceConnectionFactory factory;
    private final StringRedisTemplate template;

    public AiRedis(RedisProperties props) {
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
        try {
            factory.destroy();
        } catch (Exception ignored) {
            // 关闭失败不影响进程退出
        }
    }
}
