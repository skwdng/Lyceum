package com.siyige.video;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.siyige.admin.AuditLog;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.admin.words.WordRepo;
import com.siyige.admin.words.WordScope;
import com.siyige.admin.words.WordService;
import com.siyige.community.SensitiveWordMasker;
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
    private WordService words;
    private MachineAuditService audit;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:maudit" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
            // 屏蔽词表（W1）：MachineAuditService 的两份词表现在从这里读
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-word.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        cfg = new ConfigService(new ConfigRepo(jdbc));
        words = new WordService(new WordRepo(jdbc), new SensitiveWordMasker(java.util.List.of()),
                org.mockito.Mockito.mock(AuditLog.class));
        words.seed(WordScope.VIDEO_REJECT, java.util.List.of("违禁词甲", "违禁词乙"), "test");
        words.seed(WordScope.VIDEO_REVIEW, java.util.List.of("争议词"), "test");
        words.reload();
        audit = new MachineAuditService(cfg, words);
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

    /**
     * 词表从库读（屏蔽词管理 W1）：加词立刻生效、删词立刻失效，都不用重启。
     *
     * <p>顺便钉住「词表不进参数表」：{@code video.audit.reject-words} 这类键在 ConfigKey 里不存在，
     * 谁想把它加回参数页都会在这里红。
     */
    @Test
    void 词表来自库_加词立刻REJECT_删词立刻不再命中() {
        assertEquals("REVIEW", check(OK_TITLE).result(), "没加词之前 10 字的正常标题不该被拒");

        words.add(WordScope.VIDEO_REJECT, java.util.List.of("测试违禁词"), 1L, "admin", "127.0.0.1");
        MachineAuditService.Verdict hit = audit.check(OK_TITLE, "这里提到测试违禁词", OK_URL, null);
        assertEquals("REJECT", hit.result(), "加了词立刻生效（不用重启）");
        assertTrue(hit.reason().contains("违禁词"), hit.reason());

        java.util.List<?> items = (java.util.List<?>) words
                .list(WordScope.VIDEO_REJECT.name(), "测试违禁词", 1, 10).get("items");
        Map<?, ?> row = (Map<?, ?>) items.get(0);
        words.delete(((Number) row.get("id")).longValue(), 1L, "admin", "127.0.0.1");

        assertEquals("REVIEW", audit.check(OK_TITLE, "这里提到测试违禁词", OK_URL, null).result(),
                "删词之后同一个视频就不再被拒");

        // 参数表里不该出现词表键（词表有自己的管理页）
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.reject-words"));
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.review-words"));
    }

    /** 软风险词：命中转人工（VIDEO_REVIEW 与 VIDEO_REJECT 是两条独立的表）。 */
    @Test
    void 转人工词命中就REVIEW_不会REJECT() {
        MachineAuditService.Verdict v = audit.check(OK_TITLE, "这句里有个争议词", OK_URL, null);
        assertEquals("REVIEW", v.result());
        assertTrue(v.reason().contains("人工"), v.reason());
    }
}
