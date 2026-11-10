package com.siyige.ai;

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
    private final boolean basicEnabled;
    private final String basicBaseUrl;
    private final String basicModel;
    private final String basicKey;

    public AiTier(LlmClient llm,
                  @Value("${siyige.ai.tiers.basic.enabled:false}") boolean basicEnabled,
                  @Value("${siyige.ai.tiers.basic.base-url:http://127.0.0.1:11434/v1}") String basicBaseUrl,
                  @Value("${siyige.ai.tiers.basic.model:qwen2.5:7b}") String basicModel,
                  @Value("${siyige.ai.tiers.basic.api-key:ollama}") String basicKey) {
        this.llm = llm;
        this.basicEnabled = basicEnabled;
        this.basicBaseUrl = basicBaseUrl;
        this.basicModel = basicModel;
        this.basicKey = basicKey;
    }

    /** 基础版是否可用（本地 ollama 没开就当没有这一档）。 */
    public boolean basicAvailable() { return basicEnabled; }

    /** 规范化档位名：非法值退回 PRO。 */
    public String normalize(String raw) {
        if (raw == null || raw.isBlank()) return PRO;
        String v = raw.trim().toUpperCase();
        if (BASIC.equals(v) && !basicEnabled) return PRO;      // 没装 ollama 就悄悄降级
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
        if (BASIC.equals(normalize(tier)) && basicEnabled) {
            return new LlmClient.Profile(basicBaseUrl, basicKey, basicModel);
        }
        return null;   // PRO 用平台默认；BYOK 由 UserLlmService 另行提供
    }

    public java.util.Map<String, Object> describe() {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("basic", java.util.Map.of(
                "key", BASIC, "label", "基础版", "available", basicEnabled,
                "model", basicModel, "note", "本地免费模型，速度一般，不额外收费"));
        m.put("pro", java.util.Map.of(
                "key", PRO, "label", "高级版", "available", true,
                "model", "deepseek-chat", "note", "平台模型，按 token 计费 + 服务费"));
        m.put("byok", java.util.Map.of(
                "key", BYOK, "label", "自带 Key", "available", true,
                "model", "自己的模型", "note", "用自己的额度，只收服务费"));
        return m;
    }
}
