package com.siyige.admin;

import com.siyige.auth.AuthException;
import com.siyige.community.CommunityRepo;
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
 * A4：管理端聚合队列 / 详情 / 处理（**真 H2 + 真 SQL**）。
 *
 * <p>为什么不 mock：这里最容易写错的是那段「按目标聚合 + 排序 + 分页」的派生表 SQL，
 * mock 掉就等于什么都没测。四份 schema 全跑一遍，数据显式指定 id，断言可读。
 */
class AdminReportServiceTest {

    /** 通知用 mock：本测试只验举报处理流程，通知文案由 community/AdminNotifyTest 覆盖。 */
    private final com.siyige.community.NotificationService notify =
            org.mockito.Mockito.mock(com.siyige.community.NotificationService.class);

    private JdbcTemplate jdbc;
    private CommunityRepo community;
    private BanRepo banRepo;
    private BanService banService;
    private AdminReportRepo reportRepo;
    private AdminReportService service;
    private AuditLog audit;
    private AdminUserRepo userRepo;
    private AdminUserService userService;
    private AdminStatsService stats;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:admin" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql", "schema-admin.sql", "schema-security.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        community = new CommunityRepo(jdbc);
        banRepo = new BanRepo(jdbc);
        banService = new BanService(banRepo, notify);
        reportRepo = new AdminReportRepo(jdbc);
        audit = new AuditLog(new AuditLogRepo(jdbc));
        service = new AdminReportService(reportRepo, community, banService, audit, notify);
        userRepo = new AdminUserRepo(jdbc);
        userService = new AdminUserService(userRepo, banRepo, banService, notify, audit);
        stats = new AdminStatsService(reportRepo, userService);

        // 用户：u1/u4 = 举报人，u2 = 帖 100 与评论 200 的作者，u3 = 帖 101 的作者
        user("u1", "reporter1");
        user("u2", "authorA");
        user("u3", "authorB");
        user("u4", "reporter2");

