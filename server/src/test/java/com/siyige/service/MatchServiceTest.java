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
import com.siyige.domain.Format;
import com.siyige.engine.TurnEngine;
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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 对局状态机：开局 / 提交 / 催一下幂等 / 越权 / 僵尸回收。
 *
 * <p>为什么必须用真 H2 而不是 mock Store：这些 bug 全在「SQL + 状态字段」的组合上
 * （席位归属、deadline 推进、跳过标记），mock 掉就测不出来。
 * AI 用 mock（测试里不该真调模型）。
 */
class MatchServiceTest {

    private JdbcTemplate jdbc;
    private Store store;
    private MatchService service;
    private AiService ai;

    private static final String TOPIC = "t1";

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:match" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        // 节奏参数由 ConfigService 提供（构造器不再吃 4 个 @Value）；保持改造前的 1.0 倍速
        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        ai = mock(AiService.class);
        when(ai.speakForSolo(anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), anyList()))
                .thenReturn(new AiService.Speech("我方认为应当保留期末考试，因为学分认定需要刚性凭证。", false, ""));

        WalletService wallet = mock(WalletService.class);
        when(wallet.hold(anyString(), anyString())).thenReturn(100L);
        when(wallet.tokenSnapshot()).thenReturn(0L);
        when(wallet.estimateCents()).thenReturn(100L);

        UserLlmService userLlm = mock(UserLlmService.class);
        when(userLlm.profileOf(anyString())).thenReturn(null);

        AiTier tier = mock(AiTier.class);
        when(tier.normalize(any())).thenReturn("PRO");
        when(tier.chargeModelCost(anyString())).thenReturn(true);
        when(tier.chargeServiceFee(anyString())).thenReturn(true);

        service = new MatchService(store, ai, mock(ScoreService.class), mock(HotRank.class),
                mock(SseHub.class), new FlawService(), new ObjectMapper(), cfg,
                new UtteranceCheck(), wallet, userLlm, tier,
                new RoomStore(jdbc));
    }

    private String newMatch(Set<String> seats) throws Exception {
        return service.create("u1", TOPIC, TurnEngine.joinSeats(seats), "STANDARD",
                0, "normal", "pro", "solo", "PRO", null);
    }

    @Test
    void 开局落库且赛制长度在合理区间() throws Exception {
        String id = newMatch(Set.of("B2"));
        Map<String, Object> m = service.detail(id).get("match") instanceof Map<?, ?> mm
                ? cast(mm) : Map.of();
        assertNotNull(m);
        assertEquals("RUNNING", String.valueOf(m.get("status")));
        assertEquals("B2", String.valueOf(m.get("my_seats")));

        List<Format.Step> steps = Format.stepsOf("STANDARD",
                Integer.parseInt(String.valueOf(m.get("query_rounds"))),
                Integer.parseInt(String.valueOf(m.get("free_rounds"))));
        assertTrue(steps.size() >= 15 && steps.size() <= 26, "步数异常: " + steps.size());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Map<?, ?> m) { return (Map<String, Object>) m; }

    @Test
    void 催一下同一轮只生效一次() throws Exception {
        String id = newMatch(Set.of("B2"));      // 第 1 步是 A1（AI），可以催
        Map<String, Object> first = service.skip(id);
        assertTrue(Boolean.TRUE.equals(first.get("ok")), "第一次应该成功: " + first);

        Map<String, Object> second = service.skip(id);
        assertFalse(Boolean.TRUE.equals(second.get("ok")), "第二次必须被幂等挡住: " + second);
        assertTrue(String.valueOf(second.get("reason")).contains("催过"));
    }

    @Test
    void 自己回合不能催() throws Exception {
        String id = newMatch(Set.of("A1"));      // 第 1 步就是我的
        Map<String, Object> r = service.skip(id);
        assertFalse(Boolean.TRUE.equals(r.get("ok")));
        assertTrue(String.valueOf(r.get("reason")).contains("轮到你说"));
    }

    @Test
    void 别人不能替我发言() throws Exception {
        String id = newMatch(Set.of("B2"));
        // 造一条 A1 的回合，然后让"不是我"的人提交：应被拒绝
        jdbc.update("update sy_match set step=0 where id=?", id);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.submit(id, "偷说一句", "kb", "someone-else"));
        assertTrue(ex.getMessage().contains("NOT_YOUR_TURN") || ex.getMessage().contains("现在"),
                "应拒绝，实际: " + ex.getMessage());
    }

    @Test
    void 僵尸对局会被回收() throws Exception {
        String id = newMatch(Set.of("B2"));
        // 把 deadline 推到 20 分钟前，模拟"没人管了"
        long old = System.currentTimeMillis() - 20 * 60 * 1000L;
        jdbc.update("update sy_match set deadline_at=?, started_at=? where id=?",
                new java.sql.Timestamp(old), new java.sql.Timestamp(old), id);

        service.tick();

        String status = jdbc.queryForObject("select status from sy_match where id=?", String.class, id);
        assertEquals("ABANDONED", status, "20 分钟无推进应被判 ABANDONED");
    }

    @Test
    void 正常对局不会被回收() throws Exception {
        String id = newMatch(Set.of("B2"));
        service.tick();
        String status = jdbc.queryForObject("select status from sy_match where id=?", String.class, id);
        assertEquals("RUNNING", status, "刚开的对局不能被回收");
    }
}
