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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 「这一轮 AI 为什么降级」必须留痕。
 *
 * <p>用户看到的是"AI 怎么变笨了"，复盘却只说"得分低"——没有根据。所以把
 * {@code Speech.analysisStatus()} 落进 {@code sy_turn.ai_reason}，复盘/前端才能说清
 * 这一轮是「真的听了对方再回应（ok）」还是「分析失败走了模板（degraded）」「预算用尽（budget-exhausted）」。
 *
 * <p>玩家自己的发言一律为 NULL：没有 AI 分析这回事，别让复盘把玩家标成"降级"。
 */
class AiReasonTest {

    private static final String TOPIC = "t1";
    private static final String USER = "u1";

    /** 四类合法取值（与 AiService.Speech 的常量一一对应）。 */
    private static final Set<String> ENUM = Set.of(
            AiService.Speech.ANALYSIS_OK, AiService.Speech.ANALYSIS_DEGRADED,
            AiService.Speech.ANALYSIS_BUDGET, AiService.Speech.ANALYSIS_NONE);

    private JdbcTemplate jdbc;
    private Store store;
    private MatchService service;
    private AiService ai;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:aireason" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
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

        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        ai = mock(AiService.class);
        service = new MatchService(store, ai, new ScoreService(null), mock(HotRank.class),
                mock(SseHub.class), new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                new RoomStore(jdbc));
    }

    /** 开一场：第 1 步是 A1（AI），我坐 B2。difficulty=novice → 不埋雷，结果可重复。 */
    private String newMatch() throws Exception {
        return service.create(USER, TOPIC, "B2", "FULL", 0, "normal", "novice", "solo", "PRO", null);
    }

    private void stubAi(AiService.Speech speech) {
        when(ai.speakForSolo(anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), any(List.class))).thenReturn(speech);
    }

    private void runOneAiStep(String id) throws Exception {
        jdbc.update("update sy_match set deadline_at=?, last_active_at=? where id=?",
                new java.sql.Timestamp(System.currentTimeMillis() - 5_000),
                System.currentTimeMillis(), id);
        service.tick();
        long deadline = System.currentTimeMillis() + 3_000;
        while (System.currentTimeMillis() < deadline) {
            Integer n = jdbc.queryForObject("select step from sy_match where id=?", Integer.class, id);
            if (n != null && n >= 1) return;
            Thread.sleep(30);
        }
        throw new AssertionError("AI 那一步没有推进（生成线程没跑完？）");
    }

    private String aiReason(String id, int step1Based) {
        List<String> rows = jdbc.queryForList(
                "select ai_reason from sy_turn where match_id=? and step=?", String.class, id, step1Based);
        return rows.isEmpty() ? "<缺这条记录>" : rows.get(0);
    }

    @Test
    @DisplayName("降级（没 key / 分析失败）的那一轮，ai_reason 必须落库且属于四类枚举")
    void 降级时落库且取值合法() throws Exception {
        stubAi(new AiService.Speech("我方认为应当保留期末考试。", true, "",
                AiService.Speech.ANALYSIS_DEGRADED, 0));
        String id = newMatch();

        runOneAiStep(id);

        String reason = aiReason(id, 1);
        assertNotNull(reason, "AI 那一轮的 ai_reason 不能是 NULL");
        assertTrue(ENUM.contains(reason), "ai_reason 必须属于四类枚举，实际=" + reason);
        assertEquals(AiService.Speech.ANALYSIS_DEGRADED, reason, "mock 返回 degraded，落库就该是 degraded");
    }

    @Test
    @DisplayName("正常分析写 ok；玩家自己的发言是 NULL")
    void 正常为ok且玩家发言为null() throws Exception {
        stubAi(new AiService.Speech("我方认为应当保留期末考试。", false, "对方主张取消考试",
                AiService.Speech.ANALYSIS_OK, 0));
        String id = newMatch();

        runOneAiStep(id);
        assertEquals(AiService.Speech.ANALYSIS_OK, aiReason(id, 1), "正常路径要留下 ok，复盘才敢说「这一轮是真分析过的」");

        // 把状态机拨到 B2（第 4 步）再让玩家发言
        jdbc.update("update sy_match set step=3, phase='STEP', buzz_seat=null, deadline_at=null where id=?", id);
        service.submit(id, "我方判断：应当取消期末考试，因为闭卷只考记忆。", "kb", USER);

        String playerReason = aiReason(id, 4);
        assertNull(playerReason, "玩家发言不该带 ai_reason，实际=" + playerReason);
    }

    @Test
    @DisplayName("预算用尽也留痕（budget-exhausted）")
    void 预算用尽落库() throws Exception {
        stubAi(new AiService.Speech("（模板兜底）我方认为应当保留期末考试。", true, "",
                AiService.Speech.ANALYSIS_BUDGET, 0));
        String id = newMatch();

        runOneAiStep(id);
        assertEquals(AiService.Speech.ANALYSIS_BUDGET, aiReason(id, 1));
    }

    @Test
    @DisplayName("review 返回的 turns 里带 ai_reason（复盘面板据此渲染）")
    void review带出ai_reason() throws Exception {
        stubAi(new AiService.Speech("我方认为应当保留期末考试。", true, "",
                AiService.Speech.ANALYSIS_DEGRADED, 0));
        String id = newMatch();
        runOneAiStep(id);

        Map<String, Object> review = service.review(id);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> turns = (List<Map<String, Object>>) review.get("turns");
        assertNotNull(turns, "review 必须有 turns");
        assertTrue(!turns.isEmpty(), "应该至少有一条 AI 发言");

        Map<String, Object> aiTurn = turns.stream()
                .filter(t -> "ai".equalsIgnoreCase(String.valueOf(t.get("input_type"))))
                .findFirst().orElseThrow(() -> new AssertionError("没找到 AI 那条 turn: " + turns));
        assertTrue(aiTurn.containsKey("ai_reason"), "turns 的行里没有 ai_reason 字段（Store.turns 的 select 漏了？）");
        assertEquals(AiService.Speech.ANALYSIS_DEGRADED, aiTurn.get("ai_reason"));
    }
}
