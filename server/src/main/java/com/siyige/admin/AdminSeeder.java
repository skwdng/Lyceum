package com.siyige.admin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 管理员账号初始化（只在库里有 0 个管理员时执行一次）。
 *
 * <p>为什么需要它：管理端是独立账号体系（`sy_admin`），没有注册接口，
 * 密码必须是 Argon2id 哈希——手工插库得自己算哈希，很麻烦。
 * 这里让应用启动时按配置自动建一个，之后改密码走管理端自己的改密接口。
 *
 * <p>安全约束：
 * <ul>
 *   <li>默认关闭，只有显式配了 {@code siyige.admin.seed.account} 才执行</li>
 *   <li>只在**一个管理员都没有**时创建，绝不覆盖已有账号</li>
 *   <li>日志只打账号，不打密码</li>
 * </ul>
 */
@Component
public class AdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final boolean enabled;
    private final String account;
    private final String password;

    public AdminSeeder(JdbcTemplate jdbc, PasswordEncoder encoder,
                       @Value("${siyige.admin.seed.enabled:false}") boolean enabled,
                       @Value("${siyige.admin.seed.account:}") String account,
                       @Value("${siyige.admin.seed.password:}") String password) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.enabled = enabled;
        this.account = account == null ? "" : account.trim();
        this.password = password == null ? "" : password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled || account.isEmpty() || password.isEmpty()) return;

        Integer count = jdbc.queryForObject("select count(*) from sy_admin", Integer.class);
        if (count != null && count > 0) {
            log.info("管理端已有 {} 个账号，跳过初始化", count);
            return;
        }
        if (password.length() < 8) {
            log.warn("管理员初始密码太短（{} 位），跳过初始化", password.length());
            return;
        }

        jdbc.update("insert into sy_admin(account, password_hash, status) values(?,?,1)",
                account, encoder.encode(password));
        log.info("已创建管理员账号 account={}（密码来自配置，请登录后立即修改）", account);
    }
}
