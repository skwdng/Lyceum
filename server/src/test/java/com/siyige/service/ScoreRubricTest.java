package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import static org.mockito.Mockito.mock;

/**
 * 评分口径（rubric）：分数能不能被解释。
 *
 * <p>锁死四件事，任何一条被静默改坏，复盘页就会开始「编理由」：
 * <ul>
 *   <li>五维权重合计 100，且维度 key/顺序稳定（前端按 key 映射文案）；</li>
 *   <li>focus 是「权重×失分」最大的一维——不是单纯分最低的一维；</li>
 *   <li>basis 里的命中数来自规则真实命中，evidence 必须是选手原话的连续片段；</li>
 *   <li>全场超时/敷衍（total 强制 0）时 rubric 照样给，五维 0 分且 focus 仍指得出方向。</li>
 * </ul>
 *
 * <p>另外顺手锁住接口层：{@code review} 返回的 JSON 里 score 要带 rubric，
 * 而 seatScores 的结构（席位 → Score）不能被加字段改坏。
 */
class ScoreRubricTest {

    private final ScoreService scorer = new ScoreService(mock(EvidenceService.class));

    private static Map<String, Object> turn(int step, String seat, String seg, String content, String status) {
        return Map.of("step", step, "seat", seat, "seg", seg, "content", content,
                "status", status == null ? "OK" : status);
    }

    private static ScoreService.RubricDim dim(ScoreService.Rubric r, String key) {
        return r.dims().stream().filter(d -> key.equals(d.key())).findFirst()
                .orElseThrow(() -> new AssertionError("口径里没有维度: " + key));
    }

    /** 一段有判断、有标准、有因果、有假设、点对方、带引证的正经发言。 */
    private static final String SPEECH =
            "我方判断：应当取消期末考试，因为一次性闭卷只考记忆，而记忆不等于能力。"
            + "判断标准有两条：一是考核能否反映真实能力，二是学校是否愿意承担替代评价的成本。"
            + "请问对方：如果保留闭卷，你们怎么保证它考的不是记忆？"
            + "据《普通高等学校学生管理规定》，考核形式由学校自行确定。";

    @Test
    void 五维权重合计一百且口径版本固定() {
        ScoreService.Score s = scorer.score(List.of(turn(1, "B2", "立论", SPEECH, "OK")), Set.of("B2"));
        ScoreService.Rubric r = s.rubric();

        assertNotNull(r, "正常场次必须带上评分口径");
        assertEquals(ScoreService.RUBRIC_VERSION, r.version(), "口径版本要能被前端识别");
        assertEquals(5, r.dims().size(), "v3 口径是五维");
        assertEquals(100, r.dims().stream().mapToInt(ScoreService.RubricDim::weight).sum(),
                "五维权重合计必须是 100，否则 total 与口径对不上");
        assertEquals(List.of("matter", "method", "manner", "adapt", "evidence"),
                r.dims().stream().map(ScoreService.RubricDim::key).toList(),
                "维度 key 与顺序是前端契约，不能变");
        assertEquals(List.of("立论", "论证", "表达", "应变", "论据"),
                r.dims().stream().map(ScoreService.RubricDim::name).toList());

        // 口径只是解释层：不能偷偷改分，维度分必须与既有字段一致
        assertEquals(s.matter(), dim(r, "matter").score());
        assertEquals(s.method(), dim(r, "method").score());
        assertEquals(s.manner(), dim(r, "manner").score());
        assertEquals(s.adapt(), dim(r, "adapt").score());
        assertEquals(s.evidence(), dim(r, "evidence").score());

        for (ScoreService.RubricDim d : r.dims()) {
            assertFalse(d.basis().isBlank(), d.key() + " 缺 basis");
            assertTrue(d.score() >= 0 && d.score() <= 100, d.key() + " 分数越界: " + d.score());
        }
    }

    @Test
    void basis由真实命中生成而不是套话() {
        // 这句里 JUDGE 恰好命中 2 处：「我方认为」「应当」；没有任何标准/口径词
        String one = "我方认为应当取消期末考试。";
        ScoreService.Score s = scorer.score(List.of(turn(1, "B2", "立论", one, "OK")), Set.of("B2"));
        ScoreService.RubricDim matter = dim(s.rubric(), "matter");

        assertTrue(matter.basis().contains("判断句 2 处"),
                "命中数必须来自规则真实命中，实际 basis=" + matter.basis());
        assertTrue(matter.basis().contains("判断标准 0 处"), "没命中就该写 0，实际=" + matter.basis());
        // 只有一句判断、没有理由 → basis 要如实写「判断缺理由」
        assertTrue(matter.basis().contains("判断缺理由"), "实际=" + matter.basis());
    }

