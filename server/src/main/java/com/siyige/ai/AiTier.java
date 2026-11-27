package com.siyige.ai;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * AI 档位。
 *
 * <p>三档，区别只在「用谁的模型」和「怎么计费」：
 * <pre>
 *   BASIC  基础版   本地 Ollama（免费模型）      不计模型成本，也不收服务费
 *   PRO    高级版   平台 DeepSeek              按 token 计费 + 服务费
 *   BYOK   自带 Key 用户自己的 baseUrl/key/model  只收服务费
 * </pre>
 *
 * <p>为什么这么分：辩论的核心体验是"有对手、有赛制"，不是"模型多强"。
 * 基础版让没有付费意愿的用户也能完整打完一场；高级版卖给在意质量的人。
 */
@Component
public class AiTier {

    private static final Logger log = LoggerFactory.getLogger(AiTier.class);

    public static final String BASIC = "BASIC";
    public static final String PRO = "PRO";
    public static final String BYOK = "BYOK";

    private final LlmClient llm;
    /**
     * 基础版的开关 / 地址 / 模型名**全部从后台参数读**（参数管理第一、三批）：每次现读，改完立刻生效。
     *
     * <p>为什么不留在构造器里：{@code @Value} 是启动时注入一次的，字段一旦存下来，
     * 后台改了也不会变 —— 这正是本期要拆掉的"启动时定死"。
     */
    private final ConfigService cfg;
    /** Key 属密钥，永远不进后台（仍然只在启动时读一次）。 */
    private final String basicKey;

    public AiTier(LlmClient llm, ConfigService cfg,
                  @Value("${siyige.ai.tiers.basic.api-key:ollama}") String basicKey) {
        this.llm = llm;
        this.cfg = cfg;
        this.basicKey = basicKey;
    }

    /** 基础版是否可用（本地 ollama 没开就当没有这一档）。 */
    public boolean basicAvailable() { return basicEnabled(); }

    /** 基础版开关（每次现读后台参数）。 */
    private boolean basicEnabled() { return cfg.getBool(ConfigKey.AI_TIER_BASIC_ENABLED); }

    /** 基础版模型地址（每次现读后台参数）。 */
    private String basicBaseUrl() { return cfg.getStr(ConfigKey.AI_TIER_BASIC_BASE_URL); }

    /** 基础版模型名（每次现读后台参数；换模型不用重启）。 */
    private String basicModel() { return cfg.getStr(ConfigKey.AI_TIER_BASIC_MODEL); }

    /** 规范化档位名：非法值退回 PRO。 */
    public String normalize(String raw) {
        if (raw == null || raw.isBlank()) return PRO;
        String v = raw.trim().toUpperCase();
        if (BASIC.equals(v) && !basicEnabled()) return PRO;    // 后台关了基础版就悄悄降级
        return switch (v) {
            case BASIC, PRO, BYOK -> v;
            default -> PRO;
        };
    }

    /** 这一档要不要按 token 收模型成本（基础版免费、自带 Key 用户自付）。 */
    public boolean chargeModelCost(String tier) {
        return PRO.equals(normalize(tier));
    }

    /** 这一档要不要收服务费（基础版免费）。 */
    public boolean chargeServiceFee(String tier) {
        return !BASIC.equals(normalize(tier));
    }

    /** 这一档对应的模型配置；PRO 返回 null 表示用平台默认。 */
    public LlmClient.Profile profileOf(String tier) {
        if (BASIC.equals(normalize(tier)) && basicEnabled()) {
            return new LlmClient.Profile(basicBaseUrl(), basicKey, basicModel());
        }
        return null;   // PRO 用平台默认；BYOK 由 UserLlmService 另行提供
    }

    public java.util.Map<String, Object> describe() {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("basic", java.util.Map.of(
                "key", BASIC, "label", "基础版", "available", basicEnabled(),
                "model", basicModel(), "note", "本地免费模型，速度一般，不额外收费"));
        m.put("pro", java.util.Map.of(
                "key", PRO, "label", "高级版", "available", true,
                "model", "deepseek-chat", "note", "平台模型，按 token 计费 + 服务费"));
        m.put("byok", java.util.Map.of(
                "key", BYOK, "label", "自带 Key", "available", true,
                "model", "自己的模型",
                "note", "填自己的 key 或本地模型地址（如 http://127.0.0.1:11434/v1），完全免费"));
        return m;
    }
}
