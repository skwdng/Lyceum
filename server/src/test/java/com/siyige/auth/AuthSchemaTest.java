package com.siyige.auth;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;

import static org.junit.jupiter.api.Assertions.*;

/**
 * T1 的结构自检：按 application.yml 里 schema-locations 的<b>真实顺序</b>
 * （schema.sql → schema-community.sql → schema-auth.sql）在独立 H2 库上跑一遍，
 * 确认：
 * <ol>
 *   <li>三份脚本能连续执行（ALTER 排在 CREATE 之后）</li>
 *   <li>sy_user 多了 account / password_hash / status / phone 四列</li>
 *   <li>ux_user_account / ux_user_phone 两个唯一索引都在</li>
 *   <li>唯一索引真的会挡住重复账号 / 重复手机号（并发注册靠它们兜底 409）</li>
 *   <li>历史行（account / phone 为 NULL）可以有多个，不被唯一索引挡</li>
 *   <li>两个线程并发注册同一个手机号：只成功一个，另一个拿到 PHONE_TAKEN</li>
 * </ol>
 */
class AuthSchemaTest {

    /**
     * 每个用例一个**独立**内存库（库名带纳秒），严格按 application.yml 的顺序跑三份脚本。
     *
     * <p>为什么要独立：以前共用一个 mem:authschema，用例之间会看到彼此插入的行
     * （DB_CLOSE_DELAY=-1 让库一直活着），加列/加索引的断言也会被上一个用例的状态影响。
     */
    private JdbcDataSource freshDs() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:authschema" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema.sql"));
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-community.sql"));
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-auth.sql"));
            // AuthRepo 的查询里有 is_bot 列（AI 账号），它由 schema-ai.sql 添加；
            // 少了这份，真跑 AuthService 的用例会报 bad SQL grammar（列不存在）
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-ai.sql"));
        }
        return ds;
    }

    private Connection freshDb() throws Exception {
        return freshDs().getConnection();
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
            assertTrue(cols.contains("PHONE"), "缺 phone（2026-11-28 起注册必填），实际列：" + cols);
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
    void phone唯一索引存在且是唯一索引() throws Exception {
        try (Connection c = freshDb()) {
            boolean found = false;
            try (ResultSet rs = c.getMetaData().getIndexInfo(null, "PUBLIC", "SY_USER", false, false)) {
                while (rs.next()) {
                    if ("UX_USER_PHONE".equalsIgnoreCase(rs.getString("INDEX_NAME"))) {
                        found = true;
                        assertFalse(rs.getBoolean("NON_UNIQUE"), "ux_user_phone 不是唯一索引");
                    }
                }
            }
            assertTrue(found, "没建出 ux_user_phone");
        }
    }

    @Test
    void 重复手机号被唯一索引挡住_老用户多个NULL不冲突() throws Exception {
        try (Connection c = freshDb();
             Statement st = c.createStatement()) {
            // 存量老账号：phone 为 NULL，可以有多行（唯一索引对 NULL 不生效）
            st.executeUpdate("insert into sy_user(id, name, account, phone) values('u-a', '甲', 'ua', null)");
            st.executeUpdate("insert into sy_user(id, name, account, phone) values('u-b', '乙', 'ub', null)");

            st.executeUpdate("insert into sy_user(id, name, account, phone) values('p1', 'p1', 'p1', '13800001111')");

            // 同一个手机号第二行必须失败（换个账号也不行）
            assertThrows(java.sql.SQLException.class, () ->
                    st.executeUpdate("insert into sy_user(id, name, account, phone) values('p2', 'p2', 'p2', '13800001111')"),
                    "重复 phone 竟然插进去了");
        }
    }

    /**
     * 并发兜底：两个线程同时注册**同一个手机号**（不同账号）。
     *
     * <p>预查（findByPhone）两边都会看到"没人占用"，所以这一条全靠唯一索引 ux_user_phone：
     * 一个成功、另一个落库时撞索引，且必须被翻译成 PHONE_TAKEN（不是 ACCOUNT_TAKEN）。
     */
    @Test
    void 两个线程并发注册同一手机号_只成功一个另一个PHONE_TAKEN() throws Exception {
        {
            JdbcDataSource ds = freshDs();          // 表已按顺序建好，JdbcTemplate 直接用这个库
            JdbcTemplate jdbc = new JdbcTemplate(ds);
            AuthRepo repo = new AuthRepo(jdbc);
            // 低参 Argon2：并发用例里要编码两次，别把用例拖成秒级
            AuthService service = new AuthService(repo,
                    new Argon2PasswordEncoder(8, 16, 1, 1024, 1));

            String phone = "13900002222";
            CountDownLatch start = new CountDownLatch(1);
            List<Object> results = Collections.synchronizedList(new ArrayList<>());
            List<Thread> threads = new ArrayList<>();
            for (String name : new String[]{"cc1", "cc2"}) {
                threads.add(new Thread(() -> {
                    try {
                        start.await();
                        results.add(service.register(new AuthDtos.RegisterRequest(name, "abc12345", phone)));
                    } catch (Throwable e) {
                        results.add(e);
                    }
                }));
            }
            threads.forEach(Thread::start);
            start.countDown();
            for (Thread t : threads) t.join(30_000);

            assertEquals(2, results.size(), "两个线程都应有结果：" + results);
            long ok = results.stream().filter(r -> r instanceof AuthDtos.AuthUser).count();
            assertEquals(1, ok, "同一手机号并发注册只能成功一个，实际成功 " + ok + " 个：" + results);

            List<String> codes = new ArrayList<>();
            for (Object r : results) {
                if (r instanceof AuthException e) codes.add(e.code());
            }
            assertEquals(List.of("PHONE_TAKEN"), codes,
                    "失败的那一个必须是 PHONE_TAKEN（不能误报成 ACCOUNT_TAKEN）：" + results);
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
