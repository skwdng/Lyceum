package com.siyige.admin;

import com.siyige.community.CommunityRepo;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * B4：处理记录 + 一键恢复（真实 H2，跑全部五份 schema）。
 *
 * <p>守的几条线：
 * <ul>
 *   <li>处理举报必须留一条 {@code REPORT_RESOLVE} 审计，detail 是人读文案</li>
 *   <li>恢复只把内容 status 2→1，**不解除禁言**（用户决策 3）</li>
 *   <li>恢复后：原行 undo_at 置位、另插 RESTORE 行、举报 ACCEPTED→REOPENED（终态不进队列）</li>
 *   <li>幂等：再点恢复 409 ALREADY_RESTORED</li>
 *   <li>IGNORE / 纯 BAN 没有可恢复内容 → 409 NOT_RESTORABLE，且不显示恢复按钮（canRestore=false）</li>
 *   <li>目标已不可恢复（作者自己删了/已可见）→ 409 让管理员看到失败（用户决策 4）</li>
 * </ul>
 */
class AuditRestoreTest {

    /** 通知用 mock：本测试只验审计与恢复，通知文案由 community/AdminNotifyTest 覆盖。 */
    private final com.siyige.community.NotificationService notify =
            org.mockito.Mockito.mock(com.siyige.community.NotificationService.class);

