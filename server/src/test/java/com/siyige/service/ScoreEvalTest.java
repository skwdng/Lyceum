package com.siyige.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 评分有效性评测（SPEC §14.7）。
 *
 * <p>为什么需要它：五维分、能力雷达全是产品自己算的，如果没人用**外部标准**去校准，
 * 就是"自己出卷子自己判卷"。这个测试把人工分档当基准，量化两件事：
 *
 * <ul>
 *   <li><b>排序一致性</b>：同一辩题下，人工判为"优秀"的发言，系统给分是否高于"中等"、
 *       高于"较差"、高于"敷衍"。指标用 pairwise accuracy（正确排序的对数 / 总对数），
 *       目标 ≥0.75（SPEC 要求）。</li>
 *   <li><b>稳定性</b>：同一条发言重复评分，分数不应漂移（规则引擎应完全确定，σ=0）。</li>
 * </ul>
 *
 * <p>数据集：{@code src/test/resources/eval/score-dataset.json}，8 题 × 4 档 = 32 条，
 * 每条都按四维度人工标注（判准/证据/回应/交锋）。扩充时只加样本、不动代码。
 */
class ScoreEvalTest {

    private final ScoreService scorer = new ScoreService(mock(EvidenceService.class));

    private static final Map<String, Integer> TIER_RANK = Map.of("good", 3, "mid", 2, "poor", 1, "empty", 0);