        post(100, "u2", "被举报的帖子", "正文内容");
        post(101, "u3", "另一个帖子", "内容 B");
        comment(200, 100, "u2", "被举报的评论");
    }

    // ==================== 造数据 ====================

    private void user(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status) values(?, ?, ?, 'x', 1)",
                id, name, id);
    }

    private void post(long id, String author, String title, String body) {
        jdbc.update("insert into sy_post(id, author_id, type, title, body, excerpt) values(?, ?, 'CHAT', ?, ?, ?)",
                id, author, title, body, body);
    }

    private void comment(long id, long postId, String author, String body) {
        jdbc.update("insert into sy_post_comment(id, post_id, user_id, body) values(?, ?, ?, ?)",
                id, postId, author, body);
    }

    private void report(long id, String type, long targetId, String reporter, String reason) {
        jdbc.update("insert into sy_report(id, target_type, target_id, reporter_id, reason) values(?, ?, ?, ?, ?)",
                id, type, targetId, reporter, reason);
    }

    private List<Map<String, Object>> reportRows() {
        return jdbc.queryForList("select id, status, action, handled_by, handled_at from sy_report order by id");
    }

    // ==================== 队列聚合 ====================

    @Test
    void 同一目标的多条举报聚合成一行() {
        report(1, "POST", 100, "u1", "SPAM");
        report(2, "POST", 100, "u4", "ABUSE");
        report(3, "POST", 100, "u3", "SPAM");

        Map<String, Object> q = service.queue(null, 1, 20);

        assertEquals(1L, q.get("total"), "三条举报应该聚合成一行");
        List<Map<String, Object>> items = itemsOf(q);
        Map<String, Object> row = items.get(0);
        assertEquals("POST", row.get("targetType"));
        assertEquals(100L, row.get("targetId"));
        assertEquals(3L, row.get("reportCount"));
        assertEquals(3L, row.get("reporterCount"));
        assertEquals(true, row.get("multiReport"), "3 人举报要打「多人举报」标");
        assertEquals("被举报的帖子", row.get("targetSummary"));
        assertEquals("u2", row.get("targetAuthor"));
        assertEquals(true, row.get("targetExists"));
        @SuppressWarnings("unchecked")
        List<String> reasons = (List<String>) row.get("reasons");
        assertTrue(reasons.containsAll(List.of("SPAM", "ABUSE")), "原因要聚起来：" + reasons);
    }

    @Test
    void 举报人少的排后面_多人举报排最前() {
        report(1, "POST", 101, "u1", "SPAM");          // 1 人
        report(2, "POST", 100, "u1", "SPAM");          // 3 人
        report(3, "POST", 100, "u3", "ABUSE");
        report(4, "POST", 100, "u4", "SPAM");

        List<Map<String, Object>> items = itemsOf(service.queue(null, 1, 20));

        assertEquals(100L, items.get(0).get("targetId"), "3 人举报的目标要排最前");
        assertEquals(101L, items.get(1).get("targetId"));
        assertEquals(false, items.get(1).get("multiReport"));
    }

    @Test
    void 帖子与评论分别聚合_评论带postId() {
        report(1, "POST", 100, "u1", "SPAM");
        report(2, "COMMENT", 200, "u1", "ABUSE");

        List<Map<String, Object>> items = itemsOf(service.queue(null, 1, 20));
        assertEquals(2, items.size(), "帖子与评论是两个目标，两行");

        Map<String, Object> commentRow = items.stream()
                .filter(m -> "COMMENT".equals(m.get("targetType"))).findFirst().orElseThrow();
        assertEquals(200L, commentRow.get("targetId"));
        assertEquals(100L, commentRow.get("postId"));
        assertEquals("被举报的评论", commentRow.get("targetSummary"));
    }

    @Test
    void 目标被删了队列里标成不存在但仍在列表中() {
        report(1, "POST", 100, "u1", "SPAM");
        jdbc.update("update sy_post set status = 2 where id = 100");

        Map<String, Object> row = itemsOf(service.queue(null, 1, 20)).get(0);

        assertEquals(false, row.get("targetExists"), "已删内容要标出来，不能假装还在");
        assertEquals("被举报的帖子", row.get("targetSummary"), "标题仍可展示（软删行还在）");
    }

    @Test
    void 只查PENDING_处理完的不再出现() {
        report(1, "POST", 100, "u1", "SPAM");
        service.resolve(1, new AdminDtos.ResolveRequest("IGNORE", null, null), 1L, "admin", "127.0.0.1");

        assertEquals(0L, service.queue(null, 1, 20).get("total"), "默认只看 PENDING");
        assertEquals(1L, service.queue("REJECTED", 1, 20).get("total"));
    }

    @Test
    void 状态参数非法要报错() {
        AuthException e = assertThrows(AuthException.class, () -> service.queue("WHATEVER", 1, 20));
        assertEquals("INVALID_PARAM", e.code());
    }

    // ==================== 详情 ====================

    @Test
    void 详情带目标全文与同目标其他举报() {
        report(1, "POST", 100, "u1", "SPAM");
        report(2, "POST", 100, "u4", "ABUSE");

        Map<String, Object> d = service.detail(1);

        @SuppressWarnings("unchecked")
        Map<String, Object> target = (Map<String, Object>) d.get("target");
        assertEquals("POST", target.get("targetType"));
        assertEquals("被举报的帖子", target.get("title"));
        assertEquals("正文内容", target.get("body"), "处理前要看得到全文");
        assertEquals("authorA", target.get("authorName"));
        assertEquals(true, target.get("exists"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> reports = (List<Map<String, Object>>) d.get("reports");
        assertEquals(2, reports.size(), "同目标的其他举报也要列出来");
    }

    @Test
    void 详情_举报不存在返回REPORT_NOT_FOUND() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.detail(999));
        assertTrue(e.getMessage().startsWith("REPORT_NOT_FOUND"));
    }

    @Test
    void 详情_目标已删除也能给出作者与deleted标记() {
        report(1, "COMMENT", 200, "u1", "SPAM");
        jdbc.update("update sy_post_comment set status = 2 where id = 200");

        @SuppressWarnings("unchecked")
        Map<String, Object> target = (Map<String, Object>) service.detail(1).get("target");

        assertEquals(true, target.get("deleted"));
        assertEquals(false, target.get("exists"));
        assertEquals("u2", target.get("author"), "删了也要知道是谁发的，禁言要用");
        assertEquals(100L, target.get("postId"));
    }

    // ==================== 处理 ====================

    @Test
    void 忽略_该目标全部举报变REJECTED且内容不动() {
        report(1, "POST", 100, "u1", "SPAM");
        report(2, "POST", 100, "u4", "ABUSE");

        service.resolve(1, new AdminDtos.ResolveRequest("IGNORE", null, "不算违规"), 7L, "admin", "127.0.0.1");

        List<Map<String, Object>> rows = reportRows();
        assertEquals("REJECTED", rows.get(0).get("status"));
        assertEquals("REJECTED", rows.get(1).get("status"), "同目标的另一条也要一起结案");
        assertEquals("IGNORE", rows.get(0).get("action"));
        assertEquals(7L, ((Number) rows.get(0).get("handled_by")).longValue());
        assertNotNull(rows.get(0).get("handled_at"));

        assertEquals(1, jdbc.queryForObject("select status from sy_post where id = 100", Integer.class),
                "忽略不该删内容");
    }

    @Test
    void 删除内容_帖子软删且举报变ACCEPTED() {
        report(1, "POST", 100, "u1", "SPAM");

        service.resolve(1, new AdminDtos.ResolveRequest("DELETE", null, null), 7L, "admin", "127.0.0.1");

        assertEquals(2, jdbc.queryForObject("select status from sy_post where id = 100", Integer.class));
        Map<String, Object> row = reportRows().get(0);
        assertEquals("ACCEPTED", row.get("status"));
        assertEquals("DELETE", row.get("action"));
    }

    @Test
    void 禁言7天_作者被禁言且内容仍在() {
        report(1, "POST", 100, "u1", "ABUSE");

        service.resolve(1, new AdminDtos.ResolveRequest("BAN", 7, "人身攻击"), 7L, "admin", "127.0.0.1");

        assertNotNull(banRepo.latestActiveUntil("u2"), "作者应被禁言");
        assertEquals(1, jdbc.queryForObject("select status from sy_post where id = 100", Integer.class),
                "只禁言不该删内容");
        assertEquals("ACCEPTED", reportRows().get(0).get("status"));
        assertEquals("BAN", reportRows().get(0).get("action"));
    }

    @Test
    void 删除并禁言_两件事都做() {
        report(1, "COMMENT", 200, "u1", "ILLEGAL");

        service.resolve(1, new AdminDtos.ResolveRequest("DELETE_AND_BAN", 3, null), 7L, "admin", "127.0.0.1");

        assertEquals(2, jdbc.queryForObject("select status from sy_post_comment where id = 200", Integer.class));
        assertNotNull(banRepo.latestActiveUntil("u2"));
        assertEquals("DELETE_AND_BAN", reportRows().get(0).get("action"));
    }

    @Test
    void 目标已被删除时处理不报错_举报照样结案() {
        report(1, "POST", 100, "u1", "SPAM");
        jdbc.update("update sy_post set status = 2 where id = 100");   // 管理员之前已经删了

        assertDoesNotThrow(() -> service.resolve(1, new AdminDtos.ResolveRequest("DELETE", null, null), 7L, "admin", "127.0.0.1"));

        assertEquals("ACCEPTED", reportRows().get(0).get("status"), "目标没了也要把举报关掉");
    }

    @Test
    void 目标整个不存在时_禁言跳过但不报500() {
        report(1, "POST", 999, "u1", "SPAM");        // 目标本来就不存在

        assertDoesNotThrow(() -> service.resolve(1, new AdminDtos.ResolveRequest("DELETE_AND_BAN", 1, null), 7L, "admin", "127.0.0.1"));
        assertEquals("ACCEPTED", reportRows().get(0).get("status"));
    }

    @Test
    void 处理动作与天数校验() {
        report(1, "POST", 100, "u1", "SPAM");

        assertEquals("INVALID_PARAM", assertThrows(AuthException.class,
                () -> service.resolve(1, new AdminDtos.ResolveRequest("NUKE", null, null), 7L, "admin", "127.0.0.1")).code());

        assertEquals("INVALID_PARAM", assertThrows(AuthException.class,
                () -> service.resolve(1, new AdminDtos.ResolveRequest("BAN", 2, null), 7L, "admin", "127.0.0.1")).code(),
                "禁言天数只能是 1/3/7");

        assertEquals("INVALID_PARAM", assertThrows(AuthException.class,
                () -> service.resolve(1, new AdminDtos.ResolveRequest("BAN", null, null), 7L, "admin", "127.0.0.1")).code(),
                "禁言必须给天数");

        assertEquals("PENDING", reportRows().get(0).get("status"), "参数不合法时不该动数据");
    }

    @Test
    void 举报不存在时处理返回REPORT_NOT_FOUND() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.resolve(404, new AdminDtos.ResolveRequest("IGNORE", null, null), 7L, "admin", "127.0.0.1"));
        assertTrue(e.getMessage().startsWith("REPORT_NOT_FOUND"));
    }

    // ==================== 用户管理 ====================

    @Test
    void 用户列表带两种处罚状态与被举报数() {
        report(1, "POST", 100, "u1", "SPAM");        // 打的是 u2 的帖子
        banService.ban("u3", 3, "x", 1L);            // u3 被禁言
        userService.setStatus("u4", 0, "全站封禁");

        Map<String, Object> out = userService.users(null, 1, 20);
        assertEquals(4L, out.get("total"));

        Map<String, Object> u2 = findByAccount(out, "u2");
        assertEquals(1L, u2.get("pendingReports"), "被举报数要算上");
        assertEquals(false, u2.get("banned"));

        Map<String, Object> u3 = findByAccount(out, "u3");
        assertEquals(true, u3.get("banned"), "社区禁言中");
        assertNotNull(u3.get("banUntil"));

        Map<String, Object> u4 = findByAccount(out, "u4");
        assertEquals(true, u4.get("disabled"), "全站封禁");
        assertEquals(0L, u4.get("status"));
    }

    @Test
    void 用户搜索按账号或昵称模糊() {
        assertEquals(1L, userService.users("authorA", 1, 20).get("total"));
        assertEquals(1L, userService.users("u3", 1, 20).get("total"));
        assertEquals(0L, userService.users("nobody", 1, 20).get("total"));
    }

    @Test
    void 禁言与全站封禁互不干扰() {
        userService.ban("u2", 7, "禁言", 1L);
        assertEquals(1, jdbc.queryForObject("select status from sy_user where id = 'u2'", Integer.class),
                "禁言不该改全站状态");

        userService.setStatus("u2", 0, "封禁");
        assertNotNull(banRepo.latestActiveUntil("u2"), "封禁不该顺手解禁");
        assertEquals(0, jdbc.queryForObject("select status from sy_user where id = 'u2'", Integer.class));

        userService.setStatus("u2", 1, "解封");
        assertNotNull(banRepo.latestActiveUntil("u2"), "解封也不该顺手解禁");
    }

    @Test
    void 用户不存在或状态非法要报错() {
        assertTrue(assertThrows(IllegalArgumentException.class,
                () -> userService.ban("ghost", 1, null, 1L)).getMessage().startsWith("USER_NOT_FOUND"));

        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> userService.setStatus("u1", 5, null)).code());
        assertEquals("INVALID_PARAM",
                assertThrows(AuthException.class, () -> userService.setStatus("u1", null, null)).code());
    }

    // ==================== 统计 ====================

    @Test
    void 统计只有三个字段() {
        report(1, "POST", 100, "u1", "SPAM");
        report(2, "POST", 101, "u4", "ABUSE");
        service.resolve(2, new AdminDtos.ResolveRequest("IGNORE", null, null), 1L, "admin", "127.0.0.1");
        banService.ban("u3", 1, null, 1L);

        Map<String, Object> s = stats.stats();

        assertEquals(java.util.Set.of("pendingReports", "todayReports", "bannedUsers"), s.keySet(),
                "决策 D11：只保留三个字段，不要 removedToday");
        assertEquals(1L, s.get("pendingReports"));
        assertEquals(2L, s.get("todayReports"));
        assertEquals(1L, s.get("bannedUsers"));
    }

    // ==================== helper ====================

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> itemsOf(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("items");
    }

    private static Map<String, Object> findByAccount(Map<String, Object> page, String account) {
        return itemsOf(page).stream()
                .filter(m -> account.equals(m.get("account")))
                .findFirst().orElseThrow(() -> new AssertionError("没找到用户 " + account));
    }
}
