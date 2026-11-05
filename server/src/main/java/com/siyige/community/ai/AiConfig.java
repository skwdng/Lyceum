package com.siyige.community.ai;

import com.siyige.ai.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 社区 AI 的总开关（决策 8）。
 *
 * <p>三个条件**全部**满足才算开启：
 * <ol>
 *   <li>{@code siyige.ai.enabled=true}（本地配置里打开）</li>
 *   <li>{@code siyige.llm.api-key} 非空（{@link LlmClient#enabled()}）</li>
 *   <li>Redis 可达（启动时 PING 一次；Streams 与限额都依赖它）</li>
 * </ol>
 *
 * <p>任一不满足 → {@link #enabled()} 恒为 false：消费者线程不启动、{@code maybeEnqueue} 直接返回，
 * 用户正文里的 {@code @DeepSeek} 就只是**普通文本**（方案 §7 第一行）。
 *
 * <p>为什么在启动时 PING 一次而不是每次调用时判断：这是一次性能力开关，
 * 启动后就固定下来，避免运行期每次请求多一次 Redis 往返；Redis 中途挂掉由各调用点自己 catch + warn。
 */
@Component
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    private final boolean enabled;
    private final String reason;

    public AiConfig(@Value("${siyige.ai.enabled:false}") boolean flag,
                    LlmClient llm,
                    AiRedis aiRedis) {
        boolean ok = flag;
        String why = "已启用";

        if (!ok) {
            why = "siyige.ai.enabled=false（未打开总开关）";
        } else if (!llm.enabled()) {
            ok = false;
            why = "未配置 siyige.llm.api-key";
        } else {
            try {
                // 真打一次 Redis（随便一个只读命令）：确认连接、密码、以及 Streams 依赖都活着
                aiRedis.template().hasKey("ai:ping");
            } catch (RuntimeException e) {
                ok = false;
                why = "Redis 不可用：" + e.getClass().getSimpleName();
            }
        }

        this.enabled = ok;
        this.reason = why;
        if (ok) {
            log.info("社区 AI 助手：已启用（账号 {} / 昵称 {}）", AiAccount.ID, AiAccount.NAME);
        } else {
            log.info("社区 AI 助手：未启用（{}）—— @{} 只是普通文本", why, AiAccount.NAME);
        }
    }

    /** AI 功能是否整体可用。 */
    public boolean enabled() { return enabled; }

    /** 未启用时的原因（写日志 / 排查用）。 */
    public String reason() { return reason; }
}
