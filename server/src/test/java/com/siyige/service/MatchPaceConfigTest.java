package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.AiTier;
import com.siyige.api.SseHub;
import com.siyige.billing.UserLlmService;
import com.siyige.billing.WalletService;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.Timestamp;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 对局节奏的四个参数改成后台可改之后的行为（参数管理第二批 D3）。
 *
 * <p>三条语义是**红线**，这里逐条钉住：
 * <ol>
 *   <li><b>deadline 不追改</b>：时长的计算只发生在「开局 / 推进回合 / 抢拍 / 续时」，
 *       后台改参数不会去改写已开局对局的 {@code deadline_at}；</li>
 *   <li><b>stepSeconds 的比较对象也现读</b>：「用户指定时长恰好等于配置默认值 = 视为没指定」，
 *       默认 300 时行为与改造前逐位一致；</li>
 *   <li><b>续时不跟 time-scale 走</b>：{@code keepalive} 一律 +30 秒，压缩后等于没给。</li>
 * </ol>
 *
 * <p>真 H2 + mock 掉与计时无关的协作者（AI / 评分 / 热榜 / SSE / 钱包 / 用户 Key），
 * 这样测的只有"时间"这一件事。
 */
class MatchPaceConfigTest {

    private JdbcTemplate jdbc;
    private Store store;
    private ConfigService cfg;
    private MatchService matches;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:pace" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        store.insertTopic("t1", "人工智能生成内容是否应享有著作权", "人工智能", "中", "seed", "h-pace-1");

        cfg = new ConfigService(new ConfigRepo(jdbc));

        WalletService wallet = mock(WalletService.class);
        when(wallet.hold(anyString(), anyString())).thenReturn(57L);
        when(wallet.tokenSnapshot()).thenReturn(0L);
        when(wallet.estimateCents()).thenReturn(57L);

        AiTier aiTier = mock(AiTier.class);
        when(aiTier.normalize(any())).thenReturn("PRO");
        when(aiTier.chargeModelCost(anyString())).thenReturn(true);
        when(aiTier.chargeServiceFee(anyString())).thenReturn(true);

        UserLlmService userLlm = mock(UserLlmService.class);
        when(userLlm.profileOf(anyString())).thenReturn(null);

