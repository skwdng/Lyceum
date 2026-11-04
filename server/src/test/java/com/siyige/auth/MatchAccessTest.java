package com.siyige.auth;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * D1：对局归属校验（真实 H2，跑 schema.sql）。
 *
 * <p>守的核心事实：**房间局只有一条 match，owner 是点开局的房主**，
 * 所以"是不是这场的人"必须同时认「owner」与「同房间席位」两种身份 ——
 * 只看 owner 会把房间里其他真人全挡在外面。
 */
class MatchAccessTest {

    private JdbcTemplate jdbc;
    private MatchAccess access;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:matchaccess" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        access = new MatchAccess(jdbc);

        // 单人局：zhang01 自己开的
        match("m-solo", "zhang01");
        // 房间局：host01 点开局，li02 是同房间的另一个真人
        match("m-room", "host01");
        room("R1", "m-room", "host01");
        seat("R1", "A1", "host01", "张同学");
        seat("R1", "B2", "li02", "李同学");
        // 另一个房间，跟 m-room 无关
        room("R2", "m-other", "wang03");
        seat("R2", "A1", "wang03", "王同学");
    }

    private void match(String id, String userId) {
        jdbc.update("insert into sy_match(id, user_id, topic_id, mode, status) values(?, ?, 't1', 'FULL', 'RUNNING')",
                id, userId);
    }

    private void room(String code, String matchId, String host) {
        jdbc.update("insert into sy_room(code, topic_id, host_user, status, match_id) values(?, 't1', ?, 'RUNNING', ?)",
                code, host, matchId);
    }

    private void seat(String roomCode, String seatKey, String userId, String name) {
        jdbc.update("insert into sy_seat(room_code, seat_key, side, role, occupant, user_id, user_name, ready) " +
                "values(?, ?, 'A', '一辩', 'USER', ?, ?, true)", roomCode, seatKey, userId, name);
    }

    // ---------- 单人局 ----------

    @Test
    void 单人局_owner可访问() {
        assertTrue(access.canAccess("m-solo", "zhang01"));
        assertDoesNotThrow(() -> access.requireAccess("m-solo", "zhang01"));
    }

    @Test
    void 单人局_别人不可访问且是403FORBIDDEN() {
        assertFalse(access.canAccess("m-solo", "li02"));

        AuthException e = assertThrows(AuthException.class, () -> access.requireAccess("m-solo", "li02"));
        assertEquals("FORBIDDEN", e.code());
        assertEquals(403, e.status().value());
    }

    // ---------- 房间局 ----------

    @Test
    void 房间局_非房主的同房间玩家也能访问() {
        // 这条是关键：li02 不是 owner，但坐在 R1 的 B2 上
        assertFalse(jdbc.queryForObject("select user_id from sy_match where id='m-room'", String.class)
                .equals("li02"), "前提：li02 不是 owner");
        assertTrue(access.canAccess("m-room", "li02"));
    }

    @Test
    void 房间局_房主自己当然能访问() {
        assertTrue(access.canAccess("m-room", "host01"));
    }

    @Test
    void 房间局_别的房间的人不能访问() {
        assertFalse(access.canAccess("m-room", "wang03"),
                "wang03 在 R2 的席位上，不是 R1 的人");
    }

    @Test
    void 房间局_路人不能访问且是403() {
        AuthException e = assertThrows(AuthException.class, () -> access.requireAccess("m-room", "路人甲"));
        assertEquals("FORBIDDEN", e.code());
    }

    // ---------- 边界 ----------

    @Test
    void 对局不存在时不能访问() {
        assertFalse(access.canAccess("m-ghost", "zhang01"));
        assertThrows(AuthException.class, () -> access.requireAccess("m-ghost", "zhang01"));
    }

    @Test
    void 参数为空一律不放行() {
        assertFalse(access.canAccess(null, "zhang01"));
        assertFalse(access.canAccess("m-solo", null));
        assertFalse(access.canAccess("", "zhang01"));
        assertFalse(access.canAccess("m-solo", "  "));
        assertThrows(AuthException.class, () -> access.requireAccess(null, null));
    }

    @Test
    void matchId为空串时不会因为SQL宽松而误放行() {
        assertFalse(access.canAccess("", ""));
    }
}
