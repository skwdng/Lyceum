package com.siyige.video;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 机器初审的四个判定参数改成后台可改之后的行为（参数管理第三批 E1）。
 *
 * <p>用真 H2（只有参数表）+ 直接把 @Value 的两个词表传进去，不启动 Spring：
 * 这里要验的是「现读 -> 判定结果怎么变」，不是 Spring 装配。
 *
 * <p>重点两条：
 * ① 标题长度上下限各自合法、组合起来配反（min > max）时**不能把所有标题都拒掉** ——
 *    这是单键校验拦不住的，必须在读的地方兜；
 * ② 关掉 allow-local-upload 只影响 /uploads/ 本地路径，外链照旧。
 */
class MachineAuditConfigTest {

    private JdbcTemplate jdbc;
    private ConfigService cfg;
    private MachineAuditService audit;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:maudit" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        cfg = new ConfigService(new ConfigRepo(jdbc));
        // 词表仍然走构造器（本批不搬），给一个违禁词用于验证词表逻辑没被动过
        audit = new MachineAuditService("违禁词甲,违禁词乙", "", cfg);
    }

    /** 长度合适的标题 + 合法外链（避开「标题短且无简介」那条 REVIEW 规则） */
    private static final String OK_TITLE = "一二三四五六七八九十";   // 10 个字
    private static final String OK_URL = "https://cdn.example.com/a.mp4";

    private MachineAuditService.Verdict check(String title) {
        return audit.check(title, "", OK_URL, null);
    }

    // ==================== 标题长度上下限 ====================

    @Test
    void 默认区间_4到60字() {
        assertEquals("REVIEW", check(OK_TITLE).result(), "默认 pass-requires-review=true -> 机器过了等人工");
        assertEquals("REJECT", check("一二三").result(), "3 个字 < 默认下限 4");
        assertEquals("REJECT", check("一".repeat(61)).result(), "61 个字 > 默认上限 60");
    }

    @Test
    void 把title_max改成10_11个字的标题立刻被驳回_改回60又通过() {
        cfg.set(ConfigKey.VIDEO_TITLE_MAX, "10", "admin");
        MachineAuditService.Verdict v = check("一二三四五六七八九十一");   // 11 个字
        assertEquals("REJECT", v.result());
        assertTrue(v.reason().contains("超过 10 字"), "文案要带当前上限：" + v.reason());

        cfg.set(ConfigKey.VIDEO_TITLE_MAX, "60", "admin");
        assertEquals("REVIEW", check("一二三四五六七八九十一").result(), "改回 60 后同一个标题就不该被拒");
    }

    @Test
    void 把title_min改成8_7个字的标题被驳回_文案带当前区间() {
        cfg.set(ConfigKey.VIDEO_TITLE_MIN, "8", "admin");
        MachineAuditService.Verdict v = check("一二三四五六七");           // 7 个字
        assertEquals("REJECT", v.result());
        assertTrue(v.reason().contains("少于 8 字"), "文案要带当前下限：" + v.reason());
        assertEquals("REVIEW", check("一二三四五六七八").result(), "正好 8 个字要放行（不是「小于等于」）");
    }

    @Test
    void 区间配反了_min大于max_回退4到60并打WARN_不会全员拒绝() {
        Logger logger = (Logger) LoggerFactory.getLogger(MachineAuditService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            // 两个键各自都在范围内（min 1-30、max 1-200），但组合起来是 25 > 10 —— 单键校验拦不住
            cfg.set(ConfigKey.VIDEO_TITLE_MIN, "25", "admin");
            cfg.set(ConfigKey.VIDEO_TITLE_MAX, "10", "admin");

            // 12 个字：按 25-10 会被「少于 25 字」拒；按兜底的 4-60 应该放行
            MachineAuditService.Verdict v = check(OK_TITLE + "一二");
            assertNotEquals("REJECT", v.result(), "配反了也不能把所有标题都拒掉：" + v.reason());

            boolean warned = appender.list.stream().anyMatch(e -> e.getLevel() == Level.WARN
                    && e.getFormattedMessage().contains("title-min(25)")
                    && e.getFormattedMessage().contains("title-max(10)"));
            assertTrue(warned, "必须打一条 WARN 说明按默认处理，实际日志："
                    + appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList());

            // 页面上的规则说明也应该是真正生效的 4/60（而不是 50/10）
            Map<String, Object> rules = audit.rules();
            assertEquals(4, rules.get("titleMin"));
            assertEquals(60, rules.get("titleMax"));
        } finally {
            logger.detachAppender(appender);
        }
    }

    // ==================== 本地上传开关 ====================

    @Test
    void 关掉本地上传_只拒uploads_外链照旧() {
        assertEquals("REVIEW", audit.check(OK_TITLE, "", "/uploads/a.mp4", null).result(),
                "默认允许本地上传");

        cfg.set(ConfigKey.VIDEO_ALLOW_LOCAL_UPLOAD, "false", "admin");
        MachineAuditService.Verdict local = audit.check(OK_TITLE, "", "/uploads/a.mp4", null);
        assertEquals("REJECT", local.result());
        assertTrue(local.reason().contains("视频地址不合法"), local.reason());

        assertEquals("REVIEW", audit.check(OK_TITLE, "", OK_URL, null).result(), "外链仍然可以");
        assertEquals("REVIEW", audit.check(OK_TITLE, "", "http://x.com/b.mp4", null).result());
    }

    // ==================== 机器通过后是否要人工复核 ====================

    @Test
    void 关掉人工复核_机器PASS就直接PASS() {
        assertEquals("REVIEW", check(OK_TITLE).result(), "默认：机器过了还要人工看一眼");
        cfg.set(ConfigKey.VIDEO_PASS_REQUIRES_REVIEW, "false", "admin");
        assertEquals("PASS", check(OK_TITLE).result(), "关掉后机器过了就直接上线");
        cfg.set(ConfigKey.VIDEO_PASS_REQUIRES_REVIEW, "true", "admin");
        assertEquals("REVIEW", check(OK_TITLE).result());
    }

    // ==================== 词表没被动过 ====================

    @Test
    void 词表仍然是构造期解析的那两个List_不进参数表() {
        assertEquals("REJECT", audit.check(OK_TITLE, "这里提到违禁词甲", OK_URL, null).result());
        // 参数表里不该出现词表键
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.reject-words"));
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.review-words"));
    }
}
