package com.siyige.ai;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.service.EvidenceService;
import com.siyige.service.UtteranceCheck;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * ai.speech-enabled 改成后台参数之后的行为（参数管理第二批 D4）。
 *
 * <p>这条开关**唯一的用处**就是 {@link AiService#llmEnabled()}：
 * 它 = 有 key（{@code llm.enabled()}）**且**后台没关这条通道。
 * 所以关掉它之后，AI 发言会退回模板兜底（不是"只隐藏一个语音按钮"）——
 * 这一点在参数页的提示文案里写清楚了。
 *
 * <p>yml 里**没有**这个键，值来自代码默认 true；ConfigKey 默认值也写 true，行为不变。
 */
class AiServiceConfigTest {

    private ConfigService cfg;
    private LlmClient llm;
    private AiService ai;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:aispeech" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
        }
        cfg = new ConfigService(new ConfigRepo(new JdbcTemplate(ds)));

        llm = mock(LlmClient.class);
        when(llm.enabled()).thenReturn(true);
        ai = new AiService(llm, mock(EvidenceService.class), mock(UtteranceCheck.class), cfg);
    }

    @Test
    void 默认开启_有key就走模型() {
        assertTrue(ai.llmEnabled());
    }

    @Test
    void 后台关掉_同一实例立刻不再走模型() {
        cfg.set(ConfigKey.AI_SPEECH_ENABLED, "false", "admin");
        assertFalse(ai.llmEnabled(), "改完立刻生效，不用重启");

        cfg.set(ConfigKey.AI_SPEECH_ENABLED, "true", "admin");
        assertTrue(ai.llmEnabled(), "再打开又恢复");
    }

    @Test
    void 没有key时_开关是什么都不走模型() {
        cfg.set(ConfigKey.AI_SPEECH_ENABLED, "true", "admin");
        when(llm.enabled()).thenReturn(false);
        assertFalse(ai.llmEnabled(), "两个条件是与关系：没 key 就不走模型");
    }
}
