package com.siyige.admin.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 报表 SQL 层：在真实 H2 上建最小表结构，验证「左闭右开区间」「只算真实充值」「维度分组」等语义。
 *
 * <p>这些点最容易写错又最难在页面上看出来（少算一天、把内部扣费当收入），所以用库级测试盯住。
 */
class AnalyticsRepoTest {

    private JdbcTemplate jdbc;
    private AnalyticsRepo repo;

    private static final LocalDate D1 = LocalDate.of(2026, 11, 10);
    private static final LocalDate D2 = LocalDate.of(2026, 11, 11);

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:analytics_repo;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("drop all objects");
        jdbc.execute("create table sy_match (id varchar(40) primary key, started_at timestamp, tier varchar(16))");
        jdbc.execute("create table sy_post (id bigint auto_increment primary key, status tinyint, type varchar(8), created_at timestamp)");
        jdbc.execute("create table sy_user (id varchar(32) primary key, status tinyint default 1, is_bot tinyint default 0, created_at timestamp)");
        jdbc.execute("create table sy_report (id bigint auto_increment primary key, reason varchar(32), status varchar(16), created_at timestamp)");
        jdbc.execute("create table sy_wallet_tx (id bigint auto_increment primary key, kind varchar(16), amount_cents bigint, created_at timestamp)");
        jdbc.execute("create table sy_turn (id bigint auto_increment primary key, input_type varchar(16), created_at timestamp)");
        jdbc.execute("create table sy_record (id bigint auto_increment primary key, turns int, dims_json varchar(400), created_at timestamp)");
        jdbc.execute("create table sy_seat (room_code varchar(16), seat_key varchar(4), side varchar(2), occupant varchar(8))");
        jdbc.execute("create table sy_module_view (day_key date, module varchar(24), pv bigint, uv bigint, primary key (day_key, module))");
        jdbc.execute("create table sy_daily_active (day_key date primary key, dau int, new_users int)");
        repo = new AnalyticsRepo(jdbc);
    }

    private static Timestamp at(LocalDate d, int hour, int minute) {
        return Timestamp.valueOf(d.atTime(hour, minute));
    }

    @Test
    void 区间是左闭右开_末日整天都算() {
        jdbc.update("insert into sy_match(id, started_at) values ('m1', ?)", at(D1, 0, 0));
        jdbc.update("insert into sy_match(id, started_at) values ('m2', ?)", at(D2, 0, 0));
        // 区间 [D1, D2+1) —— 末日 23:59 的那场必须算进来
        jdbc.update("insert into sy_match(id, started_at) values ('m3', ?)", at(D2, 23, 59));
        // 区间外：后天 00:00
        jdbc.update("insert into sy_match(id, started_at) values ('m4', ?)", at(D2.plusDays(1), 0, 0));

        assertEquals(3, repo.countMatches(D1, D2));
        Map<LocalDate, Long> byDay = repo.matchesByDay(D1, D2);
        assertEquals(1L, byDay.get(D1));
        assertEquals(2L, byDay.get(D2));
        assertEquals(2, byDay.size());     // 后天那场不在桶里
    }

    @Test
    void 收入只算真实充值_不算内部扣费() {
        jdbc.update("insert into sy_wallet_tx(kind, amount_cents, created_at) values ('RECHARGE', 500, ?)", at(D1, 10, 0));
        jdbc.update("insert into sy_wallet_tx(kind, amount_cents, created_at) values ('RECHARGE', 300, ?)", at(D1, 11, 0));
        jdbc.update("insert into sy_wallet_tx(kind, amount_cents, created_at) values ('HOLD', -100, ?)", at(D1, 12, 0));
        jdbc.update("insert into sy_wallet_tx(kind, amount_cents, created_at) values ('SETTLE', -30, ?)", at(D1, 13, 0));
        jdbc.update("insert into sy_wallet_tx(kind, amount_cents, created_at) values ('GRANT', 100, ?)", at(D1, 14, 0));

        assertEquals(800, repo.sumRevenueCents(D1, D2));
        assertEquals(800L, repo.revenueByDay(D1, D2).get(D1));
    }

    @Test
    void 发帖只算未删除_新增用户排除AI() {
        jdbc.update("insert into sy_post(status, type, created_at) values (1, 'CHAT', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_post(status, type, created_at) values (2, 'CHAT', ?)", at(D1, 10, 0));  // 软删
        jdbc.update("insert into sy_user(id, is_bot, created_at) values ('u1', 0, ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_user(id, is_bot, created_at) values ('ai_deepseek', 1, ?)", at(D1, 9, 0));

        assertEquals(1, repo.countPosts(D1, D2));
        assertEquals(1, repo.countUsers(D1, D2));
        assertEquals(1L, repo.usersByDay(D1, D2).get(D1));
    }

    @Test
    void 封禁与待处理举报是存量口径() {
        jdbc.update("insert into sy_user(id, status, is_bot, created_at) values ('u1', 0, 0, ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_user(id, status, is_bot, created_at) values ('u2', 1, 0, ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_user(id, status, is_bot, created_at) values ('ai_deepseek', 0, 1, ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_report(reason, status, created_at) values ('SPAM', 'PENDING', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_report(reason, status, created_at) values ('SPAM', 'ACCEPTED', ?)", at(D1, 9, 0));

        assertEquals(1, repo.bannedUsers());     // AI 账号被封不算"用户"
        assertEquals(1, repo.pendingReports());
    }

    @Test
    void 分布按维度分组并降序() {
        jdbc.update("insert into sy_match(id, started_at, tier) values ('m1', ?, 'BASIC')", at(D1, 9, 0));
        jdbc.update("insert into sy_match(id, started_at, tier) values ('m2', ?, 'PRO')", at(D1, 9, 0));
        jdbc.update("insert into sy_match(id, started_at, tier) values ('m3', ?, 'PRO')", at(D1, 9, 0));
        jdbc.update("insert into sy_report(reason, status, created_at) values ('SPAM', 'PENDING', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_post(status, type, created_at) values (1, 'HELP', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_seat(room_code, seat_key, side, occupant) values ('SY-1', 'A1', 'A', 'USER')");
        jdbc.update("insert into sy_seat(room_code, seat_key, side, occupant) values ('SY-1', 'B1', 'B', 'EMPTY')");

        List<AnalyticsRepo.KeyCount> tier = repo.breakdown("tier", D1, D2);
        assertEquals("PRO", tier.get(0).key());
        assertEquals(2, tier.get(0).n());
        assertEquals("BASIC", tier.get(1).key());

        assertEquals("SPAM", repo.breakdown("report_reason", D1, D2).get(0).key());
        assertEquals("HELP", repo.breakdown("post_type", D1, D2).get(0).key());
        // 席位只看有人坐的：A1 有 USER，B1 是 EMPTY 不算
        List<AnalyticsRepo.KeyCount> seat = repo.breakdown("seat", D1, D2);
        assertEquals(1, seat.size());
        assertEquals("A", seat.get(0).key());

        assertThrows(IllegalArgumentException.class, () -> repo.breakdown("hack", D1, D2));
    }

    @Test
    void 质量指标_平均轮数_AI占比_六维样本() {
        jdbc.update("insert into sy_record(turns, dims_json, created_at) values (4, '{\"立论\":70,\"表达\":80}', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_record(turns, dims_json, created_at) values (6, null, ?)", at(D1, 10, 0));
        jdbc.update("insert into sy_turn(input_type, created_at) values ('kb', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_turn(input_type, created_at) values ('ai', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_turn(input_type, created_at) values ('ai', ?)", at(D1, 9, 0));
        jdbc.update("insert into sy_turn(input_type, created_at) values ('timeout', ?)", at(D1, 9, 0));

        assertEquals(5.0, repo.avgTurns(D1, D2), 0.001);
        assertEquals(2, repo.recordSamples(D1, D2));
        assertEquals(1, repo.dimsJson(D1, D2).size());   // 只有第一条有 dims_json

        AnalyticsRepo.AiTurns turns = repo.aiTurns(D1, D2);
        assertEquals(4, turns.total());
        assertEquals(2, turns.ai());
    }

    @Test
    void 模块逐日行_按天按模块各一行() {
        jdbc.update("insert into sy_module_view(day_key, module, pv, uv) values (?, 'community', 10, 3)", Date.valueOf(D1));
        jdbc.update("insert into sy_module_view(day_key, module, pv, uv) values (?, 'community', 5, 7)", Date.valueOf(D2));
        jdbc.update("insert into sy_module_view(day_key, module, pv, uv) values (?, 'chat', 2, 2)", Date.valueOf(D2));

        List<AnalyticsRepo.ModuleDay> rows = repo.moduleByDay(D1, D2);
        assertEquals(3, rows.size());
        assertEquals(D1, rows.get(0).day());                 // 按日期排序：第一天只有 community
        assertEquals("community", rows.get(0).module());
        assertEquals(10, rows.get(0).pv());
        assertEquals(3, rows.get(0).uv());

        // 同一天多个模块时按模块名排序（不依赖数据库返回顺序）
        long communityD2 = rows.stream()
                .filter((r) -> r.day().equals(D2) && r.module().equals("community"))
                .findFirst().orElseThrow().pv();
        assertEquals(5, communityD2);

        assertTrue(repo.moduleByDay(D1.plusDays(30), D2.plusDays(30)).isEmpty());
    }

    @Test
    void 日活按天取() {
        jdbc.update("insert into sy_daily_active(day_key, dau, new_users) values (?, 12, 3)", Date.valueOf(D1));
        jdbc.update("insert into sy_daily_active(day_key, dau, new_users) values (?, 15, 4)", Date.valueOf(D2));
        Map<LocalDate, Long> dau = repo.dauByDay(D1, D2);
        assertEquals(12L, dau.get(D1));
        assertEquals(15L, dau.get(D2));
        assertTrue(repo.dauByDay(D1.plusDays(5), D2).isEmpty());
    }
}
