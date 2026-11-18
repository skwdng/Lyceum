package com.siyige.billing;

import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 计费的两个参数改成后台可改之后的行为（参数管理第一批）。
 *
 * <p>为什么这条回归必须存在：服务费与赠送金**直接影响钱**。改造前的写法是
 * {@code @Value} 冻在构造期，测试里根本改不动；现在改成每次现读，
 * 所以这里要证明"改完下一场就按新价算"，而不是"要重启才生效"。
 */
class WalletServiceConfigTest {

    private JdbcTemplate jdbc;
    private WalletService wallet;
    private ConfigService cfg;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:wallet" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        cfg = new ConfigService(new ConfigRepo(jdbc));
        // 每千 token 3 分、预估 9000 token 都是本批不搬的字段，按 yml 原值传入
        wallet = new WalletService(new WalletRepo(jdbc), null, 3L, 9000L, cfg);
    }

    @Test
    void 默认服务费30分_预估费用与原值一致() {
        // 9000 token / 1000 * 3 = 27 分，加服务费 30 = 57 分（改造前就是这个数）
        assertEquals(57L, wallet.estimateCents());
        assertEquals(30L, wallet.info("u-new").get("serviceFeeCents"));
    }

    @Test
    void 后台把服务费改成50_预估与结算立刻按新价算() {
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "50", "admin");

        assertEquals(77L, wallet.estimateCents(), "27 + 50");
        assertEquals(50L, wallet.info("u-new").get("serviceFeeCents"));

        // 真正扣一笔：开局预扣 -> 结算，看结算出来的服务费
        wallet.recharge("u-pay", 10_000L);
        long held = wallet.hold("u-pay", "m-1");
        assertEquals(77L, held, "预扣按新的服务费算");
        Map<String, Object> settled = wallet.settle("u-pay", "m-1", 1000L);
        assertEquals(50L, settled.get("serviceFeeCents"), "结算也按 50");
        assertEquals(3L + 50L, settled.get("totalCents"), "1000 token = 3 分 + 服务费 50");
    }

    @Test
    void 后台改回30_行为立刻回到原值() {
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "50", "admin");
        cfg.set(ConfigKey.BILLING_SERVICE_FEE, "30", "admin");
        assertEquals(57L, wallet.estimateCents());
    }

    @Test
    void 后台把新用户赠送改成200_下一个新用户拿200() {
        assertEquals(100L, wallet.ensureWallet("u-a"), "默认还是 1 元");
        cfg.set(ConfigKey.BILLING_WELCOME_GRANT, "200", "admin");
        assertEquals(200L, wallet.ensureWallet("u-b"), "改完立刻生效，不用重启");
        assertEquals(100L, wallet.ensureWallet("u-a"), "老用户不会被补发，余额不动");
    }

    @Test
    void 赠送只发一次_参数改了也不会重复送() {
        wallet.ensureWallet("u-c");
        cfg.set(ConfigKey.BILLING_WELCOME_GRANT, "500", "admin");
        assertEquals(100L, wallet.ensureWallet("u-c"), "已经有流水就不再赠送");
    }
}
