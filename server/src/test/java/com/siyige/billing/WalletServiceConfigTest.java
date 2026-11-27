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
        // 单价与预估 token 在第二批也搬进后台参数了，所以这里不再传值
        wallet = new WalletService(new WalletRepo(jdbc), null, cfg);
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

    // ==================== 第二批：单价与预估 token ====================

    @Test
    void 后台把单价改成10分每千token_预扣与结算都按新价() {
        // 默认 3 分/千：9000 token -> 27 分 + 30 服务费 = 57
        assertEquals(57L, wallet.estimateCents());

        cfg.set(ConfigKey.BILLING_CENTS_PER_1K, "10", "admin");
        assertEquals(120L, wallet.estimateCents(), "9000 token -> 90 分 + 30 服务费");

        wallet.recharge("u-price", 100_000L);
        assertEquals(120L, wallet.hold("u-price", "m-price"), "预扣按新单价冻结");
        Map<String, Object> settled = wallet.settle("u-price", "m-price", 1000L);
        assertEquals(10L, settled.get("modelCostCents"), "1000 token * 10 分/千 = 10 分");
        assertEquals(40L, settled.get("totalCents"), "10 + 服务费 30");
        assertEquals(10L, wallet.info("u-price").get("centsPer1kTokens"));
    }

    @Test
    void 后台把预扣估算token改成20000_预扣金额与流水备注都跟着变() {
        cfg.set(ConfigKey.BILLING_ESTIMATE_TOKENS, "20000", "admin");
        // 20000 / 1000 * 3 = 60 分 + 30 服务费 = 90
        assertEquals(90L, wallet.estimateCents());
        assertEquals(20000L, wallet.info("u-est").get("estimateTokens"));

        wallet.recharge("u-est", 100_000L);
        assertEquals(90L, wallet.hold("u-est", "m-est"));
        String note = jdbc.queryForObject(
                "select note from sy_wallet_tx where user_id = ? and kind = 'HOLD'", String.class, "u-est");
        assertTrue(note.contains("20000"), "备注里的预估 token 要用当前值：" + note);
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
