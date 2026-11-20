package com.siyige.auth;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Connection;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * AI 账号禁止登录（决策 1）。
 *
 * <p>关键点：AI 账号的 {@code password_hash} 是**故意写成不可解析的串**。
 * 如果拦截放在密码校验之后，{@code encoder.matches()} 会抛解析异常 → 500，
 * 用户看到的就是"服务器错误"而不是 401。这个测试用真 H2 + 真 AuthRepo 钉住拦截顺序。
 */
class AiAccountLoginTest {

    private JdbcTemplate jdbc;
    private AuthService service;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:ailogin" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-ai.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        service = new AuthService(new AuthRepo(jdbc), encoder);

        // 普通用户（能正常登录）
        jdbc.update("insert into sy_user(id, account, name, password_hash, status, is_bot) " +
                "values('u-bob', 'bob', '王同学', ?, 1, 0)", encoder.encode("abc12345"));
    }

    private AuthException loginError(String account, String password) {
        return assertThrows(AuthException.class,
                () -> service.login(new AuthDtos.LoginRequest(account, password)));
    }

    @Test
    void AI账号的种子行存在且is_bot为1() {
        var bot = jdbc.queryForObject(
                "select is_bot from sy_user where id = ?", Integer.class, "ai_deepseek");
        assertEquals(1, bot);

        String name = jdbc.queryForObject("select name from sy_user where id = ?", String.class, "ai_deepseek");
        assertEquals("DeepSeek", name, "昵称必须能被 @ 到");
    }

    @Test
    void AI账号用任意密码都登录不了_且不是500() {
        // 不可解析的哈希：如果走到 encoder.matches 会抛异常 -> 这里必须已经是 401
        AuthException e = loginError("deepseek", "abc12345");
        assertEquals(401, e.status().value(), "必须是 401，不能是 500");
    }

    @Test
    void AI账号用空密码也登录不了() {
        AuthException e = loginError("deepseek", "");
        assertEquals(401, e.status().value());
    }

    @Test
    void 普通用户不受影响() {
        var user = service.login(new AuthDtos.LoginRequest("bob", "abc12345"));
        assertEquals("u-bob", user.id());
    }

    @Test
    void is_bot默认为0() {
        Integer bot = jdbc.queryForObject("select is_bot from sy_user where id = 'u-bob'", Integer.class);
        assertEquals(0, bot, "老数据（没有 is_bot 列历史值）必须是 0，否则普通用户会被拦");
    }
}
