package com.siyige.ai;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * AI 档位：基础版的"开关"与"地址"改成后台参数之后的行为（参数管理第一批）。
 *
 * <p>改造前这两个值是构造时 {@code @Value} 注入的 final 字段 ——
 * 后台就算能改，进程里也永远读的是启动那一刻的值。这里证明现在不是这样：
 * 同一个 {@link AiTier} 实例，改完参数下一次调用就换档/换地址。
 */
class AiTierConfigTest {

    private ConfigService cfg;
    private AiTier tier;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:aitier" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
        }
        cfg = new ConfigService(new ConfigRepo(new JdbcTemplate(ds)));
        // 模型名第三批也搬进后台参数了；只剩 Key（密钥）还在构造器里
        tier = new AiTier(mock(LlmClient.class), cfg, "ollama");
    }

    @Test
    void 默认基础版是关的_请求BASIC会被降级成PRO() {
        assertFalse(tier.basicAvailable());
        assertEquals(AiTier.PRO, tier.normalize(AiTier.BASIC), "没开基础版就悄悄降级（改造前行为）");
        assertNull(tier.profileOf(AiTier.BASIC), "降级成 PRO -> 用平台默认配置");
        assertTrue(tier.chargeServiceFee(AiTier.BASIC), "降级后按 PRO 收服务费");
    }

    @Test
    void 后台打开基础版_同一实例立刻可再用_且不收服务费() {
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "true", "admin");

        assertTrue(tier.basicAvailable(), "改完立刻生效，没有重启");
        assertEquals(AiTier.BASIC, tier.normalize(AiTier.BASIC));
        assertFalse(tier.chargeServiceFee(AiTier.BASIC), "基础版不收服务费");
        assertFalse(tier.chargeModelCost(AiTier.BASIC), "基础版不收模型成本");
        LlmClient.Profile p = tier.profileOf(AiTier.BASIC);
        assertNotNull(p);
        assertEquals("http://127.0.0.1:11434/v1", p.baseUrl(), "默认地址 = 改造前 yml 的值");
        assertEquals("qwen2.5:7b", p.model());
    }

    @Test
    void 后台改基础版地址_下一次调用就用新地址() {
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "true", "admin");
        cfg.set(ConfigKey.AI_TIER_BASIC_BASE_URL, "http://10.0.0.9:11434/v1", "admin");
        assertEquals("http://10.0.0.9:11434/v1", tier.profileOf(AiTier.BASIC).baseUrl());
    }

    @Test
    void 后台关掉基础版_立刻又降级() {
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "true", "admin");
        assertEquals(AiTier.BASIC, tier.normalize(AiTier.BASIC));
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "false", "admin");
        assertEquals(AiTier.PRO, tier.normalize(AiTier.BASIC));
    }

    @Test
    void 后台改基础版模型名_下一次profileOf就用新模型() {
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "true", "admin");
        assertEquals("qwen2.5:7b", tier.profileOf(AiTier.BASIC).model(), "默认模型名 = 改造前 yml 的值");

        cfg.set(ConfigKey.AI_TIER_BASIC_MODEL, "llama3", "admin");
        LlmClient.Profile p = tier.profileOf(AiTier.BASIC);
        assertEquals("llama3", p.model(), "换模型不用重启");
        assertEquals("http://127.0.0.1:11434/v1", p.baseUrl(), "地址不受影响");
        assertEquals("ollama", p.apiKey(), "Key 仍在构造器里（密钥不进后台）");

        // describe() 给前端看的模型名也要是实时的
        Map<String, Object> basic = (Map<String, Object>) tier.describe().get("basic");
        assertEquals("llama3", basic.get("model"));
    }

    @Test
    void 档位说明接口跟着参数走() {
        assertFalse(available(tier.describe(), "basic"));
        cfg.set(ConfigKey.AI_TIER_BASIC_ENABLED, "true", "admin");
        assertTrue(available(tier.describe(), "basic"), "前端拿到的 available 也要是实时的");
    }

    @SuppressWarnings("unchecked")
    private static boolean available(Map<String, Object> describe, String tierKey) {
        Map<String, Object> one = (Map<String, Object>) describe.get(tierKey);
        return Boolean.TRUE.equals(one.get("available"));
    }
}
