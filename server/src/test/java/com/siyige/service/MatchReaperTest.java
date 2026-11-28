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
 * 僵尸回收的边界：单人模式 deadline_at 是 NULL，
 * 只能靠 last_active_at 判断活跃 —— 否则打了 15 分钟的正常对局会被判死。
 *
 * <p>真实事故：用户打到第 4 步（已过 15 分钟），点了几下"催一下"，
 * 对局直接显示已结束。根因就是回收器拿 started_at 当最后活跃时间。
 */
class MatchReaperTest {

    private JdbcTemplate jdbc;
    private MatchService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:reaper" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        Store store = new Store(jdbc);
        store.insertTopic("t1", "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        // 节奏参数改由 ConfigService 提供（构造器不再吃 4 个 @Value）；
        // 这里保持改造前的 1.0 倍速，避免时间断言随配置默认值（0.05 演示档）漂移。
        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        AiService ai = mock(AiService.class);
        when(ai.speakForSolo(anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), anyList()))
                .thenReturn(new AiService.Speech("我方认为应当保留期末考试。", false, ""));

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
                mock(SseHub.class), new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(), wallet, userLlm, tier,
                new RoomStore(jdbc));
    }

    private String createMatch() throws Exception {
        return service.create("u1", "t1", TurnEngine.joinSeats(Set.of("B2")), "STANDARD",
                0, "normal", "pro", "solo", "PRO", null);
    }

    @Test
    void 打了很久但仍在活跃的对局不会被回收() throws Exception {
        String id = createMatch();
        long twentyMinAgo = System.currentTimeMillis() - 20 * 60 * 1000L;
        // 开局是 20 分钟前，但刚刚还有动作（last_active_at = 现在）
        jdbc.update("update sy_match set started_at=?, last_active_at=? where id=?",
                new java.sql.Timestamp(twentyMinAgo), System.currentTimeMillis(), id);

        service.tick();

        String status = jdbc.queryForObject("select status from sy_match where id=?", String.class, id);
        assertEquals("RUNNING", status, "单人模式不限时，只要还在动就不能判僵尸");
    }

    @Test
    void 真的没人管了才会被回收() throws Exception {
        String id = createMatch();
        long twentyMinAgo = System.currentTimeMillis() - 20 * 60 * 1000L;
        jdbc.update("update sy_match set started_at=?, last_active_at=?, deadline_at=null where id=?",
                new java.sql.Timestamp(twentyMinAgo), twentyMinAgo, id);

        service.tick();

        String status = jdbc.queryForObject("select status from sy_match where id=?", String.class, id);
        assertEquals("ABANDONED", status);
    }

    @Test
    void 推进对局会刷新活跃时间() throws Exception {
        String id = createMatch();
        long old = System.currentTimeMillis() - 20 * 60 * 1000L;
        jdbc.update("update sy_match set last_active_at=? where id=?", old, id);

        // 玩家提交一句 → advance → updateStep 应刷新 last_active_at
        jdbc.update("update sy_match set step=3 where id=?", id);   // 第 4 步是 B2（我）
        service.submit(id, "我方认为可以取消期末考试，但要先给出替代评价的刚性口径。", "kb", "u1");

        Long active = jdbc.queryForObject("select last_active_at from sy_match where id=?", Long.class, id);
        assertNotNull(active);
        assertTrue(active > old, "推进后 last_active_at 必须被刷新，实际 " + active);
    }
}
