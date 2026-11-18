package com.siyige.admin;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.video.MachineAuditService;
import com.siyige.video.VideoRepo;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 视频复核台的开关改成后台参数之后的行为（参数管理第一批）。
 *
 * <p>只测"开关怎么生效"，不测复核流程本身（判定/恢复/日志是视频模块与 B3 的事）：
 * 数据层全部 mock，参数走真 H2。改造前的开关是 {@code @Value} 字段，
 * 关掉必须重启才生效 —— 这里证明现在关掉立刻 403。
 */
class AdminVideoAuditConfigTest {

    private ConfigService cfg;
    private AdminVideoAuditService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:vcfg" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
        }
        cfg = new ConfigService(new ConfigRepo(new JdbcTemplate(ds)));

        AdminVideoAuditRepo repo2 = mock(AdminVideoAuditRepo.class);
        when(repo2.count(any(), any(), anyString(), any(), any())).thenReturn(0L);
        service = new AdminVideoAuditService(mock(VideoRepo.class), repo2,
                mock(MachineAuditService.class), mock(AuditLog.class), cfg);
    }

    @Test
    void 默认开着_队列可查() {
        assertTrue(service.consoleEnabled(), "默认值 = 改造前 yml 里的 true");
        Map<String, Object> q = service.queue(null, null, null, null, null, 1, 20);
        assertEquals(0L, q.get("total"));
        assertTrue(Boolean.TRUE.equals(service.rules().get("consoleEnabled")));
    }

    @Test
    void 后台关掉复核台_同一实例立刻403_不用重启() {
        cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "false", "admin");

        assertFalse(service.consoleEnabled());
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.queue(null, null, null, null, null, 1, 20));
        assertTrue(e.getMessage().startsWith("CONSOLE_DISABLED:"), e.getMessage());

        assertThrows(IllegalArgumentException.class, () -> service.logs(1L));
        assertThrows(IllegalArgumentException.class, () -> service.decide(1L, "PASS", null, 1L, "admin", "127.0.0.1"));
        assertThrows(IllegalArgumentException.class, () -> service.restore(1L, 1L, "admin", "127.0.0.1"));

        // 机器审核规则里的开关也要跟着变（前端据此隐藏「审核台」按钮）
        assertFalse(Boolean.TRUE.equals(service.rules().get("consoleEnabled")));
    }

    @Test
    void 后台再打开_立刻恢复() {
        cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "false", "admin");
        cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "true", "admin");
        assertTrue(service.consoleEnabled());
        assertNotNull(service.queue(null, null, null, null, null, 1, 20));
    }
}
