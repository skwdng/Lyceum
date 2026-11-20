package com.siyige.security;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * B1 的结构自检：按 application.yml 里 schema-locations 的<b>真实顺序</b>
 * （schema → community → auth → admin → security）在独立 H2 库上连跑一遍。
 *
 * <p>重点不是"表建出来了"，而是：
 * <ul>
 *   <li>第五份脚本能在前四份之后正常执行（ALTER 依赖前置表）</li>
 *   <li>三个新列都加上了，且**没破坏既有列**</li>
 *   <li>审计表的列与两个索引齐备</li>
 *   <li>本包**没有偷偷改既有表结构**（回归保护）</li>
 * </ul>
 */
class SecuritySchemaTest {

    private static final String[] SCRIPTS = {
            "schema.sql", "schema-community.sql", "schema-auth.sql",
            "schema-admin.sql", "schema-security.sql"
    };

    private Connection freshDb() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:secschema;DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        Connection c = ds.getConnection();
        for (String f : SCRIPTS) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
        }
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

    @Test
    void 五份脚本能按顺序连续执行() throws Exception {
        try (Connection c = freshDb()) {
            assertNotNull(c);
        }
    }

    @Test
    void 三处新增列都在() throws Exception {
        try (Connection c = freshDb()) {
            assertTrue(columnsOf(c, "SY_USER").contains("PWD_CHANGED_AT"),
                    "sy_user 缺 pwd_changed_at，实际：" + columnsOf(c, "SY_USER"));
            assertTrue(columnsOf(c, "SY_ADMIN").contains("PWD_CHANGED_AT"),
                    "sy_admin 缺 pwd_changed_at，实际：" + columnsOf(c, "SY_ADMIN"));
            assertTrue(columnsOf(c, "SY_COMMUNITY_BAN").contains("REPORT_ID"),
                    "sy_community_ban 缺 report_id，实际：" + columnsOf(c, "SY_COMMUNITY_BAN"));
        }
    }

    @Test
    void 既有列没被破坏() throws Exception {
        try (Connection c = freshDb()) {
            // auth 模块的老列还在
            Set<String> user = columnsOf(c, "SY_USER");
            assertTrue(user.contains("ACCOUNT") && user.contains("PASSWORD_HASH") && user.contains("STATUS"),
                    "sy_user 的认证列丢了：" + user);
            // 社区禁言的原列还在
            Set<String> ban = columnsOf(c, "SY_COMMUNITY_BAN");
            for (String col : new String[]{"USER_ID", "BANNED_BY", "REASON", "UNTIL", "CREATED_AT"}) {
                assertTrue(ban.contains(col), "sy_community_ban 缺老列 " + col + "，实际：" + ban);
            }
        }
    }

    @Test
    void 审计表列齐() throws Exception {
        try (Connection c = freshDb()) {
            Set<String> cols = columnsOf(c, "SY_AUDIT_LOG");
            for (String col : new String[]{
                    "ID", "REPORT_ID", "ADMIN_ID", "ADMIN_NAME", "ACTION", "VERDICT",
                    "TARGET_TYPE", "TARGET_ID", "DETAIL", "UNDO_AT", "UNDO_BY", "IP", "CREATED_AT"}) {
                assertTrue(cols.contains(col), "sy_audit_log 缺列 " + col + "，实际：" + cols);
            }
        }
    }

    @Test
    void 审计表两个索引都在() throws Exception {
        try (Connection c = freshDb()) {
            assertTrue(hasIndex(c, "SY_AUDIT_LOG", "IX_AUDIT_REPORT"), "缺 ix_audit_report");
            assertTrue(hasIndex(c, "SY_AUDIT_LOG", "IX_AUDIT_TIME"), "缺 ix_audit_time");
        }
    }

    @Test
    void 审计表可写入_默认值正确() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            st.executeUpdate("insert into sy_audit_log(report_id, admin_id, admin_name, action, verdict, " +
                    "target_type, target_id, detail, ip) " +
                    "values(1, 1, 'admin', 'REPORT_RESOLVE', 'DELETE', 'POST', 12, '删除内容', '127.0.0.1')");

            try (ResultSet rs = st.executeQuery(
                    "select action, verdict, undo_at, undo_by, created_at from sy_audit_log")) {
                assertTrue(rs.next());
                assertEquals("REPORT_RESOLVE", rs.getString("action"));
                assertEquals("DELETE", rs.getString("verdict"));
                assertNull(rs.getObject("undo_at"), "新记录 undo_at 应为 null（生效中）");
                assertNull(rs.getObject("undo_by"));
                assertNotNull(rs.getTimestamp("created_at"), "created_at 应有默认值");
            }
        }
    }

    @Test
    void 既有表没有被偷偷加列() throws Exception {
        try (Connection c = freshDb()) {
            // sy_report 只应有 admin 包里定下的那些列，本包不该往里加
            Set<String> report = columnsOf(c, "SY_REPORT");
            assertFalse(report.contains("REOPENED_AT"), "不该给 sy_report 加列（REOPENED 只是 status 取值）");
            assertFalse(report.contains("AUDIT_ID"), "审计关系走 sy_audit_log.report_id，不往 sy_report 加列");
        }
    }
}
