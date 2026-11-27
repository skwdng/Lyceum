package com.siyige.admin.config;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 参数管理的单测（真 H2，不用 mock）。
 *
 * <p>为什么连真 H2：「先 update 再 insert」只有一行、历史表的 old_v/new_v、
 * 回滚时"删行回默认值"这些都发生在 SQL 里，mock 掉 repo 就等于没测。
 *
 * <p><b>本文件最重要的一条</b>：{@link #库里没有行时_10项默认值与改造前逐位一致()} ——
 * 这是红线 3（不重启也不改行为）的机器化断言。默认值一旦被"顺手改成 30"，
 * 这个测试立刻红。
 */
class ConfigServiceTest {

    private JdbcTemplate jdbc;
    private ConfigService cfg;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:cfg" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-config.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        cfg = new ConfigService(new ConfigRepo(jdbc));
    }

    private int rows(String key) {
        Integer n = jdbc.queryForObject("select count(*) from sy_config where k = ?", Integer.class, key);
        return n == null ? 0 : n;
    }

    private int logs(String key) {
        Integer n = jdbc.queryForObject("select count(*) from sy_config_log where k = ?", Integer.class, key);
        return n == null ? 0 : n;
    }

    // ==================== 改回默认值 = 删行（"恢复出厂"） ====================

    @Test
    void 改回默认值会删掉那一行_来源回到默认值且计数准确() {
        ConfigKey k = ConfigKey.TAG_MAX_PER_POST;
        assertEquals(0, rows(k.key()), "一开始库里没有行");

        cfg.set(k, "2", "admin");
        assertEquals(1, rows(k.key()), "改了非默认值 -> 落一行");
        assertEquals("DB", cfg.view(k).get("source"));
        assertEquals("2", cfg.view(k).get("value"));

        Map<String, Object> after = cfg.set(k, "5", "admin");   // 5 = 默认值
        assertEquals(0, rows(k.key()), "改回默认值 -> 那一行被删掉，不能留一条和默认相同的覆盖值");
        assertEquals("DEFAULT", after.get("source"), "来源要回到默认值");
        assertEquals("默认值", after.get("sourceLabel"));
        assertEquals(5, cfg.getInt(k), "读到的仍然是 5");

        // 历史要留两笔：2 和 5（谁改的、从什么改到什么）
        assertEquals(2, logs(k.key()));
    }

    @Test
    void 本来就是默认值时再存一次默认值_什么都不做也不记历史() {
        ConfigKey k = ConfigKey.ALERT_BACKLOG_THRESHOLD;
        cfg.set(k, "10", "admin");       // 10 = 默认值，且库里本来没有行
        assertEquals(0, rows(k.key()), "不该凭空写一行");
        assertEquals(0, logs(k.key()), "什么都没变，不该记历史");
    }

    // ==================== 红线 3：默认值 = 原值 ====================

    @Test
    void 库里没有行时_10项默认值与改造前逐位一致() {
        // 顺序与设计方案 §0 的表格一致：3 / 10 / true / false / baseUrl / 5 / 30 / 100 / 5 / 10
        assertEquals(3, cfg.getInt(ConfigKey.ALERT_REPORT_THRESHOLD), "告警阈值仍是 3（没趁机改 30）");
        assertEquals(10, cfg.getInt(ConfigKey.ALERT_BACKLOG_THRESHOLD));
        assertTrue(cfg.getBool(ConfigKey.VIDEO_AUDIT_CONSOLE), "视频复核台默认开");
        assertFalse(cfg.getBool(ConfigKey.AI_TIER_BASIC_ENABLED), "基础版默认关");
        assertEquals("http://127.0.0.1:11434/v1", cfg.getStr(ConfigKey.AI_TIER_BASIC_BASE_URL));
        assertEquals(5, cfg.getInt(ConfigKey.AI_DAILY_LIMIT));
        assertEquals(30, cfg.getInt(ConfigKey.BILLING_SERVICE_FEE));
        assertEquals(100, cfg.getInt(ConfigKey.BILLING_WELCOME_GRANT));
        assertEquals(5, cfg.getInt(ConfigKey.TAG_MAX_PER_POST));
        assertEquals(10, cfg.getInt(ConfigKey.TAG_MAX_NEW_PER_DAY));
        assertEquals(0, rows(ConfigKey.ALERT_REPORT_THRESHOLD.key()), "默认值不落库（没改过就一行都不占）");
    }

    @Test
    void 参数页每项都带来源与生效时机() {
        List<Map<String, Object>> items = cfg.list();
        assertEquals(ConfigKey.values().length, items.size());
        for (Map<String, Object> it : items) {
            assertEquals("DEFAULT", it.get("source"), it.get("key") + " 没改过，来源应是默认值");
            assertEquals("默认值", it.get("sourceLabel"));
            assertNotNull(it.get("effectLabel"));
            assertEquals(ConfigKey.of(String.valueOf(it.get("key"))).label(), it.get("label"));
        }
        // 第二批加入「对局」分组（4 个 pace.*），顺序 = 枚举出场顺序
        assertEquals(List.of("告警", "审核", "AI", "计费", "对局", "社区"), cfg.groups());
        // 告警两项是"下次扫描生效"，其余是"立即生效"
        assertEquals("NEXT_SCAN", ConfigKey.ALERT_REPORT_THRESHOLD.effect().name());
        assertEquals("NOW", ConfigKey.TAG_MAX_PER_POST.effect().name());
    }

    // ==================== 写：立即生效、只有一行、有历史 ====================

    @Test
    void 改完立刻生效_不用重启也不用等TTL() {
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "2", "admin");
        assertEquals(2, cfg.getInt(ConfigKey.TAG_MAX_PER_POST), "写操作要失效缓存，下一次读就是新值");
        assertEquals(1, rows(ConfigKey.TAG_MAX_PER_POST.key()));
        assertEquals("2", jdbc.queryForObject("select v from sy_config where k = ?", String.class,
                ConfigKey.TAG_MAX_PER_POST.key()));
        assertEquals("数据库", cfg.view(ConfigKey.TAG_MAX_PER_POST).get("sourceLabel"));
    }

    @Test
    void 同一个键改两次仍然只有一行_历史两条() {
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "2", "admin");
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "7", "ops");
        assertEquals(1, rows(ConfigKey.TAG_MAX_PER_POST.key()), "先 update 再 insert：第二次不该多一行");
        assertEquals(7, cfg.getInt(ConfigKey.TAG_MAX_PER_POST));

        List<Map<String, Object>> h = cfg.history(ConfigKey.TAG_MAX_PER_POST.key(), 10);
        assertEquals(2, h.size());
        // 第一次改之前库里没有这一行 -> old_v 为 null（前端显示"默认值 5"，回滚 = 删掉那一行）
        assertNull(h.get(1).get("oldValue"), "第一次改的旧值是 null（= 当时用的是默认值 5）");
        assertEquals("2", h.get(1).get("newValue"));
        assertEquals("admin", h.get(1).get("operator"));
        assertEquals("2", h.get(0).get("oldValue"));
        assertEquals("7", h.get(0).get("newValue"));
        assertEquals("ops", h.get(0).get("operator"));
        assertNotNull(h.get(0).get("createdAt"));
    }

    @Test
    void 改回默认值等于恢复出厂_行被删掉但读到的值仍然正确() {
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "50", "admin");
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "30", "admin");   // 30 = 默认值
        assertEquals(30, cfg.getInt(ConfigKey.BILLING_SERVICE_FEE), "读到的值仍然正确");
        assertEquals(0, rows(ConfigKey.BILLING_SERVICE_FEE.key()),
                "改回默认值 -> 删掉那一行（留一行等于默认的覆盖值会让「来源」和「已改过 N 项」失真）");
        assertEquals("DEFAULT", cfg.view(ConfigKey.BILLING_SERVICE_FEE).get("source"));
        assertEquals(2, cfg.history(ConfigKey.BILLING_SERVICE_FEE.key(), 10).size(), "两次改动都要留痕");
    }

    // ==================== 校验：坏值进不了库 ====================

    @Test
    void 非法整数被拒且库里不变() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.BILLING_SERVICE_FEE, "abc", "admin"));
        assertTrue(e.getMessage().startsWith("INVALID_PARAM:"), e.getMessage());
        assertEquals(0, rows(ConfigKey.BILLING_SERVICE_FEE.key()));
        assertEquals(30, cfg.getInt(ConfigKey.BILLING_SERVICE_FEE));
        assertEquals(0, logs(ConfigKey.BILLING_SERVICE_FEE.key()), "拒掉的写不该留历史");
    }

    @Test
    void 超出范围的整数被拒() {
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.TAG_MAX_PER_POST, "0", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.TAG_MAX_PER_POST, "21", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.AI_DAILY_LIMIT, "-1", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.AI_DAILY_LIMIT, "101", "admin"));
        assertEquals(5, cfg.getInt(ConfigKey.TAG_MAX_PER_POST));
        // 边界值本身要能写进去
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "20", "admin");
        assertEquals(20, cfg.getInt(ConfigKey.TAG_MAX_PER_POST));
        cfg.set(ConfigKey.AI_DAILY_LIMIT, "0", "admin");
        assertEquals(0, cfg.getInt(ConfigKey.AI_DAILY_LIMIT), "0 = 一次都不给，是合法值");
    }

    @Test
    void 布尔只认true和false_统一存小写() {
        cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "FALSE", "admin");
        assertFalse(cfg.getBool(ConfigKey.VIDEO_AUDIT_CONSOLE));
        assertEquals("false", jdbc.queryForObject("select v from sy_config where k = ?", String.class,
                ConfigKey.VIDEO_AUDIT_CONSOLE.key()), "统一转小写存");
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "yes", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "1", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.VIDEO_AUDIT_CONSOLE, "", "admin"));
    }

    @Test
    void 字符串不能为空_且自定义地址要带协议() {
        assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.AI_TIER_BASIC_BASE_URL, "   ", "admin"));
        assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.AI_TIER_BASIC_BASE_URL, "127.0.0.1:11434/v1", "admin"));
        cfg.set(ConfigKey.AI_TIER_BASIC_BASE_URL, "http://10.0.0.9:11434/v1", "admin");
        assertEquals("http://10.0.0.9:11434/v1", cfg.getStr(ConfigKey.AI_TIER_BASIC_BASE_URL));
        // 超长（> 500）要被拒
        assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.AI_TIER_BASIC_BASE_URL, "http://" + "a".repeat(600), "admin"));
    }

    @Test
    void 未知的键直接400_不会写进脏key() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> cfg.set("tag.max-perpost", "2", "admin"));
        assertTrue(e.getMessage().contains("未知参数"), e.getMessage());
        assertEquals(0, rows("tag.max-perpost"));
        assertThrows(IllegalArgumentException.class, () -> cfg.history("no.such.key", 10));
    }

    // ==================== 回滚 ====================

    @Test
    void 回滚到有旧值的那一条() {
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "2", "admin");   // 5 -> 2（改之前库里没有行，old_v = null）
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "7", "admin");   // 2 -> 7
        cfg.set(ConfigKey.TAG_MAX_PER_POST, "9", "admin");   // 7 -> 9
        // 历史是倒序：get(1) 就是"2 -> 7"那一条，它的 old_v = 2
        List<Map<String, Object>> h = cfg.history(ConfigKey.TAG_MAX_PER_POST.key(), 10);
        assertEquals("2", h.get(1).get("oldValue"));
        long logId = num(h.get(1).get("id"));

        Map<String, Object> after = cfg.rollback(logId, "super");
        assertEquals("2", after.get("value"), "回滚到那一条的旧值");
        assertEquals(2, cfg.getInt(ConfigKey.TAG_MAX_PER_POST));
        assertEquals(1, rows(ConfigKey.TAG_MAX_PER_POST.key()), "回滚是改值，不是删行");
        assertEquals(4, cfg.history(ConfigKey.TAG_MAX_PER_POST.key(), 10).size(), "回滚本身也留痕");
        assertEquals("super", cfg.history(ConfigKey.TAG_MAX_PER_POST.key(), 10).get(0).get("operator"));
    }

    @Test
    void 回滚到原本没有那一行_删行并回到默认值() {
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "50", "admin");
        long firstLog = num(cfg.history(ConfigKey.BILLING_SERVICE_FEE.key(), 10).get(0).get("id"));
        // 这一条的 old_v 是 null（改之前库里没有行）—— 手动造一条这种历史更直观
        cfg.rollback(firstLog, "super");
        // 上面回滚到 old_v=null：删行 -> 回到默认 30
        assertEquals(30, cfg.getInt(ConfigKey.BILLING_SERVICE_FEE));
        assertEquals(0, rows(ConfigKey.BILLING_SERVICE_FEE.key()), "删行 = 回到默认值（幂等于删 sy_config 那一行）");
        assertEquals("DEFAULT", cfg.view(ConfigKey.BILLING_SERVICE_FEE).get("source"));
    }

    @Test
    void 回滚不存在的历史报错() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> cfg.rollback(999999L, "super"));
        assertTrue(e.getMessage().startsWith("CONFIG_LOG_NOT_FOUND:"), e.getMessage());
    }

    // ==================== 第二批：7 项默认值 + DOUBLE 类型 ====================

    @Test
    void 第二批7项默认值与线上行为一致() {
        // 3 / 9000 / 0.05 / 300 / **700** / 1.0 / true
        assertEquals(3, cfg.getInt(ConfigKey.BILLING_CENTS_PER_1K));
        assertEquals(9000, cfg.getInt(ConfigKey.BILLING_ESTIMATE_TOKENS));
        assertEquals(0.05, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);
        assertEquals(300, cfg.getInt(ConfigKey.PACE_TURN_SECONDS));
        // ai-think-ms：yml 写 700，代码里的 @Value 默认是 1800 —— 线上真正生效的一直是 700
        assertEquals(700, cfg.getInt(ConfigKey.PACE_AI_THINK_MS), "默认值必须对齐 yml 的 700，不是代码里的 1800");
        assertEquals(1.0, cfg.getDouble(ConfigKey.PACE_AI_DELAY_SCALE), 1e-9);
        assertTrue(cfg.getBool(ConfigKey.AI_SPEECH_ENABLED));
        assertEquals(0, rows(ConfigKey.PACE_TIME_SCALE.key()), "默认值不落库");
    }

    @Test
    void DOUBLE能读能写_改完立刻生效() {
        assertEquals(0.05, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");
        assertEquals(1.0, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);
        assertEquals("1.0", jdbc.queryForObject("select v from sy_config where k = ?", String.class,
                ConfigKey.PACE_TIME_SCALE.key()));
        cfg.set(ConfigKey.PACE_AI_DELAY_SCALE, "2.5", "admin");
        assertEquals(2.5, cfg.getDouble(ConfigKey.PACE_AI_DELAY_SCALE), 1e-9);
    }

    @Test
    void DOUBLE存原样_1不会被改写成1点0() {
        cfg.set(ConfigKey.PACE_AI_DELAY_SCALE, "1", "admin");
        assertEquals("1", jdbc.queryForObject("select v from sy_config where k = ?", String.class,
                ConfigKey.PACE_AI_DELAY_SCALE.key()), "按执行提示词：存 trim 后的原样");
        assertEquals(1.0, cfg.getDouble(ConfigKey.PACE_AI_DELAY_SCALE), 1e-9, "读出来仍是 1.0");
    }

    @Test
    void DOUBLE坏值被拒且库里不变() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.PACE_TIME_SCALE, "abc", "admin"));
        assertTrue(e.getMessage().startsWith("INVALID_PARAM:"), e.getMessage());
        assertTrue(e.getMessage().contains("必须是数字"), e.getMessage());
        assertEquals(0, rows(ConfigKey.PACE_TIME_SCALE.key()));
        assertEquals(0.05, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);

        assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.PACE_TIME_SCALE, "NaN", "admin"));
        assertThrows(IllegalArgumentException.class,
                () -> cfg.set(ConfigKey.PACE_TIME_SCALE, "", "admin"));
    }

    @Test
    void DOUBLE超范围被拒_端点能写() {
        // pace.time-scale: [0.05, 3.0]
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.PACE_TIME_SCALE, "0.01", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.PACE_TIME_SCALE, "5.0", "admin"));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "0.05", "admin");
        assertEquals(0.05, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);
        cfg.set(ConfigKey.PACE_TIME_SCALE, "3.0", "admin");
        assertEquals(3.0, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);

        // pace.ai-delay-scale: [0.05, 5.0]
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.PACE_AI_DELAY_SCALE, "0.01", "admin"));
        assertThrows(IllegalArgumentException.class, () -> cfg.set(ConfigKey.PACE_AI_DELAY_SCALE, "5.5", "admin"));
    }

    @Test
    void 库里DOUBLE是坏值时回落默认值不打崩接口() {
        jdbc.update("insert into sy_config(k, v, type, updated_by) values(?, 'abc', 'DOUBLE', 'dba')",
                ConfigKey.PACE_TIME_SCALE.key());
        assertEquals(0.05, cfg.getDouble(ConfigKey.PACE_TIME_SCALE), 1e-9);
    }

    // ==================== 第三批：7 项默认值 ====================

    @Test
    void 第三批7项默认值与线上行为一致() {
        // 4 / 60 / true / true / qwen2.5:7b / 1 / 12
        assertEquals(4, cfg.getInt(ConfigKey.VIDEO_TITLE_MIN));
        assertEquals(60, cfg.getInt(ConfigKey.VIDEO_TITLE_MAX));
        assertTrue(cfg.getBool(ConfigKey.VIDEO_ALLOW_LOCAL_UPLOAD));
        assertTrue(cfg.getBool(ConfigKey.VIDEO_PASS_REQUIRES_REVIEW));
        assertEquals("qwen2.5:7b", cfg.getStr(ConfigKey.AI_TIER_BASIC_MODEL));
        assertEquals(1, cfg.getInt(ConfigKey.TAG_NAME_MIN_CP));
        assertEquals(12, cfg.getInt(ConfigKey.TAG_NAME_MAX_CP));
        assertEquals(0, rows(ConfigKey.VIDEO_TITLE_MIN.key()), "默认值不落库");
        assertEquals(24, ConfigKey.values().length, "两批 17 + 第三批 7 = 24 项");
    }

    @Test
    void 词表不进参数表() {
        // 词表是一整串词、改一个要改整串还要重启解析，留给以后的「词表管理」页
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.reject-words"));
        assertThrows(IllegalArgumentException.class, () -> ConfigKey.of("video.audit.review-words"));
    }

    // ==================== 缓存 ====================

    @Test
    void 外部直接改库_30秒内仍读缓存_失效后读新值() {
        cfg.set(ConfigKey.AI_DAILY_LIMIT, "9", "admin");
        assertEquals(9, cfg.getInt(ConfigKey.AI_DAILY_LIMIT));
        // 绕过本服务直接改库（模拟"别人用工具改了"）：缓存还在，读到的还是 9
        jdbc.update("update sy_config set v = '7' where k = ?", ConfigKey.AI_DAILY_LIMIT.key());
        assertEquals(9, cfg.getInt(ConfigKey.AI_DAILY_LIMIT), "TTL 内的兜底：短时间内仍读缓存");
        cfg.invalidate(ConfigKey.AI_DAILY_LIMIT);
        assertEquals(7, cfg.getInt(ConfigKey.AI_DAILY_LIMIT), "失效后必须读库");
    }

    @Test
    void 库里存了坏值时回落默认值不打崩接口() {
        jdbc.update("insert into sy_config(k, v, type, updated_by) values(?, 'abc', 'INT', 'dba')",
                ConfigKey.AI_DAILY_LIMIT.key());
        assertEquals(5, cfg.getInt(ConfigKey.AI_DAILY_LIMIT), "解析不了就用默认值，绝不让接口 500");
    }

    @Test
    void 表不存在也不影响业务_回落默认值() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:cfgempty" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        ConfigService lonely = new ConfigService(new ConfigRepo(new JdbcTemplate(ds)));
        assertEquals(5, lonely.getInt(ConfigKey.TAG_MAX_PER_POST), "参数表读不到也要能跑（回落默认值）");
        assertFalse(lonely.fromDb(ConfigKey.TAG_MAX_PER_POST));
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(v));
    }
}
