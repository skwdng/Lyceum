package com.siyige.eval;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 纯函数指标计算：不碰 IO、不碰 Spring，方便单测与复用。 */
final class EvalMetrics {

    private EvalMetrics() {}

    /** 一条已评分的样本。tier 为 good/mid/poor/empty（边界样例为 edge，不参与分档指标）。 */
    record Point(String id, String topic, String tier, int total) {}

    /** pairwise accuracy = 正确排序的对数 / 可比对总数（同档不比、跨题不比）。 */
    record Pairwise(int correct, int total) {
        double accuracy() {
            return total == 0 ? Double.NaN : (double) correct / total;
        }
    }

    static Pairwise pairwise(List<Point> points) {
        Map<String, List<Point>> byTopic = new LinkedHashMap<>();
        for (Point p : points) byTopic.computeIfAbsent(p.topic(), k -> new ArrayList<>()).add(p);

        int correct = 0, total = 0;
        for (List<Point> rows : byTopic.values()) {
            for (int i = 0; i < rows.size(); i++) {
                for (int j = i + 1; j < rows.size(); j++) {
                    int r1 = rank(rows.get(i).tier()), r2 = rank(rows.get(j).tier());
                    if (r1 < 0 || r2 < 0 || r1 == r2) continue;   // 边界样例 / 同档不比较
                    total++;
                    int s1 = rows.get(i).total(), s2 = rows.get(j).total();
                    boolean ok = r1 > r2 ? s1 > s2 : s2 > s1;     // 严格大于才算排序正确
                    if (ok) correct++;
                }
            }
        }
        return new Pairwise(correct, total);
    }

    /** 档位 3=good 2=mid 1=poor 0=empty；-1 表示不参与分档（edge）。 */
    static int rank(String tier) {
        return switch (tier) {
            case "good" -> 3;
            case "mid" -> 2;
            case "poor" -> 1;
            case "empty" -> 0;
            default -> -1;
        };
    }

    /** 各档均值，顺序固定为 good → mid → poor → empty。 */
    static Map<String, Double> tierMeans(List<Point> points) {
        Map<String, double[]> acc = new LinkedHashMap<>();
        for (String t : List.of("good", "mid", "poor", "empty")) acc.put(t, new double[2]);
        for (Point p : points) {
            double[] a = acc.get(p.tier());
            if (a == null) continue;
            a[0] += p.total();
            a[1]++;
        }
        Map<String, Double> out = new LinkedHashMap<>();
        acc.forEach((k, v) -> out.put(k, v[1] == 0 ? Double.NaN : v[0] / v[1]));
        return out;
    }

    /**
     * 档位单调性检查（两类都查）：
     * ① 全局均值 good > mid > poor > empty；
     * ② 同一辩题内 good > mid > poor > empty（允许跨题难度差异，但不允许题内反转）。
     */
    static List<String> tierOrderViolations(List<Point> points) {
        List<String> out = new ArrayList<>();
        String[] seq = {"good", "mid", "poor", "empty"};
        Map<String, Double> means = tierMeans(points);
        for (int i = 0; i + 1 < seq.length; i++) {
            Double a = means.get(seq[i]), b = means.get(seq[i + 1]);
            if (a == null || b == null || a.isNaN() || b.isNaN()) continue;
            if (!(a > b)) out.add("全局档位均值：" + seq[i] + "(" + fmt(a) + ") 应 > " + seq[i + 1] + "(" + fmt(b) + ")");
        }

        Map<String, Map<String, Integer>> perTopic = new LinkedHashMap<>();
        for (Point p : points) {
            if (rank(p.tier()) < 0) continue;
            perTopic.computeIfAbsent(p.topic(), k -> new LinkedHashMap<>()).put(p.tier(), p.total());
        }
        perTopic.forEach((topic, m) -> {
            for (int i = 0; i + 1 < seq.length; i++) {
                Integer a = m.get(seq[i]), b = m.get(seq[i + 1]);
                if (a == null || b == null) continue;
                if (!(a > b)) out.add(topic + "：" + seq[i] + "(" + a + ") 应 > " + seq[i + 1] + "(" + b + ")");
            }
        });
        return out;
    }

    /** 两次完整重跑之间，同一样本分值的最大绝对漂移。 */
    static int maxDrift(List<Point> base, List<Point> again) {
        Map<String, Integer> first = new HashMap<>();
        for (Point p : base) first.put(p.id(), p.total());
        int max = 0;
        for (Point p : again) {
            Integer v = first.get(p.id());
            if (v != null) max = Math.max(max, Math.abs(v - p.total()));
        }
        return max;
    }

    static String fmt(double d) {
        return Double.isNaN(d) ? "n/a" : String.format(Locale.ROOT, "%.1f", d);
    }

    static String pct(double rate) {
        return Double.isNaN(rate) ? "n/a" : String.format(Locale.ROOT, "%.1f%%", rate * 100);
    }
}
