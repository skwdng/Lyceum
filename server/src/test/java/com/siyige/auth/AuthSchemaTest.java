package com.siyige.auth;

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
 * T1 的结构自检：按 application.yml 里 schema-locations 的<b>真实顺序</b>
 * （schema.sql → schema-community.sql → schema-auth.sql）在独立 H2 库上跑一遍，
 * 确认：
 * <ol>
 *   <li>三份脚本能连续执行（ALTER 排在 CREATE 之后）</li>
 *   <li>sy_user 多了 account / password_hash / status 三列</li>
 *   <li>ux_user_account 唯一索引存在</li>
 *   <li>唯一索引真的会挡住重复账号（并发注册靠它兜底 409）</li>
 *   <li>历史行（account 为 NULL）可以有多个，不被唯一索引挡</li>
 * </ol>
 */
class AuthSchemaTest {

    private Connection freshDb() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:authschema;DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        Connection c = ds.getConnection();
        // 严格按 application.yml 的顺序执行
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema.sql"));
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-community.sql"));
        ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-auth.sql"));
        return c;
    }

    @Test
    void sy_user新增三列() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            Set<String> cols = new HashSet<>();
            try (ResultSet rs = st.executeQuery(
                    "select column_name from information_schema.columns " +
                    "where table_schema = 'PUBLIC' and table_name = 'SY_USER'")) {
                while (rs.next()) cols.add(rs.getString(1).toUpperCase());
            }
            assertTrue(cols.contains("ACCOUNT"), "缺 account，实际列：" + cols);
            assertTrue(cols.contains("PASSWORD_HASH"), "缺 password_hash，实际列：" + cols);
            assertTrue(cols.contains("STATUS"), "缺 status，实际列：" + cols);
            // name 是 schema.sql 里原有的昵称列，必须还在
            assertTrue(cols.contains("NAME"), "name 列被弄丢了");
        }
    }

    @Test
    void account唯一索引存在() throws Exception {
        try (Connection c = freshDb()) {
            // 用 JDBC 标准元数据，不依赖 H2 的 information_schema 内部列名（各版本会变）
            boolean found = false;
            try (ResultSet rs = c.getMetaData().getIndexInfo(null, "PUBLIC", "SY_USER", false, false)) {
                while (rs.next()) {
                    String name = rs.getString("INDEX_NAME");
                    if ("UX_USER_ACCOUNT".equalsIgnoreCase(name)) {
                        found = true;
                        assertFalse(rs.getBoolean("NON_UNIQUE"), "ux_user_account 不是唯一索引");
                    }
                }
            }
            assertTrue(found, "没建出 ux_user_account");
        }
    }

    @Test
    void 重复账号被唯一索引挡住_历史NULL行不冲突() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            // 历史用户：account 为 NULL，可以有多个
            st.executeUpdate("insert into sy_user(id, name) values('u-demo', '演示用户')");
            st.executeUpdate("insert into sy_user(id, name) values('u-tester', '测试员')");

            st.executeUpdate("insert into sy_user(id, name, account, password_hash) " +
                    "values('zhang', 'zhang', 'zhang', 'hash')");

            // 同 account 第二行必须失败
            assertThrows(java.sql.SQLException.class, () ->
                    st.executeUpdate("insert into sy_user(id, name, account, password_hash) " +
                            "values('zhang2', 'zhang2', 'zhang', 'hash')"),
                    "重复 account 竟然插进去了");
        }
    }
}
