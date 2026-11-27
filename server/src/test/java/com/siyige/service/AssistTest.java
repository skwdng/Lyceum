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
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 辅助库（AI 席位提示）：`GET /api/matches/{id}/assist`。
 *
 * <p>三条底线：
 * <ul>
 *   <li>没模型 key 也要能用 → 走规则：3–5 条、带 basis、来源标「需核实」；</li>
 *   <li>有 key → 走模型（generatedBy=ai），模型给的条目原样透出；</li>
 *   <li>30 秒缓存 → 连点不会重复烧 token（第二次不再调模型）。</li>
 * </ul>
 */
class AssistTest {

    private static final String TOPIC = "t1";
    private static final String ME = "u1";

    private JdbcTemplate jdbc;
    private Store store;
    private RoomStore rooms;
    private AiService ai;
    private MatchService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:assist" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        rooms = new RoomStore(jdbc);
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");
        // 论据卡：辅助库的「需核实」来源从这里挑
        store.insertEvidence("e1", TOPIC, "C", "《普通高等学校学生管理规定》考核形式由学校确定", "教育部规章", 2017, false, "");
        store.insertEvidence("e2", TOPIC, "C", "过程性评价需要教师投入更多批改工时", "校本调研", 0, false, "");

        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        ai = mock(AiService.class);
        service = new MatchService(store, ai, new ScoreService(null), mock(HotRank.class),
                mock(SseHub.class), new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                rooms);
    }

    /** 单人局，我坐 B2：第 1 步 A1（AI），第 4 步 B2（我）。 */
    private String newMatch() throws Exception {
        return service.create(ME, TOPIC, "B2", "FULL", 0, "normal", "novice", "solo", "PRO", null);
    }

    /** 造两条发言：A2 说一句有破绽的话，我在第 4 步。 */
    private void seedTurns(String id) {
        store.insertTurn(id, 2, "B1", "立论", "我方认为应当保留期末考试，因为学分认定需要刚性凭证。", "OK", "ai");
        store.insertTurn(id, 3, "A2", "驳立论",
                "所有学生都会反对期末考试，专家也说过考试没有意义，所以取消考试等于提高教学质量。", "OK", "ai");
        jdbc.update("update sy_match set step=3 where id=?", id);
    }

    @Test
    @DisplayName("没有模型 key → 走规则：3–5 条、每条带 basis、来源标「需核实」")
    void 没有key走规则兜底() throws Exception {
        when(ai.assist(anyString(), anyString(), anyString(), any())).thenReturn(null);   // 无 key 的语义
        String id = newMatch();
        seedTurns(id);

        Map<String, Object> r = service.assist(id, ME);

        assertEquals("B2", r.get("seat"), "席位要按提交者反查");
        assertEquals("驳立论", r.get("stage"), "环节就是当前步的 seg");
        assertEquals("rules", r.get("generatedBy"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hints = (List<Map<String, Object>>) r.get("hints");
        assertNotNull(hints);
        assertTrue(hints.size() >= 3 && hints.size() <= 5, "提示要 3–5 条，实际 " + hints.size());
        for (Map<String, Object> h : hints) {
            assertTrue(Set.of("反驳", "口径", "论据", "追问").contains(String.valueOf(h.get("kind"))),
                    "kind 只能是四类，实际 " + h.get("kind"));
            assertFalse(String.valueOf(h.get("text")).isBlank(), "提示文本不能空");
            assertFalse(String.valueOf(h.get("basis")).isBlank(), "每条都要说清依据哪句原话");
        }
        // 对方那句话同时踩了「全称 / 权威 / 定义」，规则应当至少抓到一个
        assertTrue(hints.stream().anyMatch(h -> String.valueOf(h.get("basis")).contains("所有学生")),
                "basis 要引用对方原话片段: " + hints);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sources = (List<Map<String, Object>>) r.get("sources");
        assertFalse(sources.isEmpty(), "应当从论据卡里挑 1–2 条");
        assertTrue(sources.size() <= 2);
        for (Map<String, Object> s : sources) {
            assertFalse(String.valueOf(s.get("title")).isBlank());
            assertEquals("需核实", s.get("note"), "论据卡必须标「需核实」，不能让选手当成已核实事实");
        }
    }

    @Test
    @DisplayName("有模型 key → 走 ai 分支，模型条目原样透出")
    void 有key走模型() throws Exception {
        when(ai.assist(anyString(), anyString(), anyString(), any())).thenReturn(List.of(
                new AiService.Hint("反驳", "对方「所有人都反对」是明显说满，举一个反例即可。", "所有学生都会反对期末考试"),
                new AiService.Hint("追问", "请问「专家说过」是哪份研究、样本多大？", "专家也说过考试没有意义"),
                new AiService.Hint("论据", "引用 2017 年教育部规章说明考核形式由学校定。", "《普通高等学校学生管理规定》")));
        String id = newMatch();
        seedTurns(id);

        Map<String, Object> r = service.assist(id, ME);
        assertEquals("ai", r.get("generatedBy"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hints = (List<Map<String, Object>>) r.get("hints");
        assertEquals(3, hints.size());
        assertEquals("反驳", hints.get(0).get("kind"));
        assertTrue(String.valueOf(hints.get(0).get("basis")).contains("所有学生"));
    }

    @Test
    @DisplayName("30 秒缓存：同一场·同一步·同一个人第二次不再调模型")
    void 缓存命中不重复调模型() throws Exception {
        when(ai.assist(anyString(), anyString(), anyString(), any())).thenReturn(List.of(
                new AiService.Hint("口径", "先立判准。", "对方未给判准")));
        String id = newMatch();
        seedTurns(id);

        service.assist(id, ME);
        service.assist(id, ME);
        service.assist(id, ME);

        verify(ai, times(1)).assist(anyString(), anyString(), anyString(), any());

        // 换一步（＝缓存键变了）才会重新生成
        jdbc.update("update sy_match set step=4 where id=?", id);
        service.assist(id, ME);
        verify(ai, times(2)).assist(anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("模型抛异常也回落规则，不把 500 抛给前端")
    void 模型失败回落规则() throws Exception {
        when(ai.assist(anyString(), anyString(), anyString(), any()))
                .thenThrow(new RuntimeException("timeout"));
        String id = newMatch();
        seedTurns(id);

        Map<String, Object> r = service.assist(id, ME);
        assertEquals("rules", r.get("generatedBy"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hints = (List<Map<String, Object>>) r.get("hints");
        assertTrue(hints.size() >= 3);
    }

    @Test
    @DisplayName("自由辩不再有 BUZZ 阶段：推进到自由辩时 phase 仍是 STEP")
    void 自由辩不再进入抢拍阶段() throws Exception {
        String id = service.create(ME, TOPIC, "A1,A2", "FULL", 0, "normal", "novice", "room", "PRO", null);
        List<Format.Step> steps = Format.stepsOf("FULL",
                ((Number) store.match(id).get("query_rounds")).intValue(),
                ((Number) store.match(id).get("free_rounds")).intValue());
        int free = -1;
        for (int i = 0; i < steps.size(); i++) if ("自由辩".equals(steps.get(i).seg())) { free = i; break; }
        assertTrue(free > 0, "赛制里应有自由辩步");

        // 停在自由辩这一步，deadline 已过：以前会进 BUZZ 分支，现在应当按普通步判超时并推进
        jdbc.update("update sy_match set step=?, deadline_at=?, last_active_at=?, phase='STEP' where id=?",
                free, new java.sql.Timestamp(System.currentTimeMillis() - 5_000),
                System.currentTimeMillis(), id);
        service.tick();

        Map<String, Object> m = store.match(id);
        assertEquals("STEP", String.valueOf(m.get("phase")), "自由辩不该再进入 BUZZ");
        assertEquals(free + 1, ((Number) m.get("step")).intValue(), "过期后必须能推进（不卡住）");
        assertEquals(null, m.get("buzz_seat"), "抢拍席位字段应当一直是空");

        // 抢拍接口还在，但没有 BUZZ 阶段了 → 直接拒绝
        Map<String, Object> buzz = service.buzz(id, ME);
        assertEquals(Boolean.FALSE, buzz.get("ok"));
        assertTrue(String.valueOf(buzz.get("reason")).contains("抢拍"), "实际: " + buzz);
    }
}