        matches = new MatchService(store, mock(AiService.class), mock(ScoreService.class),
                mock(HotRank.class), mock(SseHub.class), mock(FlawService.class),
                new ObjectMapper(), cfg, mock(UtteranceCheck.class), wallet, userLlm, aiTier,
                mock(RoomStore.class));
    }

    /** 开一场多人对局（kind=multi 才有 deadline；solo 是不限时）。 */
    private String create(int turnSeconds, String pace) throws Exception {
        return matches.create("u1", "t1", "A1,A2", "FULL", turnSeconds, pace, "pro", "multi");
    }

    private Map<String, Object> row(String id) {
        return store.match(id);
    }

    private long deadlineMs(String id) {
        Timestamp ts = (Timestamp) row(id).get("deadline_at");
        return ts.getTime() - System.currentTimeMillis();
    }

    // ==================== ① deadline 不追改 ====================

    @Test
    void 已开局的对局_改参数不会改写它的deadline() throws Exception {
        String id = create(0, "normal");
        long before = ((Timestamp) row(id).get("deadline_at")).getTime();

        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");     // 演示压缩 -> 真实节奏
        cfg.set(ConfigKey.PACE_TURN_SECONDS, "60", "admin");

        long after = ((Timestamp) row(id).get("deadline_at")).getTime();
        assertEquals(before, after, "改了参数也不能追改进行中的对局（不 mutate 历史）");
        assertEquals(0, ((Number) row(id).get("step")).intValue(), "步骤也不该被这次改参数推动");
    }

    // ==================== time-scale 现读 ====================

    @Test
    void 改time_scale_新开局的deadline按新倍速算() throws Exception {
        String demo = create(0, "normal");
        int turnSec = ((Number) row(demo).get("turn_sec")).intValue();
        assertTrue(turnSec > 0, "多人对局应该有每步时长");
        long demoMs = deadlineMs(demo);
        // 0.05 倍速：turnSec * 1000 * 0.05（再取 3000ms 下限）
        long expectDemo = Math.max(3000L, (long) (turnSec * 1000 * 0.05));
        assertTrue(Math.abs(demoMs - expectDemo) < 2000,
                "演示倍速下 deadline 应约 " + expectDemo + "ms，实际 " + demoMs);

        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");
        String real = create(0, "normal");
        long realMs = deadlineMs(real);
        long expectReal = Math.max(3000L, (long) (turnSec * 1000 * 1.0));
        assertTrue(Math.abs(realMs - expectReal) < 2000,
                "1.0 倍速下 deadline 应约 " + expectReal + "ms，实际 " + realMs);
        assertTrue(realMs > demoMs * 5, "1.0 与 0.05 的差距要拉开（实际 " + realMs + " vs " + demoMs + "）");
    }

    // ==================== ② stepSeconds 的比较对象现读 ====================

    @Test
    void 默认300时_用户传300视为没指定_落赛制表的口径() throws Exception {
        // pace=tight：立论 300 * 0.6 = 180 秒（赛制表口径）
        String id = create(300, "tight");
        assertEquals(180, ((Number) row(id).get("turn_sec")).intValue(),
                "传 300 恰好等于默认值 -> 视为没指定 -> 用赛制表的 180");
    }

    @Test
    void 把默认值改成60之后_用户传300就成了显式指定() throws Exception {
        cfg.set(ConfigKey.PACE_TURN_SECONDS, "60", "admin");
        String id = create(300, "tight");
        assertEquals(300, ((Number) row(id).get("turn_sec")).intValue(),
                "默认值变成 60 后，300 不再等于默认值，按显式指定生效");
    }

    @Test
    void 用户没指定时时长来自赛制表_与turn_seconds无关() throws Exception {
        String a = create(0, "tight");
        cfg.set(ConfigKey.PACE_TURN_SECONDS, "60", "admin");
        String b = create(0, "tight");
        assertEquals(180, ((Number) row(a).get("turn_sec")).intValue());
        assertEquals(180, ((Number) row(b).get("turn_sec")).intValue(),
                "没指定就用赛制表，改 turn-seconds 不该挪动这一步的时长");
    }

    // ==================== ③ 续时不跟 time-scale 走 ====================

    @Test
    void 续时一律30秒_不随time_scale压缩() throws Exception {
        String demo = create(0, "normal");
        assertTrue(deadlineMs(demo) < 60_000, "先确认当前是压缩过的演示节奏");
        Map<String, Object> r1 = matches.keepalive(demo);
        assertEquals(Boolean.TRUE, r1.get("extended"));
        long extended = deadlineMs(demo);
        assertTrue(extended > 20_000 && extended < 35_000, "续时应该直接给到约 30 秒，实际 " + extended);

        // 反方向也要验：放到 3.0 倍速，若续时跟着倍速走就该是 90 秒
        cfg.set(ConfigKey.PACE_TIME_SCALE, "3.0", "admin");
        String real = create(0, "normal");
        Map<String, Object> r2 = matches.keepalive(real);
        assertEquals(Boolean.TRUE, r2.get("extended"));
        long extended2 = deadlineMs(real);
        assertTrue(extended2 > 20_000 && extended2 < 35_000,
                "3.0 倍速下续时仍是 30 秒（不跟着倍速放大），实际 " + extended2);
    }

    // ==================== ai-think-ms / ai-delay-scale ====================

    @Test
    void AI思考停顿现读配置_并按倍速缩放() {
        // 默认 700ms、0.05 倍速 -> 35ms -> 落到 400ms 下限
        assertEquals(400L, matches.thinkMs());

        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");
        cfg.set(ConfigKey.PACE_AI_THINK_MS, "5000", "admin");
        assertEquals(5000L, matches.thinkMs(), "1.0 倍速下就是配置值本身");

        cfg.set(ConfigKey.PACE_AI_THINK_MS, "1800", "admin");
        assertEquals(1800L, matches.thinkMs());
    }

    @Test
    void 准备时长也跟着time_scale() {
        assertEquals(2000L, matches.prepareDuration().toMillis(), "10s * 0.05 = 500ms -> 2000ms 下限");
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");
        assertEquals(10_000L, matches.prepareDuration().toMillis());
    }
}