    private JsonNode load() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/eval/score-dataset.json")) {
            assertNotNull(in, "缺少评测集 score-dataset.json");
            return new ObjectMapper().readTree(in);
        }
    }

    private final UtteranceCheck utterance = new UtteranceCheck();

    /**
     * 和真实链路一致：敷衍发言在落库时会被 UtteranceCheck 标成 EMPTY（不计内容）。
     * 之前评测直接全标 OK，导致"对。""11"也能拿 43 分——那是评测方式错了，不是评分错。
     */
    private ScoreService.Score scoreOf(String text) {
        String status = utterance.vacuous(text) ? "EMPTY" : "OK";
        Map<String, Object> turn = new java.util.HashMap<>();
        turn.put("step", 1);
        turn.put("seat", "B2");
        turn.put("seg", "立论");
        turn.put("content", text);
        turn.put("status", status);
        return scorer.score(List.of(turn), Set.of("B2"));
    }

    @Test
    void 评分与人排序一致性达标() throws Exception {
        JsonNode root = load();
        Map<String, List<double[]>> byTopic = new LinkedHashMap<>();   // topic → [rank, total]

        for (JsonNode s : root.get("samples")) {
            String tier = s.get("tier").asText();
            int rank = TIER_RANK.get(tier);
            int total = scoreOf(s.get("text").asText()).total();
            byTopic.computeIfAbsent(s.get("topic").asText(), k -> new ArrayList<>())
                    .add(new double[]{rank, total});
        }

        int pairs = 0, correct = 0;
        for (Map.Entry<String, List<double[]>> e : byTopic.entrySet()) {
            List<double[]> rows = e.getValue();
            for (int i = 0; i < rows.size(); i++) {
                for (int j = i + 1; j < rows.size(); j++) {
                    double r1 = rows.get(i)[0], r2 = rows.get(j)[0];
                    if (r1 == r2) continue;                       // 同档不比较
                    pairs++;
                    double s1 = rows.get(i)[1], s2 = rows.get(j)[1];
                    boolean ok = (r1 > r2) ? s1 > s2 : s2 > s1;
                    if (ok) correct++;
                }
            }
        }
        // 明细：方便定位哪一档被算错
        for (Map.Entry<String, List<double[]>> e : byTopic.entrySet()) {
            StringBuilder sb = new StringBuilder("  " + e.getKey() + ": ");
            for (double[] row : e.getValue()) {
                sb.append("[档").append((int) row[0]).append(" 分").append((int) row[1]).append("] ");
            }
            System.out.println(sb);
        }
        assertTrue(pairs > 0, "数据集里没有可比对");
        double acc = (double) correct / pairs;
        System.out.printf("%n[评测] 与人排序一致性 pairwise accuracy = %d/%d = %.3f%n", correct, pairs, acc);
        assertTrue(acc >= 0.75, "排序一致性应 ≥0.75，实际 " + String.format("%.3f", acc));
    }

    @Test
    void 评分稳定不漂移() throws Exception {
        JsonNode root = load();
        int maxDrift = 0;
        for (JsonNode s : root.get("samples")) {
            String text = s.get("text").asText();
            int a = scoreOf(text).total();
            for (int i = 0; i < 3; i++) maxDrift = Math.max(maxDrift, Math.abs(scoreOf(text).total() - a));
        }
        System.out.printf("[评测] 同一发言重复评分最大漂移 = %d 分（规则引擎应恒为 0）%n", maxDrift);
        assertTrue(maxDrift <= 5, "漂移应 ≤5 分（SPEC），实际 " + maxDrift);
    }

    @Test
    void 档位均值递增且同题内排序全对() throws Exception {
        JsonNode root = load();
        Map<String, List<Integer>> byTier = new LinkedHashMap<>();
        Map<String, Map<String, Integer>> perTopic = new LinkedHashMap<>();

        for (JsonNode s : root.get("samples")) {
            String tier = s.get("tier").asText();
            int total = scoreOf(s.get("text").asText()).total();
            byTier.computeIfAbsent(tier, k -> new ArrayList<>()).add(total);
            perTopic.computeIfAbsent(s.get("topic").asText(), k -> new LinkedHashMap<>()).put(tier, total);
        }

        byTier.forEach((k, v) -> System.out.printf("[评测] %-6s 均值 %.1f（n=%d）%n",
                k, v.stream().mapToInt(Integer::intValue).average().orElse(0), v.size()));

        String[] order = {"good", "mid", "poor", "empty"};
        double prev = 999;
        for (String tier : order) {
            List<Integer> v = byTier.get(tier);
            if (v == null) continue;
            double avg = v.stream().mapToInt(Integer::intValue).average().orElse(0);
            assertTrue(avg < prev, tier + " 档均值应低于上一档，实际 " + avg + " vs " + prev);
            prev = avg;
        }

        // 同一辩题内：优秀 > 中等 > 较差 > 敷衍（逐题检查，允许跨题难度差异）
        for (Map.Entry<String, Map<String, Integer>> e : perTopic.entrySet()) {
            Map<String, Integer> m = e.getValue();
            String[] seq = {"good", "mid", "poor", "empty"};
            for (int i = 0; i + 1 < seq.length; i++) {
                Integer a = m.get(seq[i]), b = m.get(seq[i + 1]);
                if (a == null || b == null) continue;
                assertTrue(a > b, e.getKey() + "：" + seq[i] + "(" + a + ") 应高于 " + seq[i + 1] + "(" + b + ")");
            }
        }
        System.out.println("[评测] 同题内档位排序：全部正确");
    }

    @Test
    void 结构合法率与完整率() throws Exception {
        JsonNode root = load();
        int n = 0, legal = 0, complete = 0;
        for (JsonNode s : root.get("samples")) {
            n++;
            ScoreService.Score sc = scoreOf(s.get("text").asText());
            if (sc.total() >= 0 && sc.total() <= 100) legal++;
            int[] dims = {sc.matter(), sc.method(), sc.manner(), sc.adapt(), sc.evidence()};
            boolean ok = true;
            for (int d : dims) if (d < 0 || d > 100) ok = false;
            if (ok) complete++;
        }
        double legalRate = (double) legal / n, completeRate = (double) complete / n;
        System.out.printf("[评测] 合法率 %.1f%% · 完整率 %.1f%% · 样本 %d 条%n",
                legalRate * 100, completeRate * 100, n);
        assertTrue(legalRate >= 0.99, "合法率应 ≥99%");
        assertTrue(completeRate >= 0.98, "完整率应 ≥98%");

        // 顺手产出一份人可读的报告（CI 里也能看到）
        try {
            Path out = Path.of("target", "eval-report.md");
            Files.createDirectories(out.getParent());
            Files.writeString(out, "# 评分有效性评测（自动生成）\n\n" +
                    "- 样本：" + n + " 条（" + (n / 4) + " 题 × 4 档）\n" +
                    "- 合法率：" + String.format("%.1f%%", legalRate * 100) + "\n" +
                    "- 完整率：" + String.format("%.1f%%", completeRate * 100) + "\n" +
                    "- 生成时间：" + java.time.LocalDateTime.now() + "\n");
        } catch (Exception ignore) { /* 报告只是附产物 */ }
    }
}
