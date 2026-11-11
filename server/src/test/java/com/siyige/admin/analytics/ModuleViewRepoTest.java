package com.siyige.admin.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 统计表读写的语义测试 —— 直接跑**真实的 schema-analytics.sql**（在 H2 内存库里建表）。
 *
 * <p>这样顺带验证了 DDL 本身能在这套库上建起来（包括 {@code day_key} 这个列名 ——
 * 初稿叫 {@code day} 时 H2 直接报 "expected identifier"，就是被这条测试抓住的）。
 */
class ModuleViewRepoTest {

    private JdbcTemplate jdbc;
    private ModuleViewRepo repo;

    @BeforeEach
    void setUp() throws Exception {
        DriverManagerDataSource ds = new DriverManagerDataSource(
                "jdbc:h2:mem:analytics_test;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("drop all objects");

        // sy_user 是 countNewUsers 的数据源（这里只建最小列集）
        jdbc.execute("create table sy_user (id varchar(32) primary key, name varchar(64), created_at timestamp default current_timestamp)");
        // P3 的索引 DDL 建在这些表上：给最小桩表，让 schema-analytics.sql 能整份跑通（顺带验索引语句）
        jdbc.execute("create table sy_match (id varchar(40) primary key, started_at timestamp)");
        jdbc.execute("create table sy_wallet_tx (id bigint auto_increment primary key, created_at timestamp)");
        jdbc.execute("create table sy_report (id bigint auto_increment primary key, created_at timestamp)");
        jdbc.execute("create table sy_turn (id bigint auto_increment primary key, created_at timestamp)");
        jdbc.execute("create table sy_record (id bigint auto_increment primary key, created_at timestamp)");
        runSchema("/schema-analytics.sql");
        repo = new ModuleViewRepo(jdbc);
    }

    private void runSchema(String classpath) throws Exception {
        String sql;
        try (InputStream in = getClass().getResourceAsStream(classpath)) {
            if (in == null) throw new IllegalStateException("找不到 " + classpath);
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        String cleaned = Arrays.stream(sql.split("\n"))
                .filter((line) -> !line.trim().startsWith("--"))
                .collect(Collectors.joining("\n"));
        for (String stmt : cleaned.split(";")) {
            if (!stmt.isBlank()) jdbc.execute(stmt);
        }
    }

    @Test
    void PV首次插入再累加() {
        LocalDate day = LocalDate.of(2026, 11, 11);
        repo.addPv(day, "community", 3);
        assertEquals(3L, pvOf(day, "community"));

        repo.addPv(day, "community", 4);
        assertEquals(7L, pvOf(day, "community"));

        // 另一个模块是独立的行
        repo.addPv(day, "chat", 1);
        assertEquals(1L, pvOf(day, "chat"));
        assertEquals(7L, pvOf(day, "community"));
    }

    @Test
    void UV只增不减且不累加() {
        LocalDate day = LocalDate.of(2026, 11, 11);
        repo.mergeUv(day, "community", 5);
        assertEquals(5L, uvOf(day, "community"));

        // 快照比库里小：保持原来的值（HLL 只能整体读，绝不能相加）
        repo.mergeUv(day, "community", 3);
        assertEquals(5L, uvOf(day, "community"));

        repo.mergeUv(day, "community", 9);
        assertEquals(9L, uvOf(day, "community"));
    }

    @Test
    void UV可以给已存在的PV行补写() {
        LocalDate day = LocalDate.of(2026, 11, 11);
        repo.addPv(day, "video", 10);
        repo.mergeUv(day, "video", 2);
        assertEquals(10L, pvOf(day, "video"));
        assertEquals(2L, uvOf(day, "video"));
    }

    @Test
    void 日活先插入后覆盖() {
        LocalDate day = LocalDate.of(2026, 11, 10);
        repo.upsertDailyActive(day, 12, 3);

        assertEquals(12, intOf("select dau from sy_daily_active where day_key = ?", day));
        assertEquals(3, intOf("select new_users from sy_daily_active where day_key = ?", day));

        repo.upsertDailyActive(day, 15, 4);
        assertEquals(15, intOf("select dau from sy_daily_active where day_key = ?", day));
        assertEquals(1, intOf("select count(*) from sy_daily_active"));
    }

    @Test
    void 新增用户按创建日统计() {
        LocalDate day = LocalDate.of(2026, 11, 10);
        jdbc.update("insert into sy_user(id, name, created_at) values (?, ?, ?)", "u1", "甲",
                java.sql.Timestamp.valueOf(day.atTime(9, 0)));
        jdbc.update("insert into sy_user(id, name, created_at) values (?, ?, ?)", "u2", "乙",
                java.sql.Timestamp.valueOf(day.atTime(23, 59)));
        jdbc.update("insert into sy_user(id, name, created_at) values (?, ?, ?)", "u3", "丙",
                java.sql.Timestamp.valueOf(day.plusDays(1).atStartOfDay()));

        assertEquals(2, repo.countNewUsers(day));
        assertEquals(1, repo.countNewUsers(day.plusDays(1)));
        assertEquals(0, repo.countNewUsers(day.minusDays(1)));
    }

    private long pvOf(LocalDate day, String module) {
        Long n = jdbc.queryForObject("select pv from sy_module_view where day_key = ? and module = ?", Long.class,
                java.sql.Date.valueOf(day), module);
        return n == null ? 0 : n;
    }

    private long uvOf(LocalDate day, String module) {
        Long n = jdbc.queryForObject("select uv from sy_module_view where day_key = ? and module = ?", Long.class,
                java.sql.Date.valueOf(day), module);
        return n == null ? 0 : n;
    }

    private int intOf(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }
}