    private JdbcTemplate jdbc;
    private AdminReportRepo reportRepo;
    private AuditLogRepo auditRepo;
    private AuditLog audit;
    private AuditLogService auditService;
    private RestoreService restoreService;
    private AdminReportService reportService;
    private BanRepo banRepo;
    private BanService banService;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:audit" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                    "schema-admin.sql", "schema-security.sql", "schema-ai.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);

        reportRepo = new AdminReportRepo(jdbc);
        auditRepo = new AuditLogRepo(jdbc);
        audit = new AuditLog(auditRepo);
        auditService = new AuditLogService(auditRepo);
        CommunityRepo community = new CommunityRepo(jdbc);
        banRepo = new BanRepo(jdbc);
        banService = new BanService(banRepo, notify);
        restoreService = new RestoreService(auditRepo, audit, reportRepo, community);
        reportService = new AdminReportService(reportRepo, community, banService, audit, notify);

        user("u1", "reporter1");
        user("u2", "authorA");
        // 注意：admin id=1 由 schema-admin.sql 的种子行创建（admin/admin123），这里只补第二个
        admin(2, "admin2");

        post(100, "u2", "被举报的帖子");
        comment(200, 100, "u2");
        report(1, "POST", 100, "u1", "ABUSE");
    }

    // ==================== 造数据 ====================

    private void user(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status) values(?, ?, ?, 'x', 1)",
                id, name, id);
    }

    private void admin(long id, String account) {
        jdbc.update("insert into sy_admin(id, account, password_hash, status) values(?, ?, 'x', 1)", id, account);
    }

    private void post(long id, String author, String title) {
        jdbc.update("insert into sy_post(id, author_id, type, title, body, excerpt) values(?, ?, 'CHAT', ?, '正文', '正文')",
                id, author, title);
    }

    private void comment(long id, long postId, String author) {
        jdbc.update("insert into sy_post_comment(id, post_id, user_id, body) values(?, ?, ?, '评论正文')",
                id, postId, author);
    }

    private void report(long id, String type, long targetId, String reporter, String reason) {
        jdbc.update("insert into sy_report(id, target_type, target_id, reporter_id, reason) values(?, ?, ?, ?, ?)",
                id, type, targetId, reporter, reason);
    }

    private int postStatus(long id) {
        Integer s = jdbc.queryForObject("select status from sy_post where id = ?", Integer.class, id);
        return s == null ? -1 : s;
    }

    private int commentStatus(long id) {
        Integer s = jdbc.queryForObject("select status from sy_post_comment where id = ?", Integer.class, id);
        return s == null ? -1 : s;
    }

    private String reportStatus(long id) {
        return jdbc.queryForObject("select status from sy_report where id = ?", String.class, id);
    }

    private List<Map<String, Object>> auditRows() {
        return jdbc.queryForList("select * from sy_audit_log order by id");
    }

    private Map<String, Object> lastAudit() {
        List<Map<String, Object>> rows = auditRows();
        return rows.get(rows.size() - 1);
    }

    private Map<String, Object> firstAudit() {
        return auditRows().get(0);
    }

    private long firstAuditId() {
        return ((Number) firstAudit().get("id")).longValue();
    }

    private void resolve(String action, Integer days, String note) {
        reportService.resolve(1, new AdminDtos.ResolveRequest(action, days, note), 1L, "admin", "127.0.0.1");
    }

    // ==================== 处理时写审计 ====================

    @Test
    void 处理举报会写一条处理记录() {
        resolve("DELETE", null, "广告帖");

        List<Map<String, Object>> rows = auditRows();
        assertEquals(1, rows.size(), "应只有一条");
        Map<String, Object> r = rows.get(0);
        assertEquals(AuditLogRepo.ACTION_RESOLVE, r.get("ACTION") == null ? r.get("action") : r.get("ACTION"));
        assertEquals("DELETE", value(r, "verdict"));
        assertEquals("POST", value(r, "target_type"));
        assertEquals(100L, ((Number) value(r, "target_id")).longValue());
        assertEquals("admin", value(r, "admin_name"));
        assertEquals(1L, ((Number) value(r, "admin_id")).longValue());
        assertEquals("127.0.0.1", value(r, "ip"));
        assertNull(value(r, "undo_at"), "刚处理完不该是已撤销");
        String detail = String.valueOf(value(r, "detail"));
        assertTrue(detail.contains("删除内容"), detail);
        assertTrue(detail.contains("广告帖"), "备注应进 detail：" + detail);
    }

    @Test
    void 处理记录里绝不能出现凭据() {
        resolve("BAN", 7, "人身攻击");

        for (Map<String, Object> row : auditRows()) {
            String all = String.valueOf(value(row, "detail")) + String.valueOf(value(row, "admin_name"));
            assertFalse(all.contains("$argon2"), "审计里出现了密码哈希：" + all);
            assertFalse(all.toLowerCase().contains("bearer"), "审计里出现了令牌：" + all);
            assertFalse(all.contains("eyJ"), "审计里出现了 JWT：" + all);
        }
    }

    @Test
    void 删除并禁言时禁言记录带上举报id() {
        resolve("DELETE_AND_BAN", 3, null);

        Long reportId = jdbc.queryForObject("select report_id from sy_community_ban where user_id = 'u2'", Long.class);
        assertEquals(1L, reportId, "禁言记录应标明是哪条举报触发的");
    }

    // ==================== 列表与 canRestore ====================

    @Test
    void 列表按时间倒序且带canRestore() {
        resolve("DELETE", null, null);
        report(2, "COMMENT", 200, "u1", "SPAM");
        reportService.resolve(2, new AdminDtos.ResolveRequest("IGNORE", null, null), 1L, "admin", "127.0.0.1");

        Map<String, Object> page = auditService.page(1, 20);

        assertEquals(2L, page.get("total"));
        List<Map<String, Object>> items = itemsOf(page);
        assertEquals("IGNORE", items.get(0).get("verdict"), "最新的在前");
        assertEquals("DELETE", items.get(1).get("verdict"));
        assertEquals(Boolean.FALSE, items.get(0).get("canRestore"), "IGNORE 没有可恢复内容");
        assertEquals(Boolean.TRUE, items.get(1).get("canRestore"), "DELETE 可以恢复");
        assertEquals(Boolean.FALSE, items.get(1).get("undone"));
    }

    @Test
    void 纯禁言与忽略都不能恢复() {
        report(2, "COMMENT", 200, "u1", "SPAM");
        resolve("BAN", 7, null);
        reportService.resolve(2, new AdminDtos.ResolveRequest("IGNORE", null, null), 1L, "admin", "127.0.0.1");

        for (Map<String, Object> it : itemsOf(auditService.page(1, 20))) {
            assertEquals(Boolean.FALSE, it.get("canRestore"), it.get("verdict") + " 不该出现恢复按钮");
        }
    }

    // ==================== 恢复 ====================

    @Test
    void 恢复删除的帖子_内容重新可见且留痕() {
        resolve("DELETE", null, null);
        assertEquals(2, postStatus(100), "先确认被删了");

        restoreService.restore(firstAuditId(), 2L, "admin2", "10.0.0.9");

        assertEquals(1, postStatus(100), "帖子应重新可见");
        assertEquals("REOPENED", reportStatus(1), "举报应变成 REOPENED");

        Map<String, Object> origin = firstAudit();
        assertNotNull(value(origin, "undo_at"), "原记录应标记已撤销");
        assertEquals(2L, ((Number) value(origin, "undo_by")).longValue());

        List<Map<String, Object>> rows = auditRows();
        assertEquals(2, rows.size(), "应另插一条 RESTORE");
        Map<String, Object> restoreRow = rows.get(1);
        assertEquals(AuditLogRepo.ACTION_RESTORE, value(restoreRow, "action"));
        assertEquals("admin2", value(restoreRow, "admin_name"));
        assertEquals("10.0.0.9", value(restoreRow, "ip"));
        assertTrue(String.valueOf(value(restoreRow, "detail")).contains("重新可见"),
                String.valueOf(value(restoreRow, "detail")));
    }

    @Test
    void 恢复评论同理() {
        report(2, "COMMENT", 200, "u1", "SPAM");
        reportService.resolve(2, new AdminDtos.ResolveRequest("DELETE", null, null), 1L, "admin", "127.0.0.1");
        assertEquals(2, commentStatus(200));

        restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1");

        assertEquals(1, commentStatus(200));
        assertEquals("REOPENED", reportStatus(2));
    }

    @Test
    void 恢复不解除禁言() {
        resolve("DELETE_AND_BAN", 7, "人身攻击");

        restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1");

        assertEquals(1, postStatus(100), "内容应恢复");
        Timestamp until = jdbc.queryForObject("select until from sy_community_ban where user_id='u2'",
                Timestamp.class);
        assertNotNull(until);
        assertTrue(until.toInstant().isAfter(Instant.now()), "禁言必须还在生效（恢复不碰禁言）");
        // 同一用户再手动禁言一次，恢复第一条件时不应误伤另一次
        banService.ban("u2", 3, "另一次", 1L);
        assertEquals(2, jdbc.queryForObject("select count(*) from sy_community_ban where user_id='u2'",
                Integer.class));
    }

    @Test
    void 重复恢复返回409_ALREADY_RESTORED() {
        resolve("DELETE", null, null);
        long id = firstAuditId();
        restoreService.restore(id, 2L, "admin2", "127.0.0.1");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(id, 2L, "admin2", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("ALREADY_RESTORED:"), e.getMessage());
        assertEquals(1, postStatus(100), "第二次不该再改状态");
        assertEquals(2, auditRows().size(), "第二次不该再插 RESTORE 行");
    }

    @Test
    void 忽略记录不能恢复_返回NOT_RESTORABLE() {
        resolve("IGNORE", null, null);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("NOT_RESTORABLE:"), e.getMessage());
    }

    @Test
    void 纯禁言记录不能恢复_且禁言仍在() {
        resolve("BAN", 7, null);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("NOT_RESTORABLE:"), e.getMessage());
        Timestamp until = jdbc.queryForObject("select until from sy_community_ban where user_id='u2'",
                Timestamp.class);
        assertTrue(until.toInstant().isAfter(Instant.now()));
    }

    @Test
    void 目标已不存在时返回409且不留半截状态() {
        resolve("DELETE", null, null);
        // 模拟"作者自己把帖子彻底删了"：数据行没了
        jdbc.update("delete from sy_post where id = 100");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("NOT_RESTORABLE:"), e.getMessage());
        Map<String, Object> origin = firstAudit();
        assertNull(value(origin, "undo_at"), "失败时不该标记已撤销");
        assertEquals(1, auditRows().size(), "失败时不该插 RESTORE 行");
        assertEquals("ACCEPTED", reportStatus(1), "失败时不该动举报状态");
    }

    @Test
    void 目标已可见时也返回409() {
        resolve("DELETE", null, null);
        // 别处把它恢复了
        jdbc.update("update sy_post set status = 1 where id = 100");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("NOT_RESTORABLE:"), e.getMessage());
    }

    @Test
    void 记录不存在返回AUDIT_NOT_FOUND() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> restoreService.restore(999L, 1L, "admin", "127.0.0.1"));

        assertTrue(e.getMessage().startsWith("AUDIT_NOT_FOUND:"), e.getMessage());
    }

    @Test
    void REOPENED的举报不再出现在默认队列里() {
        resolve("DELETE", null, null);
        restoreService.restore(firstAuditId(), 2L, "admin2", "127.0.0.1");

        Map<String, Object> pending = reportService.queue(null, 1, 20);
        assertEquals(0L, pending.get("total"), "REOPENED 不该回到待处理队列（用户决策 5）");

        // 但按状态显式查是能查到的（便于排查），且它不能再被"处理"
        Map<String, Object> reopened = reportService.queue("REOPENED", 1, 20);
        assertEquals(1L, reopened.get("total"));
    }

    @Test
    void 分页参数被夹紧() {
        resolve("DELETE", null, null);
        Map<String, Object> p = auditService.page(0, 1000);

        assertEquals(1, p.get("page"));
        assertEquals(100, p.get("size"), "size 上限 100");
    }

    // ==================== 工具 ====================

    private static Object value(Map<String, Object> row, String key) {
        if (row.containsKey(key)) return row.get(key);
        for (Map.Entry<String, Object> e : row.entrySet()) {
            if (e.getKey().equalsIgnoreCase(key)) return e.getValue();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> itemsOf(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }
}
