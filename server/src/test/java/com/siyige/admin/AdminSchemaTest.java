package com.siyige.admin;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A1 的结构自检：按 application.yml 里 schema-locations 的<b>真实顺序</b>
 * （schema.sql → schema-community.sql → schema-auth.sql → schema-admin.sql）在独立 H2 库上跑一遍。
 *
 * <p>为什么值得写这个测试：
 * <ul>
 *   <li>四份脚本要能<b>连续</b>执行（admin 依赖 schema.sql 的 sy_user，且排在最后）</li>
 *   <li>种子管理员的哈希是**手写常量**——贴错一个字符就永远登不进去，这里用真实
 *       {@link Argon2PasswordEncoder} 反验一次 {@code matches("admin123")}</li>
 *   <li>唯一索引 ux_report_once 必须真的能挡住重复举报（409 靠它兜底）</li>
 * </ul>
 */
class AdminSchemaTest {

    private Connection freshDb() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:adminschema;DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        Connection c = ds.getConnection();
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema.sql"));
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-community.sql"));
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-auth.sql"));
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-admin.sql"));
        return c;
    }

    private static Set<String> columnsOf(Connection c, String table) throws Exception {
        Set<String> cols = new HashSet<>();
        try (ResultSet rs = c.getMetaData().getColumns(null, "PUBLIC", table, null)) {
            while (rs.next()) cols.add(rs.getString("COLUMN_NAME").toUpperCase());
        }
        return cols;
    }

    private static boolean hasIndex(Connection c, String table, String index) throws Exception {
        try (ResultSet rs = c.getMetaData().getIndexInfo(null, "PUBLIC", table, false, false)) {
            while (rs.next()) {
                if (index.equalsIgnoreCase(rs.getString("INDEX_NAME"))) return true;
            }
        }
        return false;
    }

    // ==================== 三张表 ====================

    @Test
    void 三张新表的列齐了() throws Exception {
        try (Connection c = freshDb()) {
            // R1 起 sy_admin 多了 5 列（role / must_change_pwd / last_login_at / created_by /
            // role_changed_at），是老断言必须跟着改的地方 —— 这里故意写全量集合，
            // 以后谁再偷偷加列/删列都会在这里报警。
            assertEquals(Set.of("ID", "ACCOUNT", "PASSWORD_HASH", "STATUS", "CREATED_AT",
                            "ROLE", "MUST_CHANGE_PWD", "LAST_LOGIN_AT", "CREATED_BY", "ROLE_CHANGED_AT"),
                    columnsOf(c, "SY_ADMIN"), "sy_admin 列不对");

            Set<String> report = columnsOf(c, "SY_REPORT");
            for (String col : new String[]{"ID", "TARGET_TYPE", "TARGET_ID", "REPORTER_ID", "REASON",
                    "DETAIL", "STATUS", "HANDLED_BY", "HANDLED_AT", "ACTION", "CREATED_AT"}) {
                assertTrue(report.contains(col), "sy_report 缺列 " + col + "，实际：" + report);
            }

            Set<String> ban = columnsOf(c, "SY_COMMUNITY_BAN");
            for (String col : new String[]{"ID", "USER_ID", "BANNED_BY", "REASON", "UNTIL", "CREATED_AT"}) {
                assertTrue(ban.contains(col), "sy_community_ban 缺列 " + col + "，实际：" + ban);
            }
        }
    }

    @Test
    void 四个索引都在() throws Exception {
        try (Connection c = freshDb()) {
            assertTrue(hasIndex(c, "SY_ADMIN", "UX_ADMIN_ACCOUNT"), "缺 ux_admin_account");
            assertTrue(hasIndex(c, "SY_REPORT", "UX_REPORT_ONCE"), "缺 ux_report_once");
            assertTrue(hasIndex(c, "SY_REPORT", "IX_REPORT_STATUS"), "缺 ix_report_status");
            assertTrue(hasIndex(c, "SY_REPORT", "IX_REPORT_TARGET"), "缺 ix_report_target");
            assertTrue(hasIndex(c, "SY_COMMUNITY_BAN", "IX_BAN_USER"), "缺 ix_ban_user");
        }
    }

    @Test
    void 既有三份脚本没被改动_sy_user仍只有原来那些列() throws Exception {
        try (Connection c = freshDb()) {
            Set<String> user = columnsOf(c, "SY_USER");
            // schema-auth.sql 加的三列还在
            assertTrue(user.contains("ACCOUNT"), "account 丢了");
            assertTrue(user.contains("PASSWORD_HASH"), "password_hash 丢了");
            assertTrue(user.contains("STATUS"), "status 丢了");
            // 本包不得往 sy_user 上乱加列
            assertFalse(user.contains("BANNED_UNTIL"), "sy_user 不该有禁言列，禁言在 sy_community_ban");
        }
    }

    // ==================== 种子管理员 ====================

    @Test
    void 种子管理员admin能被admin123登录() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(
                     "select account, password_hash, status from sy_admin")) {

            assertTrue(rs.next(), "没有种子管理员");
            assertEquals("admin", rs.getString("account"));
            assertEquals(1, rs.getInt("status"), "种子管理员应为启用状态");

            String hash = rs.getString("password_hash");
            assertTrue(hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"),
                    "种子哈希参数不对（必须与 PasswordConfig 一致）实际：" + hash);

            // 用生产参数反验：贴错一个字符这条就红
            PasswordEncoder encoder = new Argon2PasswordEncoder(16, 32, 1, 19456, 2);
            assertTrue(encoder.matches("admin123", hash), "admin123 校验不通过，哈希贴错了");
            assertFalse(encoder.matches("admin124", hash), "错误密码竟然通过了");

            assertFalse(rs.next(), "种子管理员插了不止一条（merge key 没生效）");
        }
    }

    // ==================== 约束真的生效 ====================

    @Test
    void 同人同目标重复举报被唯一索引挡住() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            st.executeUpdate("insert into sy_report(target_type, target_id, reporter_id, reason) " +
                    "values('POST', 1, 'zhang', 'SPAM')");

            assertThrows(java.sql.SQLException.class, () ->
                            st.executeUpdate("insert into sy_report(target_type, target_id, reporter_id, reason) " +
                                    "values('POST', 1, 'zhang', 'ABUSE')"),
                    "同一人对同一帖举报两次竟然成功了");

            // 换个人、或换个目标，都不该被挡
            st.executeUpdate("insert into sy_report(target_type, target_id, reporter_id, reason) " +
                    "values('POST', 1, 'lisi', 'ABUSE')");
            st.executeUpdate("insert into sy_report(target_type, target_id, reporter_id, reason) " +
                    "values('COMMENT', 1, 'zhang', 'SPAM')");
        }
    }

    @Test
    void 举报默认状态是PENDING_禁言到期时间可写入() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            st.executeUpdate("insert into sy_report(target_type, target_id, reporter_id, reason) " +
                    "values('POST', 7, 'zhang', 'SPAM')");
            try (ResultSet rs = st.executeQuery(
                    "select status, handled_by, handled_at, action from sy_report")) {
                assertTrue(rs.next());
                assertEquals("PENDING", rs.getString("status"), "默认状态必须是 PENDING");
                assertNull(rs.getObject("handled_by"));
                assertNull(rs.getObject("handled_at"));
                assertNull(rs.getObject("action"));
            }

            st.executeUpdate("insert into sy_community_ban(user_id, banned_by, reason, until) " +
                    "values('zhang', 1, '人身攻击', timestamp '2026-11-10 12:00:00')");
            try (ResultSet rs = st.executeQuery("select until from sy_community_ban")) {
                assertTrue(rs.next());
                assertEquals(java.sql.Timestamp.valueOf("2026-11-10 12:00:00"), rs.getTimestamp("until"));
            }
        }
    }
}
