package com.siyige.eval;

import com.siyige.repo.Store;
import com.siyige.service.EvidenceService;
import com.siyige.service.ScoreService;
import com.siyige.service.UtteranceCheck;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 评分评测脚手架（离线、可复现；不依赖网络 / LLM）。
 *
 * <p>和 {@code ScoreEvalTest} 的分工：那个类是「评分有效性的断言基线」，这个类把评测
 * **做成可扩展的脚手架**，把本轮新增的两项护栏指标也纳进来：
 *
 * <ul>
 *   <li>排序一致性 pairwise accuracy（目标 ≥0.75）</li>
 *   <li>档位单调性：全局均值 + 同题内 good>mid>poor>empty</li>
 *   <li>重复运行漂移（SPEC：≤5 分）</li>
 *   <li><b>fabricated-quote 率</b>：9 条固定 AI 输出（真引用/假引用/改写各 3 条）跑引用校验，
 *       统计「伪造引用未被拦下」的比例与「真引用被误判」的比例</li>
 *   <li><b>rubric 完整性</b>：五维权重合计 100、每维有 basis、focus 存在；后端未落地时
 *       skip 并打印「待后端合并」，不误报红</li>
 * </ul>
 *
 * <p>默认断言全部在本地规则评分上跑，CI 不需要任何外部依赖。附产物：
 * {@code server/target/eval-harness-report.md}。
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class EvalHarnessTest {

    private static final double PAIRWISE_TARGET = 0.75;
    private static final int DRIFT_LIMIT = 5;
    /** 伪造引用未命中率 / 真引用误判率的上限（占位逐字校验应远低于它）。 */
    private static final double QUOTE_MISS_LIMIT = 0.10;

    private final ScoreService scorer = new ScoreService(mock(EvidenceService.class));
    private final UtteranceCheck utterance = new UtteranceCheck();
    private final List<String> report = new ArrayList<>();

    // ---------------- 1. 排序一致性 + 档位单调性 ----------------

    @Test
    @Order(1)
    void 排序一致性与档位单调性() throws Exception {
        List<EvalCorpus.Sample> dataset = EvalCorpus.dataset();
        List<EvalMetrics.Point> points = pointsOf(dataset);

        EvalMetrics.Pairwise pairwise = EvalMetrics.pairwise(points);
        Map<String, Double> means = EvalMetrics.tierMeans(points);
        List<String> violations = EvalMetrics.tierOrderViolations(points);

        line("## 一、排序一致性与档位单调性\n");
        line("- 样本：" + points.size() + " 条（" + distinctTopics(points) + " 题）");
        line("- pairwise accuracy = " + pairwise.correct() + "/" + pairwise.total()
                + " = " + EvalMetrics.pct(pairwise.accuracy()) + "（目标 ≥"
                + (int) (PAIRWISE_TARGET * 100) + "%）");
        for (String tier : List.of("good", "mid", "poor", "empty")) {
            line("- " + tier + " 档均值 = " + EvalMetrics.fmt(means.get(tier))
                    + "（n=" + points.stream().filter(p -> p.tier().equals(tier)).count() + "）");
        }
        line("- 档位单调性违例：" + (violations.isEmpty() ? "无（全局 + 同题内全部正确）" : String.join("；", violations)) + "\n");

        assertTrue(pairwise.total() > 0, "评测集里没有可比对");
        assertTrue(pairwise.accuracy() >= PAIRWISE_TARGET,
                "排序一致性应 ≥" + PAIRWISE_TARGET + "，实际 " + EvalMetrics.fmt(pairwise.accuracy()));
        assertTrue(means.get("good") > means.get("mid")
                        && means.get("mid") > means.get("poor")
                        && means.get("poor") > means.get("empty"),
                "档位均值必须严格递增：" + means);
        assertTrue(violations.isEmpty(), "档位单调性违例：" + String.join("；", violations));
    }

    // ---------------- 2. 重复运行漂移 ----------------

    @Test
    @Order(2)
    void 重复运行漂移() throws Exception {
        List<EvalCorpus.Sample> dataset = EvalCorpus.dataset();
        List<EvalMetrics.Point> base = pointsOf(dataset);
        List<EvalMetrics.Point> second = pointsOf(dataset);
        List<EvalMetrics.Point> third = pointsOf(dataset);

        int drift = Math.max(EvalMetrics.maxDrift(base, second), EvalMetrics.maxDrift(base, third));
        line("## 二、重复运行漂移\n");
        line("- 3 次完整重跑，" + base.size() + " 条样本，同一样本最大漂移 = " + drift
                + " 分（SPEC ≤" + DRIFT_LIMIT + "；规则引擎确定性应为 0）\n");

        assertTrue(drift <= DRIFT_LIMIT, "重复评分漂移应 ≤" + DRIFT_LIMIT + " 分，实际 " + drift);
    }

    // ---------------- 3. fabricated-quote 率 ----------------

    @Test
    @Order(3)
    void 伪造引用未命中率() throws Exception {
        List<EvalCorpus.QuoteCase> cases = EvalCorpus.quoteCases(EvalCorpus.dataset());
        QuoteVerifier verifier = QuoteVerifier.active();

        int fabricated = 0, missed = 0, real = 0, falsePositive = 0;
        StringBuilder detail = new StringBuilder();
        for (EvalCorpus.QuoteCase c : cases) {
            QuoteVerifier.Verdict v = verifier.verify(c.quote(), c.source());
            if (c.expectedFabricated()) {
                fabricated++;
                if (v.cited()) missed++;
            } else {
                real++;
                if (!v.cited()) falsePositive++;
            }
            detail.append(String.format("- `%s` [%s] → %s（%s）%n",
                    c.id(), c.kind(), v.cited() ? "可核实" : "未命中", v.reason()));
        }
        double missRate = fabricated == 0 ? Double.NaN : (double) missed / fabricated;
        double fpRate = real == 0 ? Double.NaN : (double) falsePositive / real;

        line("## 三、引用真实性护栏（fabricated-quote 率）\n");
        line("- 校验实现：`" + verifier.name() + "`");
        line("- 样本：" + cases.size() + " 条（真引用 " + real + " / 伪造或改写 " + fabricated + "）");
        line("- **fabricated-quote 未命中率 = " + missed + "/" + fabricated + " = "
                + EvalMetrics.pct(missRate) + "**（越低越好；目标 ≤"
                + (int) (QUOTE_MISS_LIMIT * 100) + "%）");
        line("- 真引用误判率 = " + falsePositive + "/" + real + " = " + EvalMetrics.pct(fpRate)
                + "（越低越好；目标 ≤" + (int) (QUOTE_MISS_LIMIT * 100) + "%）");
        line("- 明细：");
        report.add(detail.toString());

        assertNotNull(verifier.name());
        assertTrue(fabricated > 0 && real > 0, "引用样本必须同时包含真引用与伪造引用");
        assertTrue(missRate <= QUOTE_MISS_LIMIT,
                "fabricated-quote 未命中率应 ≤" + QUOTE_MISS_LIMIT + "，实际 " + EvalMetrics.pct(missRate)
                        + "（实现：" + verifier.name() + "）");
        assertTrue(fpRate <= QUOTE_MISS_LIMIT,
                "真引用误判率应 ≤" + QUOTE_MISS_LIMIT + "，实际 " + EvalMetrics.pct(fpRate)
                        + "（实现：" + verifier.name() + "）");
    }

    // ---------------- 4. rubric 完整性 ----------------

    @Test
    @Order(4)
    void rubric完整性() throws Exception {
        List<EvalCorpus.Sample> dataset = EvalCorpus.dataset();
        ScoreService.Score sample = scoreOf(dataset.get(0));
        RubricInspector.Rubric rubric = RubricInspector.discover(scorer, sample);

        if (rubric == null) {
            String msg = "待后端合并：未发现 rubric 接口（Score#rubric() / ScoreService#rubric() / com.siyige.ai.Rubric）。"
                    + "后端落地后本测试会自动开始校验五维权重=100、每维 basis、focus。";
            System.out.println("[rubric] " + msg);
            line("## 四、rubric 完整性\n");
            line("- 状态：**SKIP（待后端合并）**");
            line("- 原因：" + msg + "\n");
            Assumptions.assumeTrue(false, msg);
            return;
        }

        List<String> problems = RubricInspector.completenessProblems(rubric);
        line("## 四、rubric 完整性\n");
        line("- 来源：`" + rubric.origin() + "`");
        rubric.dimensions().forEach((k, d) ->
                line("- " + k + "(" + RubricInspector.label(k) + ")：权重=" + d.weight()
                        + " · basis=" + (d.basis() == null ? "缺失" : "有")
                        + " · focus=" + (d.focus() == null ? "-" : d.focus())));
        line("- 顶层 focus：" + (rubric.focus() == null ? "缺失" : rubric.focus()));
        line("- 完整性问题：" + (problems.isEmpty() ? "无" : String.join("；", problems)) + "\n");

        assertTrue(problems.isEmpty(), "rubric 完整性不通过：" + String.join("；", problems));
    }

    /** rubric 尚未落地时，这条自检保证「完整性检查器」本身不是摆设。 */
    @Test
    @Order(5)
    void rubric检查器自检() {
        Map<String, Object> good = new LinkedHashMap<>();
        Map<String, Object> dims = new LinkedHashMap<>();
        int[] weights = {25, 30, 15, 20, 10};
        List<String> keys = RubricInspector.CANONICAL;
        for (int i = 0; i < keys.size(); i++) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("weight", weights[i]);
            d.put("basis", "口径-" + keys.get(i) + "：可核查的判断标准");
            dims.put(keys.get(i), d);
        }
        good.put("dimensions", dims);
        good.put("focus", "优先改进：先给判准，再给可核查依据");

        RubricInspector.Rubric parsed = RubricInspector.parse(good, "self-test");
        assertNotNull(parsed, "合法 rubric 应能被解析");
        List<String> noProblems = RubricInspector.completenessProblems(parsed);
        assertTrue(noProblems.isEmpty(), "合法 rubric 不应报问题，实际 " + noProblems);

        // 反例：权重合计 90、有两个维度缺 basis、无 focus → 三条都要被抓出来
        Map<String, Object> broken = new LinkedHashMap<>();
        Map<String, Object> badDims = new LinkedHashMap<>();
        int[] badWeights = {25, 30, 15, 20, 0};
        for (int i = 0; i < keys.size(); i++) {
            String k = keys.get(i);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("weight", badWeights[i]);
            if (!k.equals("manner") && !k.equals("adapt")) d.put("basis", "口径-" + k);
            badDims.put(k, d);
        }
        broken.put("dimensions", badDims);
        RubricInspector.Rubric bad = RubricInspector.parse(broken, "self-test-broken");
        assertNotNull(bad, "反例 rubric 也应能被解析");
        List<String> problems = RubricInspector.completenessProblems(bad);
        assertTrue(problems.stream().anyMatch(p -> p.contains("合计")),
                "应抓到权重合计≠100：" + problems);
        assertTrue(problems.stream().filter(p -> p.contains("basis")).count() >= 2,
                "应抓到缺失的 basis：" + problems);
        assertTrue(problems.stream().anyMatch(p -> p.contains("focus")),
                "应抓到缺 focus：" + problems);

        line("## 五、rubric 检查器自检\n");
        line("- 合法 rubric：0 问题；反例 rubric 抓到 " + problems.size() + " 条问题 → 检查器有效\n");
    }

    // ---------------- 6. 编数字（论据库路径） ----------------

    /**
     * 编数字边界样例的另一条路径：有论据库时，ScoreService 会把「库里查不到的数字」点名并扣分。
     * 这是 edge-fake-number 在生产链路里的真实形态；不单独断言的话，边界样例只验证了「不崩」。
     */
    @Test
    @Order(6)
    void 编数字应被论据审计点名() {
        List<Map<String, Object>> cards = new ArrayList<>();
        Map<String, Object> card = new HashMap<>();
        card.put("claim", "取消期末考试后学生成绩提升缺乏可核查的公开统计");
        card.put("source", "评测内置论据卡（示例）");
        cards.add(card);

        Store store = mock(Store.class);
        when(store.evidence("edge-topic")).thenReturn(cards);
        ScoreService withEvidence = new ScoreService(new EvidenceService(store));

        EvalCorpus.Sample fake = EvalCorpus.edgeCases().stream()
                .filter(s -> s.id().equals("edge-fake-number"))
                .findFirst().orElseThrow();

        Map<String, Object> turn = new HashMap<>();
        turn.put("step", 1);
        turn.put("seat", "B2");
        turn.put("seg", "立论");
        turn.put("content", fake.text());
        turn.put("status", "OK");

        ScoreService.Score sc = withEvidence.score(List.of(turn), Set.of("B2"), "edge-topic");
        line("## 六、编数字审计（论据库路径）\n");
        line("- `" + fake.id() + "` → " + sc.total() + " 分 · fabricated=" + sc.fabricated()
                + " · evidence 维度=" + sc.evidence());
        assertTrue(sc.fabricated().stream().anyMatch(f -> f.contains("87.6")),
                "应点名 87.6% 这个编造数字，实际 " + sc.fabricated());
        assertTrue(sc.fabricated().stream().anyMatch(f -> f.contains("43")),
                "应点名 43% 这个编造数字，实际 " + sc.fabricated());
        line("");
    }

    // ---------------- 7. 边界样例 ----------------

    @Test
    @Order(7)
    void 边界样例不崩且不透支高分() throws Exception {
        List<EvalCorpus.Sample> dataset = EvalCorpus.dataset();
        double goodMean = EvalMetrics.tierMeans(pointsOf(dataset)).get("good");

        List<EvalCorpus.Sample> edges = EvalCorpus.edgeCases();
        Map<String, Integer> totals = new LinkedHashMap<>();
        line("## 七、边界样例（8 条）\n");
        for (EvalCorpus.Sample s : edges) {
            ScoreService.Score sc = scoreOf(s);
            totals.put(s.id(), sc.total());
            String status = s.status().isBlank() ? (utterance.vacuous(s.text()) ? "EMPTY" : "OK") : s.status();
            line("- `" + s.id() + "`（" + s.topic() + "）→ " + sc.total() + " 分 · status=" + status
                    + " · 瑕疵=" + sc.flaws().keySet());
            assertTrue(sc.total() >= 0 && sc.total() <= 100, s.id() + " 总分越界：" + sc.total());
            assertTrue(sc.total() <= goodMean + 5,
                    s.id() + " 不应拿到接近优秀档的高分（" + sc.total() + " vs 优秀档均值 " + EvalMetrics.fmt(goodMean) + "）");
        }
        line("");

        assertEquals(0, totals.get("edge-timeout").intValue(), "超时发言不计内容，整场无有效发言应为 0 分");
        assertTrue(totals.get("edge-slogan") < goodMean, "纯口号不应高于优秀档均值");
        assertTrue(totals.get("edge-ultra-short") < goodMean, "超短发言不应高于优秀档均值");

        // 8 条边界样例的来源写清楚，报告可复核
        for (EvalCorpus.Sample s : edges) line("- 来源：" + s.id() + " ← " + s.source());
        line("");
    }

    // ---------------- 工具 ----------------

    private List<EvalMetrics.Point> pointsOf(List<EvalCorpus.Sample> dataset) {
        List<EvalMetrics.Point> out = new ArrayList<>();
        for (EvalCorpus.Sample s : dataset) {
            out.add(new EvalMetrics.Point(s.id(), s.topic(), s.tier(), scoreOf(s).total()));
        }
        return out;
    }

    /**
     * 与生产链路一致：敷衍发言记为 EMPTY（不计内容），超时记为 TIMEOUT（计数但不计内容）。
     * 这两点和 {@code ScoreEvalTest} 的约定保持一致，避免评测口径分叉。
     */
    private ScoreService.Score scoreOf(EvalCorpus.Sample s) {
        String status = s.status().isBlank()
                ? (utterance.vacuous(s.text()) ? "EMPTY" : "OK")
                : s.status();
        Map<String, Object> turn = new HashMap<>();
        turn.put("step", 1);
        turn.put("seat", "B2");
        turn.put("seg", "立论");
        turn.put("content", s.text());
        turn.put("status", status);
        return scorer.score(List.of(turn), Set.of("B2"));
    }

    private static long distinctTopics(List<EvalMetrics.Point> points) {
        return points.stream().map(EvalMetrics.Point::topic).distinct().count();
    }

    private void line(String s) {
        report.add(s);
        System.out.println(s);
    }

    @AfterAll
    void writeReport() {
        try {
            Path out = Path.of("target", "eval-harness-report.md");
            Files.createDirectories(out.getParent());
            StringBuilder sb = new StringBuilder("# 评分评测脚手架报告（自动生成）\n\n");
            sb.append("- 生成时间：").append(LocalDateTime.now()).append("\n");
            sb.append("- 语料：20 题 × 4 档 = 80 条（`/eval/score-dataset.json`）+ 8 条边界样例 + 9 条引用校验样本\n\n");
            for (String l : report) sb.append(l).append("\n");
            Files.writeString(out, sb.toString(), StandardCharsets.UTF_8);
            System.out.println("[评测] 报告已写入 " + out.toAbsolutePath());
        } catch (Exception e) {
            System.out.println("[评测] 报告写入失败（不影响测试结论）：" + e);
        }
    }
}
