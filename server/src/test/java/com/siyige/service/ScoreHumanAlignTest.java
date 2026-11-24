package com.siyige.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 系统分 vs **人工独立标注** 的一致性（SPEC §14.7 的"与人排序一致性"）。
 *
 * <p>跑法：把两位辩手填好的盲评表汇总成
 * {@code server/src/test/resources/eval/human-labels.json}
 * （用 {@code python scripts/ingest_human_labels.py docs/评测集-盲评表.xlsx} 生成），
 * 然后 {@code mvn test -Dtest=ScoreHumanAlignTest}。
 *
 * <p>文件不存在时这个测试会 skip —— 不阻塞 CI，但报告里会明确写"尚未人工标注"。
 *
 * <p>为什么区分两种一致性：作者自评的分档只能证明"打分规则自身自洽"，
 * 只有第三方辩手独立打分，才能证明"系统判断贴近人的判断"。
 */
class ScoreHumanAlignTest {

    private final ScoreService scorer = new ScoreService(mock(EvidenceService.class));
    private final UtteranceCheck utterance = new UtteranceCheck();

    private JsonNode loadDataset() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/eval/score-dataset.json")) {
            return new ObjectMapper().readTree(in);
        }
    }

    private Path labelsPath() {
        return Path.of("src", "test", "resources", "eval", "human-labels.json");
    }

    @Test
    void 与人工标注的一致性达标() throws Exception {
        Path p = labelsPath();
        Assumptions.assumeTrue(Files.exists(p),
                "还没有人工标注（缺 " + p + "）：先填 docs/评测集-盲评表.xlsx 再跑 ingest_human_labels.py");

        JsonNode labels = new ObjectMapper().readTree(Files.readString(p));
        JsonNode dataset = loadDataset();

        List<Double> sys = new ArrayList<>();
        List<Double> human = new ArrayList<>();
        List<String> annotators = new ArrayList<>();
        labels.get("annotators").forEach(a -> annotators.add(a.asText()));

        int n = 0;
        for (JsonNode s : dataset.get("samples")) {
            JsonNode row = labels.get("labels").get(s.get("id").asText());
            if (row == null || row.isEmpty()) continue;

            List<Double> humanScores = new ArrayList<>();
            for (String who : annotators) {
                JsonNode v = row.get(who);
                if (v != null && v.isNumber()) humanScores.add(v.asDouble());
            }
            if (humanScores.isEmpty()) continue;

            String txt = s.get("text").asText();
            Map<String, Object> turn = new HashMap<>();
            turn.put("step", 1);
            turn.put("seat", "B2");
            turn.put("seg", "立论");
            turn.put("content", txt);
            turn.put("status", utterance.vacuous(txt) ? "EMPTY" : "OK");

            sys.add((double) scorer.score(List.of(turn), Set.of("B2")).total());
            human.add(humanScores.stream().mapToDouble(Double::doubleValue).average().orElse(0));
            n++;
        }

        assertTrue(n >= 20, "有效标注样本太少（" + n + "），至少要 20 条才有统计意义");

        double rho = spearman(sys, human);
        System.out.printf("%n[人工对齐] n=%d · Spearman ρ = %.3f%n", n, rho);

        // 排序一致性：以人工分为准，看系统分的方向对不对
        int pairs = 0, correct = 0;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                double dh = human.get(i) - human.get(j);
                if (Math.abs(dh) < 3) continue;             // 人工分差 <3 视为同档，不比较
                pairs++;
                if (Math.signum(dh) == Math.signum(sys.get(i) - sys.get(j))) correct++;
            }
        }
        double acc = pairs == 0 ? 0 : (double) correct / pairs;
        System.out.printf("[人工对齐] pairwise accuracy = %d/%d = %.3f%n", correct, pairs, acc);

        assertTrue(rho >= 0.6, "与人工总分应正相关（ρ ≥0.6），实际 " + String.format("%.3f", rho));
        assertTrue(acc >= 0.75, "与人工排序一致性应 ≥0.75，实际 " + String.format("%.3f", acc));
    }

    /** 纯 Java 实现 Spearman（避免为一次评测引额外的统计库）。 */
    static double spearman(List<Double> xs, List<Double> ys) {
        int n = xs.size();
        if (n < 3) return Double.NaN;
        double[] rx = rank(xs), ry = rank(ys);
        double mx = Arrays.stream(rx).average().orElse(0), my = Arrays.stream(ry).average().orElse(0);
        double num = 0, dx = 0, dy = 0;
        for (int i = 0; i < n; i++) {
            num += (rx[i] - mx) * (ry[i] - my);
            dx += (rx[i] - mx) * (rx[i] - mx);
            dy += (ry[i] - my) * (ry[i] - my);
        }
        return (dx == 0 || dy == 0) ? Double.NaN : num / Math.sqrt(dx * dy);
    }

    /** 平均秩（处理并列）。 */
    private static double[] rank(List<Double> v) {
        int n = v.size();
        Integer[] idx = new Integer[n];
        for (int i = 0; i < n; i++) idx[i] = i;
        Arrays.sort(idx, Comparator.comparingDouble(v::get));
        double[] r = new double[n];
        int i = 0;
        while (i < n) {
            int j = i;
            while (j + 1 < n && Double.compare(v.get(idx[j + 1]), v.get(idx[i])) == 0) j++;
            double avg = (i + j) / 2.0 + 1;
            for (int k = i; k <= j; k++) r[idx[k]] = avg;
            i = j + 1;
        }
        return r;
    }
}