    @Test
    void focus取权重乘失分最大的一维() {
        // 两轮：先把立论/论证堆起来，表达与论据故意薄。
        // 关键点：论据分最低（10% 权重），但 focus 必须落在 30% 的论证上——权重大的先改。
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论",
                        "我方认为应当取消期末考试，因为一次性闭卷只能考记忆，而记忆并不等于能力，所以这个考核方式需要改。"
                        + "判断标准有两条：一是考核能否反映真实能力，二是学校是否愿意承担替代评价的组织成本。",
                        "OK"),
                turn(2, "B2", "驳立论",
                        "如果按对方说的口径把所有考核都改成过程性评价，那么教师工作量会翻倍，"
                        + "因此必须先给出可核查的成本口径，否则这一步不能推。",
                        "OK"));

        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        ScoreService.Rubric r = s.rubric();

        // 独立算一遍 argmax(权重×失分)，focus 必须与它一致
        ScoreService.RubricDim worst = null;
        double worstLoss = -1;
        for (ScoreService.RubricDim d : r.dims()) {
            double loss = d.weight() * (100.0 - d.score());
            if (loss > worstLoss) { worstLoss = loss; worst = d; }
        }
        assertNotNull(worst);
        assertEquals(worst.key(), r.focus().key(), "focus 必须等于权重×失分最大的一维");
        assertEquals(worst.weight(), r.focus().weight());
        assertEquals(worst.score(), r.focus().score());

        assertEquals("method", r.focus().key(),
                "这份稿子最该补的是论证（30% 权重），实际 focus=" + r.focus().key()
                        + "，各维=" + r.dims());
        assertTrue(dim(r, "evidence").score() < dim(r, "method").score()
                        || dim(r, "manner").score() < dim(r, "method").score(),
                "用例前提：有维度的分比论证低，但 focus 仍按加权重算");
        assertTrue(r.focus().action().length() >= 10, "action 要是一句能照着做的话: " + r.focus().action());
        assertFalse(r.focus().reason().isBlank());
        assertTrue(r.focus().reason().contains(String.valueOf(r.focus().weight())),
                "reason 要说清权重怎么算的: " + r.focus().reason());
    }

    @Test
    void evidence必须引用选手原话片段() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", SPEECH, "OK"),
                turn(2, "B2", "质询", "对方说「记忆不等于能力」，我同意这句，但请对方给出可核查的口径。", "OK"));

        String flat = turns.stream()
                .map(t -> String.valueOf(t.get("content")))
                .reduce("", (a, b) -> a + b)
                .replaceAll("\\s", "");

        ScoreService.Rubric r = scorer.score(turns, Set.of("B2")).rubric();
        for (ScoreService.RubricDim d : r.dims()) {
            assertFalse(d.evidence().isBlank(), d.key() + " 没给证据");
            assertTrue(d.evidence().length() >= 10, d.key() + " 证据太短: " + d.evidence());
            assertTrue(d.evidence().length() <= 60, d.key() + " 证据超过 60 字: " + d.evidence());
            assertTrue(flat.contains(d.evidence().replaceAll("\\s", "")),
                    d.key() + " 的证据不是原文片段（不能改写/编造）: " + d.evidence());
        }
        // 立论维度要挑到「判断 + 标准」那句，而不是随便截一句
        String matterEv = dim(r, "matter").evidence();
        assertTrue(matterEv.contains("判断") || matterEv.contains("标准") || matterEv.contains("应当"),
                "立论维度应挑到判断句，实际=" + matterEv);

        // 各维度要挑**不同**的话（曾经 bug：同命中按长度取胜，五维全取到同一段长文）
        String adaptEv = dim(r, "adapt").evidence();
        String citeEv = dim(r, "evidence").evidence();
        assertTrue(adaptEv.contains("对方") || adaptEv.contains("？") || adaptEv.contains("?"),
                "应变维度应挑到点对方/施压的那句，实际=" + adaptEv);
        assertTrue(citeEv.contains("据") || citeEv.contains("《"),
                "论据维度应挑到引证那句，实际=" + citeEv);
        assertNotEquals(matterEv, adaptEv, "立论与应变不该引用同一段");
        assertNotEquals(matterEv, citeEv, "立论与论据不该引用同一段");
    }

    @Test
    void 全场超时仍给口径且focus指得出方向() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", "（超时未发言）", "TIMEOUT"),
                turn(2, "B2", "质询", "11", "EMPTY"),
                turn(3, "B2", "结辩", "（超时未发言）", "TIMEOUT"));

        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        assertEquals(0, s.total(), "一句有效发言都没有，total 必须 0");
        assertEquals(2, s.timeout());

        ScoreService.Rubric r = s.rubric();
        assertNotNull(r, "0 分场次也要给口径，否则复盘页没法解释为什么是 0");
        assertEquals(5, r.dims().size());
        assertEquals(100, r.dims().stream().mapToInt(ScoreService.RubricDim::weight).sum());
        for (ScoreService.RubricDim d : r.dims()) {
            assertEquals(0, d.score(), d.key() + " 空场次应为 0 分");
            assertEquals("", d.evidence(), d.key() + " 没有原话就不该编证据");
            assertTrue(d.basis().contains("超时"), d.key() + " basis 应说明是超时/敷衍: " + d.basis());
        }
        assertNotNull(r.focus());
        assertEquals("method", r.focus().key(), "五维同分时 focus 应落在权重最高的论证");
        assertFalse(r.focus().action().isBlank(), "空场次也要给可执行动作");
        assertTrue(r.focus().reason().contains("超时"), "reason 应点明超时: " + r.focus().reason());
    }

    @Test
    void review接口JSON带rubric且seatScores不变() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:rubric" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        Store store = new Store(jdbc);
        store.insertTopic("t1", "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        String matchId = "m-rubric-1";
        store.createMatch(matchId, "u1", "t1", "高校是否应当取消期末考试", "STANDARD", "B2",
                0, "normal", "pro", "solo", null, 0, 0, "PRO", null);
        store.insertTurn(matchId, 1, "B2", "立论", SPEECH, "OK", "human");
        store.insertTurn(matchId, 2, "A1", "立论", "我方认为应当保留期末考试，因为学分认定需要刚性凭证。", "OK", "ai");

        MatchService ms = new MatchService(store, mock(AiService.class), scorer, mock(HotRank.class),
                mock(SseHub.class), new FlawService(), new ObjectMapper(),
                new ConfigService(new ConfigRepo(jdbc)),
                new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                new RoomStore(jdbc));

        Map<String, Object> review = ms.review(matchId);
        String json = new ObjectMapper().writeValueAsString(review);

        assertTrue(json.contains("\"rubric\""), "review 的 JSON 里必须带 rubric: " + json);
        assertTrue(json.contains("\"v3-2026-11\""), "版本号要一起出去");
        assertTrue(json.contains("\"focus\""), "focus 要一起出去");
        assertTrue(json.contains("\"basis\""), "basis 要一起出去");
        assertTrue(json.contains("\"evidence\""), "evidence 要一起出去");

        // 既有字段一个都不能少（前端与复盘文案都还读这些）
        for (String k : new String[]{"total", "matter", "method", "manner", "adapt", "collab",
                "collabNote", "cited", "fabricated", "flawHits", "flawTries", "perTurn",
                "flaws", "quote", "problem", "improve", "turns", "timeout", "seatScores"}) {
            assertTrue(json.contains("\"" + k + "\""), "review JSON 少了既有字段: " + k);
        }

        // seatScores 结构不变：席位 → Score（同样带 rubric）
        @SuppressWarnings("unchecked")
        Map<String, Object> seatScores = (Map<String, Object>) review.get("seatScores");
        assertNotNull(seatScores, "seatScores 不能因为加字段消失");
        assertTrue(seatScores.containsKey("B2"), "B2 有发言就该有分");
        Object seatScore = seatScores.get("B2");
        assertTrue(seatScore instanceof ScoreService.Score, "seatScores 的值仍是 Score record");
        assertNotNull(((ScoreService.Score) seatScore).rubric(), "按席位的评分也带口径");
    }
}
