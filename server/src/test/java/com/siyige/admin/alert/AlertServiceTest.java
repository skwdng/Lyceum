package com.siyige.admin.alert;

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
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 告警规则 / 去重 / 状态机 / 静音的单元测试（真 H2 + mock 掉 SSE）。
 *
 * <p>为什么连真 H2：去重靠**唯一索引**、回落靠 `update ... where status='OPEN'`，
 * mock 掉 repo 这些都没测到。SSE 只负责"推一下未读数"，mock 掉不影响结论。
 *
 * <p>阈值走参数管理的默认值（{@link ConfigKey#ALERT_REPORT_THRESHOLD} = 3，与改造前的常量一致）：
 * 断言里从不写死数字，"上线在后台改成 30"之后这些测试照样成立。
 */
class AlertServiceTest {

    /** 默认阈值（参数管理的默认值 = 改造前的常量值）；"改阈值"的用例在下面单独造。 */
    private static final int T = Integer.parseInt(ConfigKey.ALERT_REPORT_THRESHOLD.def());
    /** 默认积压阈值。 */
    private static final int BACKLOG = Integer.parseInt(ConfigKey.ALERT_BACKLOG_THRESHOLD.def());

    private JdbcTemplate jdbc;
    private AlertRepo repo;
    private AlertSse sse;
    private ConfigService cfg;
    private AlertService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:alert" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                    "schema-admin.sql", "schema-analytics.sql", "schema-alert.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        repo = new AlertRepo(jdbc);
        sse = mock(AlertSse.class);
        cfg = new ConfigService(new ConfigRepo(jdbc));
        service = new AlertService(repo, sse, cfg);

        // 让 DAU 规则不干扰：昨天的活跃统计补一行
        jdbc.update("insert into sy_daily_active(day_key, dau, new_users) values (?, 1, 0)",
                java.sql.Date.valueOf(LocalDate.now(ZoneId.systemDefault()).minusDays(1)));
    }

    // ==================== 造数 ====================

    private long post(String author) {
        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt, status) "
                + "values(?, 'CHAT', '标题', '正文', '正文', 1)", author);
        return jdbc.queryForObject("select max(id) from sy_post", Long.class);
    }

    private long comment(long postId, String author) {
        jdbc.update("insert into sy_post_comment(post_id, user_id, body, status) values(?, ?, '评论', 1)",
                postId, author);
        return jdbc.queryForObject("select max(id) from sy_post_comment", Long.class);
    }

    /** 造 n 条举报（举报人去重，否则撞 ux_report_once）。 */
    private void reports(String targetType, long targetId, int n, String status, Instant when) {
        for (int i = 0; i < n; i++) {
            jdbc.update("insert into sy_report(target_type, target_id, reporter_id, reason, status, created_at) "
                            + "values(?, ?, ?, 'SPAM', ?, ?)",
                    targetType, targetId, "r" + targetType + targetId + i + status + n + when.toEpochMilli(),
                    status, Timestamp.from(when));
        }
    }

    private List<Map<String, Object>> alerts(String ruleKey) {
        return jdbc.queryForList("select * from sy_alert where rule_key = ? order by id", ruleKey);
    }

    private Map<String, Object> alertOf(String ruleKey, String targetId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_alert where rule_key = ? and target_id = ?", ruleKey, targetId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ==================== 阈值边界 ====================

    @Test
    void 正好等于阈值不报_超过才报() {
        long p1 = post("u-th");
        reports("POST", p1, T, "PENDING", Instant.now());        // = 阈值
        service.scan();
        assertTrue(alerts(AlertRule.POST_REPORT_BURST).isEmpty(), "等于阈值不该报");

        long p2 = post("u-th");
        reports("POST", p2, T + 1, "PENDING", Instant.now());    // > 阈值
        service.scan();
        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).size());
        assertEquals(String.valueOf(p2), alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p2)).get("target_id"));
        assertEquals((long) (T + 1), num(alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p2)).get("metric")));
    }

    // ==================== 阈值来自后台参数（参数管理第一批） ====================

    @Test
    void 后台把举报阈值改成30_4条举报不再报警_且不用重启() {
        long p = post("u-th30");
        reports("POST", p, 4, "PENDING", Instant.now());

        // 默认阈值 3：4 条 > 3，会报
        service.scan();
        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).size(), "默认阈值下 4 条就该报");

        // 后台改成 30（同一个进程、同一个 service 实例，不重启）
        cfg.set(ConfigKey.ALERT_REPORT_THRESHOLD, "30", "admin");
        service.scan();
        assertEquals(AlertRule.STATUS_RESOLVED,
                alerts(AlertRule.POST_REPORT_BURST).get(0).get("status"),
                "阈值提到 30 之后，4 条的告警要回落成 RESOLVED");
    }

    @Test
    void 后台把举报阈值改成2_仍是正好等于不报_超过才报() {
        cfg.set(ConfigKey.ALERT_REPORT_THRESHOLD, "2", "admin");
        long p1 = post("u-th2a");
        reports("POST", p1, 2, "PENDING", Instant.now());
        service.scan();
        assertTrue(alerts(AlertRule.POST_REPORT_BURST).isEmpty(), "改成 2 之后，正好 2 条仍不报（口径不变）");

        long p2 = post("u-th2b");
        reports("POST", p2, 3, "PENDING", Instant.now());
        service.scan();
        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).size(), "3 条 > 2，要报");
    }

    @Test
    void 后台把举报阈值改成2_3条举报报警_标题里的窗口时长仍来自常量() {
        cfg.set(ConfigKey.ALERT_REPORT_THRESHOLD, "2", "admin");
        long p = post("u-th2b");
        reports("POST", p, 3, "PENDING", Instant.now());
        service.scan();
        List<Map<String, Object>> rows = alerts(AlertRule.POST_REPORT_BURST);
        assertEquals(1, rows.size());
        String title = String.valueOf(rows.get(0).get("title"));
        assertTrue(title.contains(AlertRule.WINDOW_HOURS + " 小时"), "标题里的窗口时长要走常量：" + title);
    }

    @Test
    void 后台把积压阈值改成50_20条积压不再报警_提示里写当前阈值() {
        for (int i = 0; i < 20; i++) {
            jdbc.update("insert into sy_report(target_type, target_id, reporter_id, reason, status, created_at) "
                    + "values('POST', ?, ?, 'SPAM', 'PENDING', ?)", 7000 + i, "c" + i,
                    Timestamp.from(Instant.now().minusSeconds(3 * 3600)));
        }
        service.scan();
        assertEquals(1, alerts(AlertRule.REPORT_BACKLOG).size(), "默认阈值 10：20 条要报");
        assertTrue(String.valueOf(alerts(AlertRule.REPORT_BACKLOG).get(0).get("detail")).contains("小时"));

        cfg.set(ConfigKey.ALERT_BACKLOG_THRESHOLD, "50", "admin");
        service.scan();
        assertEquals(AlertRule.STATUS_RESOLVED,
                alerts(AlertRule.REPORT_BACKLOG).get(0).get("status"), "阈值提到 50 之后不该再报");
    }

    @Test
    void 窗口外的举报不算_已判定没问题的举报也不算() {
        long p = post("u-win");
        // 25 小时前的举报（窗口外）+ IGNORED / REJECTED 的举报（不算）
        reports("POST", p, T + 1, "PENDING", Instant.now().minusSeconds(25 * 3600));
        reports("POST", p, T + 1, "IGNORED", Instant.now());
        reports("POST", p, T + 1, "REJECTED", Instant.now());
        service.scan();
        assertTrue(alerts(AlertRule.POST_REPORT_BURST).isEmpty());
    }

    // ==================== 两条规则共用一次聚合：内容 + 人 ====================

    @Test
    void 帖子与评论都能聚合到作者() {
        long p = post("u-a");
        reports("POST", p, T + 1, "PENDING", Instant.now());
        long c = comment(p, "u-b");
        reports("COMMENT", c, T + 1, "PENDING", Instant.now());

        service.scan();

        assertNotNull(alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)), "帖子内容告警");
        assertNotNull(alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(c)), "评论内容告警");
        assertNotNull(alertOf(AlertRule.USER_REPORT_BURST, "u-a"), "帖子的作者被聚合到");
        assertNotNull(alertOf(AlertRule.USER_REPORT_BURST, "u-b"), "评论的作者被聚合到");
    }

    @Test
    void 按人累加_单条内容没超标但合计超标也要报() {
        // 同一个作者 3 篇帖子各被举报 2 次：单条都没超过 3，但这个人一共被举报 6 次
        String author = "u-sum";
        long p1 = post(author);
        long p2 = post(author);
        long p3 = post(author);
        reports("POST", p1, 2, "PENDING", Instant.now());
        reports("POST", p2, 2, "PENDING", Instant.now());
        reports("POST", p3, 2, "PENDING", Instant.now());

        service.scan();

        assertTrue(alerts(AlertRule.POST_REPORT_BURST).isEmpty(), "单条内容都没超标");
        Map<String, Object> userAlert = alertOf(AlertRule.USER_REPORT_BURST, author);
        assertNotNull(userAlert, "按人累加 6 次，应该报警");
        assertEquals(6L, num(userAlert.get("metric")));
    }

    // ==================== 去重 ====================

    @Test
    void 同一对象两次扫描只有一条_不同对象各一条() {
        long p1 = post("u-d1");
        long p2 = post("u-d2");
        reports("POST", p1, T + 1, "PENDING", Instant.now());
        reports("POST", p2, T + 1, "PENDING", Instant.now());

        AlertService.ScanResult r1 = service.scan();
        assertTrue(r1.raised() >= 2);

        AlertService.ScanResult r2 = service.scan();
        assertEquals(0, r2.raised(), "第二轮不该再新增");
        assertTrue(r2.touched() >= 2, "而是 touch 已有告警");

        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).stream()
                .filter(a -> String.valueOf(p1).equals(String.valueOf(a.get("target_id")))).count());
        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).stream()
                .filter(a -> String.valueOf(p2).equals(String.valueOf(a.get("target_id")))).count());
    }

    @Test
    void 已处理后当天不再重复_次日换个键还能报() {
        long p = post("u-ack");
        reports("POST", p, T + 1, "PENDING", Instant.now());
        service.scan();
        Map<String, Object> a = alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p));

        service.ack(num(a.get("id")), "已处理", "admin");
        assertEquals(AlertRule.STATUS_ACKED,
                alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)).get("status"), "点已处理 → ACKED");

        service.scan();
        assertEquals(1, alerts(AlertRule.POST_REPORT_BURST).size(), "当天不再新增");
        assertEquals(AlertRule.STATUS_ACKED, alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)).get("status"),
                "也不会被翻回 OPEN");

        // 次日：dedup_key 里带日期，换一天可以再报
        String tomorrowKey = AlertRule.contentKey("POST", String.valueOf(p), LocalDate.now().plusDays(1));
        long id = repo.insertIfAbsent(AlertRule.POST_REPORT_BURST, "POST", String.valueOf(p),
                AlertRule.LEVEL_WARN, "次日再报", null, T + 1, tomorrowKey, Timestamp.from(Instant.now()));
        assertTrue(id > 0, "换个日期的 dedup_key 能插进去");
    }

    // ==================== 状态机 ====================

    @Test
    void 指标回落自动RESOLVED_已处理的保持ACKED() {
        long p1 = post("u-res1");
        long p2 = post("u-res2");
        reports("POST", p1, T + 1, "PENDING", Instant.now());
        reports("POST", p2, T + 1, "PENDING", Instant.now());
        service.scan();
        Map<String, Object> a1 = alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p1));
        Map<String, Object> a2 = alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p2));
        service.ack(num(a2.get("id")), null, "admin");

        // 把 p1 的举报都改成 IGNORED（指标回落），p2 保持
        jdbc.update("update sy_report set status = 'IGNORED' where target_type = 'POST' and target_id = ?", p1);
        service.scan();

        assertEquals(AlertRule.STATUS_RESOLVED,
                alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p1)).get("status"), "回落 → RESOLVED");
        assertEquals(AlertRule.STATUS_ACKED,
                alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p2)).get("status"), "已处理的保持 ACKED");
    }

    @Test
    void 撤回把ACKED改回OPEN_非ACKED撤回报冲突() {
        long p = post("u-reopen");
        reports("POST", p, T + 1, "PENDING", Instant.now());
        service.scan();
        long id = num(alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)).get("id"));

        assertThrows(IllegalArgumentException.class, () -> service.reopen(id));   // 还是 OPEN
        service.ack(id, null, "admin");
        service.reopen(id);
        assertEquals(AlertRule.STATUS_OPEN, alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)).get("status"));
        assertNull(alertOf(AlertRule.POST_REPORT_BURST, String.valueOf(p)).get("acked_by"), "撤回要清掉处理人");
    }

    // ==================== 静音 ====================

    @Test
    void 静音期间不产生新告警_到期后恢复() {
        long p = post("u-mute");
        reports("POST", p, T + 1, "PENDING", Instant.now());

        service.mute(AlertRule.POST_REPORT_BURST, System.currentTimeMillis() + 3600_000, "admin");
        AlertService.ScanResult muted = service.scan();
        assertTrue(muted.skippedRules().contains(AlertRule.POST_REPORT_BURST));
        assertTrue(alerts(AlertRule.POST_REPORT_BURST).isEmpty(), "静音期间不该产生");

        service.unmute(AlertRule.POST_REPORT_BURST);
        service.scan();
        assertFalse(alerts(AlertRule.POST_REPORT_BURST).isEmpty(), "解除静音后要恢复");
    }

    @Test
    void 静音参数校验_未知规则与过短时长都被拒() {
        assertThrows(IllegalArgumentException.class,
                () -> service.mute("NO_SUCH_RULE", System.currentTimeMillis() + 3600_000, "admin"));
        assertThrows(IllegalArgumentException.class,
                () -> service.mute(AlertRule.REPORT_BACKLOG, System.currentTimeMillis() - 1000, "admin"));
        assertThrows(IllegalArgumentException.class,
                () -> service.mute(AlertRule.REPORT_BACKLOG,
                        System.currentTimeMillis() + 31L * 86400_000, "admin"), "超过 30 天要拒");
    }

    // ==================== 全局两条规则 ====================

    @Test
    void 举报积压超阈值才报_并带等待时长() {
        for (int i = 0; i < BACKLOG; i++) {
            jdbc.update("insert into sy_report(target_type, target_id, reporter_id, reason, status, created_at) "
                    + "values('POST', ?, ?, 'SPAM', 'PENDING', ?)", 9000 + i, "b" + i,
                    Timestamp.from(Instant.now().minusSeconds(3 * 3600)));
        }
        service.scan();
        assertTrue(alerts(AlertRule.REPORT_BACKLOG).isEmpty(), "等于阈值不报");

        jdbc.update("insert into sy_report(target_type, target_id, reporter_id, reason, status, created_at) "
                + "values('POST', 9999, 'bx', 'SPAM', 'PENDING', ?)",
                Timestamp.from(Instant.now().minusSeconds(5 * 3600)));
        service.scan();
        List<Map<String, Object>> backlog = alerts(AlertRule.REPORT_BACKLOG);
        assertEquals(1, backlog.size());
        assertTrue(String.valueOf(backlog.get(0).get("detail")).contains("小时"), "detail 要带等待时长");
    }

    @Test
    void 昨天的活跃统计缺失才报DAU_补上就不再报() {
        jdbc.update("delete from sy_daily_active");
        service.scan();
        assertEquals(1, alerts(AlertRule.DAU_MISSING).size());
        assertEquals(AlertRule.LEVEL_CRIT, alerts(AlertRule.DAU_MISSING).get(0).get("level"));

        jdbc.update("insert into sy_daily_active(day_key, dau, new_users) values (?, 5, 0)",
                java.sql.Date.valueOf(LocalDate.now(ZoneId.systemDefault()).minusDays(1)));
        service.scan();
        assertEquals(AlertRule.STATUS_RESOLVED, alerts(AlertRule.DAU_MISSING).get(0).get("status"));
    }

    // ==================== 未读数 / 推送 ====================

    @Test
    void 未读数等于OPEN数量_新增时会推一次SSE() {
        long p = post("u-sse");
        reports("POST", p, T + 1, "PENDING", Instant.now());
        long before = repo.countOpen();

        service.scan();

        assertTrue(repo.countOpen() > before);
        assertEquals(repo.countOpen(), service.unread());
        verify(sse, atLeastOnce()).broadcastUnread(repo.countOpen());
    }

    private static long num(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }
}
