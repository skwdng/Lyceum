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
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 发言审核官 + 「催一下只对语句已备好生效」。
 *
 * <p>审核这块只锁两件事：六类硬伤都能报出来、合格的发言必须放行（宁可漏报不能误杀，
 * 误杀会让用户没法发言）。催一下这块锁 AI 三态语义：只有 {@code waiting} 才真的催得动。
 */
class SpeechAuditTest {

    private static final String TOPIC = "t1";
    private static final String ME = "u1";

    private final SpeechAudit audit = new SpeechAudit();
    private final UtteranceCheck utterance = new UtteranceCheck();

    private JdbcTemplate jdbc;
    private Store store;
    private MatchService service;
    private AiService ai;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:speech" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
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

    private List<String> codes(String content, String seg, List<String> prev) {
        return audit.check(content, seg, prev, utterance).issues().stream()
                .map(SpeechAudit.Issue::code).toList();
    }

    // ---------- ① 六类硬伤 ----------

    @Test
    @DisplayName("六类 issue 各自都能报出来，且都带 fix")
    void 六类issue各一条() {
        assertTrue(codes("太短了", "立论", List.of()).contains("TOO_SHORT"), "TOO_SHORT");

        assertTrue(codes("我方认为应当取消期末考试并且要给出替代口径，因为", "立论", List.of())
                .contains("INCOMPLETE"), "以「因为」结尾");

        assertTrue(codes("学生每天在学校里坐着听讲，回家还要写三个小时的作业。", "立论", List.of())
                .contains("NO_CLAIM"), "只有感想没有判断/论证");

        assertTrue(codes("11", "立论", List.of()).contains("VACUOUS"), "敷衍");

        String same = "我方认为应当取消期末考试，因为一次性闭卷只考记忆。";
        assertTrue(codes(same, "立论", List.of(same)).contains("REPEAT"), "复读上一轮");

        assertTrue(codes("你们说的这个方案到底谁来执行、谁来监督呢？", "立论", List.of())
                .contains("ONLY_QUESTION"), "整段只有问句");

        // 每条 issue 必须有可执行的 fix，不能只报「不合格」
        SpeechAudit.Verdict v = audit.check("11", "立论", List.of(), utterance);
        for (SpeechAudit.Issue i : v.issues()) {
            assertFalse(i.fix() == null || i.fix().isBlank(), i.code() + " 缺 fix");
            assertFalse(i.message() == null || i.message().isBlank(), i.code() + " 缺 message");
        }
    }

    @Test
    @DisplayName("合格发言 ok=true（不误杀）")
    void 合格发言放行() {
        SpeechAudit.Verdict v = audit.check(
                "我方认为应当取消期末考试，因为一次性闭卷只考记忆，而记忆不等于能力。",
                "立论", List.of(), utterance);
        assertTrue(v.ok(), "合格发言不该报错: " + v.issues());
        assertTrue(v.issues().isEmpty());
        assertFalse(v.tips().isEmpty(), "即使合格也给一句提示");
    }

    @Test
    @DisplayName("质询环节豁免 ONLY_QUESTION（质询本来就该提问）")
    void 质询豁免只有问句() {
        String q = "你们说的这个方案到底谁来执行、谁来监督呢？";
        assertTrue(codes(q, "立论", List.of()).contains("ONLY_QUESTION"));
        assertFalse(codes(q, "质询·问", List.of()).contains("ONLY_QUESTION"), "质询环节不该报 ONLY_QUESTION");
    }

    // ---------- ② submit 拦截 ----------

    @Test
    @DisplayName("单人局：不合格发言 409 SPEECH_REJECTED")
    void 单人提交被拦() throws Exception {
        String id = service.create(ME, TOPIC, "A1", "FULL", 0, "normal", "novice", "solo", "PRO", null);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.submit(id, "嗯", "kb", ME));
        assertTrue(ex.getMessage().startsWith("SPEECH_REJECTED"), "实际: " + ex.getMessage());
        assertEquals(0, store.turns(id).size(), "被拦下的发言不能落库");

        // 合格发言照常推进
        Map<String, Object> ok = service.submit(id,
                "我方认为应当取消期末考试，因为一次性闭卷只考记忆。", "kb", ME);
        assertEquals(Boolean.TRUE, ok.get("ok"));
        assertEquals(1, store.turns(id).size());
    }

    @Test
    @DisplayName("房间局不拦（避免打断多人节奏）")
    void 房间局不拦() throws Exception {
        String id = service.create(ME, TOPIC, "B2", "FULL", 0, "normal", "novice", "room", "PRO", null);
        jdbc.update("update sy_match set step=3 where id=?", id);   // 第 4 步 = B2，我的回合

        Map<String, Object> r = service.submit(id, "嗯", "kb", null);
        assertEquals(Boolean.TRUE, r.get("ok"), "房间局不该被发言审核拦下: " + r);
        assertEquals(1, store.turns(id).size());
    }

    // ---------- ③ aiState 三态 + 催一下 ----------

    @Test
    @DisplayName("aiState：我的回合是 mine，AI 回合没生成是 waiting，落库后是 ready")
    void aiState三态() throws Exception {
        String id = service.create(ME, TOPIC, "B2", "FULL", 0, "normal", "novice", "solo", "PRO", null);
        assertEquals("waiting", service.detail(id).get("aiState"), "第 1 步是 A1，还没开始生成");

        // waiting 时催一下真的生效
        assertEquals(Boolean.TRUE, service.skip(id).get("ok"), "waiting 状态催一下应当成功");

        // AI 已落库 → ready；这时催只是假装成功
        store.insertTurn(id, 1, "A1", "立论", "我方认为应当保留期末考试。", "OK", "ai");
        assertEquals("ready", service.detail(id).get("aiState"));
        Map<String, Object> skip = service.skip(id);
        assertEquals(Boolean.FALSE, skip.get("ok"), "ready 时不该假装催成功: " + skip);
        assertEquals("AI_NOT_READY", skip.get("reason"));

        // 轮到我 → mine
        jdbc.update("update sy_match set step=3 where id=?", id);
        assertEquals("mine", service.detail(id).get("aiState"));
    }

    @Test
    @DisplayName("aiState：生成线程正在跑时是 generating，催一下返回 AI_NOT_READY")
    void aiState生成中() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(ai.speakForSolo(anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), any(List.class))).thenAnswer(inv -> {
                    started.countDown();
                    release.await(5, TimeUnit.SECONDS);
                    return new AiService.Speech("我方认为应当保留期末考试。", false, "");
                });

        String id = service.create(ME, TOPIC, "B2", "FULL", 0, "normal", "novice", "solo", "PRO", null);
        jdbc.update("update sy_match set deadline_at=?, last_active_at=? where id=?",
                new java.sql.Timestamp(System.currentTimeMillis() - 5_000),
                System.currentTimeMillis(), id);
        service.tick();
        assertTrue(started.await(3, TimeUnit.SECONDS), "生成线程应该已经起来");

        assertEquals("generating", service.detail(id).get("aiState"));
        Map<String, Object> skip = service.skip(id);
        assertEquals(Boolean.FALSE, skip.get("ok"), "生成中催不该假装成功: " + skip);
        assertEquals("AI_NOT_READY", skip.get("reason"));

        release.countDown();
    }
}
