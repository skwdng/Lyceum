package com.siyige.judges;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.ai.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AI 评审团：四位裁判**并行**独立打分，再取平均。
 *
 * <p>为什么并行：串行 4 次模型调用要 20 秒以上，并行一次往返就够（~4-6 秒）。
 * 为什么独立：如果让一个模型一次给出四个视角的分数，它会自我一致，
 * 四个数几乎相同，平均就没有意义了。分开问才有分歧，平均才有信息量。
 */
@Service
public class AiJudgeService {

    private static final Logger log = LoggerFactory.getLogger(AiJudgeService.class);
    private final LlmClient llm;
    private final ObjectMapper json = new ObjectMapper();
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public AiJudgeService(LlmClient llm) { this.llm = llm; }

    public boolean enabled() { return llm.enabled(); }

    /** 一位裁判的结论。 */
    public record Verdict(String key, String name, String lens, int score,
                          List<String> strengths, List<Map<String, String>> weaknesses,
                          List<String> scoringPoints, String comment, boolean failed) { }

    /** 评审团汇总。 */
    public record Panel(int average, int min, int max, int consensusBonus,
                        List<Verdict> judges, List<Map<String, String>> consensus,
                        List<String> allStrengths, String summary, int tokens) { }

    /**
     * 跑评审团。
     *
     * @param topic    辩题
     * @param segment  环节
     * @param myText   我这一场全部发言（拼起来）
     * @param oppLast  对方最近一次发言（用来判断是否交锋）
     * @param ruleScore 规则引擎给的分（作为参照，不让模型盲打）
     */
    public Panel judge(String topic, String segment, String myText, String oppLast,
                       int ruleScore, Map<String, Integer> ruleDims) {
        if (!enabled()) return null;
        if (myText == null || myText.isBlank()) return null;

        String base = buildBrief(topic, segment, myText, oppLast, ruleScore, ruleDims);

        List<CompletableFuture<Verdict>> futures = new ArrayList<>();
        for (JudgePersonas.Judge j : JudgePersonas.ALL) {
            futures.add(CompletableFuture.supplyAsync(() -> callOne(j, base), pool));
        }
        List<Verdict> verdicts = new ArrayList<>();
        for (CompletableFuture<Verdict> f : futures) {
            try {
                verdicts.add(f.join());
            } catch (Exception e) {
                log.warn("评审智能体失败：{}", e.toString());
            }
        }
        if (verdicts.isEmpty()) return null;

        // 只有成功的裁判参与平均
        List<Verdict> ok = verdicts.stream().filter(v -> !v.failed()).toList();
        if (ok.isEmpty()) return null;

        int sum = 0, min = 100, max = 0;
        for (Verdict v : ok) {
            sum += v.score();
            min = Math.min(min, v.score());
            max = Math.max(max, v.score());
        }
        int avg = Math.round((float) sum / ok.size());

        // 共识问题：先把每位裁判的弱点归到「问题类型」，同一类型被 ≥2 位提到就是共识。
        // 直接比字符串不行——四个人说法不一样，但说的是同一件事。
        Map<String, Map<String, String>> bucket = new LinkedHashMap<>();
        Map<String, Integer> hits = new LinkedHashMap<>();
        Map<String, Set<String>> who = new LinkedHashMap<>();
        for (Verdict v : ok) {
            Set<String> seenCat = new LinkedHashSet<>();
            for (Map<String, String> w : v.weaknesses()) {
                String cat = categorize(w.get("why"));
                if (cat == null || seenCat.contains(cat)) continue;
                seenCat.add(cat);
                hits.merge(cat, 1, Integer::sum);
                who.computeIfAbsent(cat, k -> new LinkedHashSet<>()).add(v.name());
                Map<String, String> keep = bucket.computeIfAbsent(cat, k -> new LinkedHashMap<>());
                // 保留第一条（含具体引文与改法），后面只累加认同人数
                keep.putIfAbsent("category", cat);
                keep.putIfAbsent("quote", w.get("quote"));
                keep.putIfAbsent("why", w.get("why"));
                keep.putIfAbsent("fix", w.get("fix"));
                keep.putIfAbsent("judge", v.name());
            }
        }
        List<Map<String, String>> consensus = new ArrayList<>();
        for (Map.Entry<String, Integer> e : hits.entrySet()) {
            if (e.getValue() >= 2) {
                Map<String, String> w = bucket.get(e.getKey());
                w.put("agreed", String.join("、" , who.get(e.getKey())));
                consensus.add(w);
            }
        }
        // 共识问题按「几位裁判认同」降序，最要紧的排前面
        consensus.sort((a, b) -> hits.get(b.get("category")) - hits.get(a.get("category")));

        List<String> strengths = new ArrayList<>();
        for (Verdict v : ok) strengths.addAll(v.strengths());
        List<String> strengthsTop = strengths.stream().distinct().limit(4).toList();

        // 分歧大 → 提示「这场评价有争议」
        String summary;
        if (max - min >= 20) {
            summary = "裁判分歧较大（%d–%d 分），说明这场有争议点：有人认结构，有人认交锋。".formatted(min, max);
        } else if (avg >= 80) {
            summary = "四位裁判一致认为这场完成度较高（%d–%d 分）。".formatted(min, max);
        } else if (avg >= 65) {
            summary = "四位裁判评分接近（%d–%d 分），主要问题集中在共识问题里。".formatted(min, max);
        } else {
            summary = "四位裁判一致认为这场需要重做（%d–%d 分）。".formatted(min, max);
        }

        int tokens = (int) (llm.totalTokens() > 0 ? 0 : 0);   // 用量由 LlmClient 统一统计
        return new Panel(avg, min, max, 0, verdicts, consensus, strengthsTop, summary, tokens);
    }

    private String buildBrief(String topic, String segment, String myText, String oppLast,
                              int ruleScore, Map<String, Integer> dims) {
        StringBuilder sb = new StringBuilder();
        sb.append("【辩题】").append(topic == null ? "（未知）" : topic).append("\n");
        if (segment != null && !segment.isBlank()) sb.append("【环节】").append(segment).append("\n");
        if (oppLast != null && !oppLast.isBlank())
            sb.append("【对方最近一次发言（节选）】").append(truncate(oppLast, 220)).append("\n");
        sb.append("\n【待评的发言】\n").append(truncate(myText, 1200)).append("\n");
        sb.append("\n【参照】规则引擎按结构给这段打了 ").append(ruleScore).append(" 分");
        if (dims != null && !dims.isEmpty()) {
            sb.append("（");
            dims.forEach((k, v) -> sb.append(k).append(" ").append(v).append(" "));
            sb.append("）");
        }
        sb.append("。你可以不同意这个分，但请在 comment 里说明你的理由。\n");
        return sb.toString();
    }

    private Verdict callOne(JudgePersonas.Judge j, String base) {
        try {
            String raw = llm.chatJson(j.systemPrompt(), base, 60);
            JsonNode n = json.readTree(raw);
            int score = clampScore(n.path("score").asInt(60));
            List<String> strengths = strList(n.path("strengths"));
            List<Map<String, String>> weaknesses = mapList(n.path("weaknesses"));
            List<String> points = strList(n.path("scoringPoints"));
            String comment = n.path("comment").asText("");
            return new Verdict(j.key(), j.name(), j.lens(), score, strengths, weaknesses, points, comment, false);
        } catch (Exception e) {
            log.warn("裁判 {} 调用失败：{}", j.key(), e.toString());
            return new Verdict(j.key(), j.name(), j.lens(), 0, List.of(), List.of(), List.of(),
                    "这位裁判这次没给出意见（" + e.getClass().getSimpleName() + "）", true);
        }
    }

    private static int clampScore(int v) { return Math.max(0, Math.min(100, v)); }

    private static List<String> strList(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            for (JsonNode x : arr) {
                String s = x.asText("").trim();
                if (!s.isEmpty()) out.add(s);
            }
        }
        return out.size() > 4 ? out.subList(0, 4) : out;
    }

    private static List<Map<String, String>> mapList(JsonNode arr) {
        List<Map<String, String>> out = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            for (JsonNode x : arr) {
                Map<String, String> m = new LinkedHashMap<>();
                m.put("quote", x.path("quote").asText("").trim());
                m.put("why", x.path("why").asText("").trim());
                m.put("fix", x.path("fix").asText("").trim());
                if (!m.get("why").isEmpty()) out.add(m);
            }
        }
        return out.size() > 4 ? out.subList(0, 4) : out;
    }

    /** 问题类型 → 关键词。判定「几位裁判说的是同一件事」用。 */
    private static final Map<String, String[]> CATEGORIES = new java.util.LinkedHashMap<>() {{
        put("判准不可检验", new String[]{"判准", "口径", "可检验", "指标", "怎么算", "未说明怎样"});
        put("没回应对方", new String[]{"没有回应", "未回应", "自说自话", "稻草人", "没有点名", "回避", "没接住"});
        put("缺论据/不可核查", new String[]{"没有引用", "未引用", "无来源", "不可核查", "缺少出处", "没引任何", "证据", "法规名"});
        put("让步未闭合", new String[]{"让步", "推理链", "断裂", "虽然", "半推半就"});
        put("句子过长", new String[]{"长句", "60字", "一口气", "听不完"});
        put("口癖", new String[]{"口癖", "然后", "那个", "就是说"});
        put("编造数据", new String[]{"编造", "编数据", "无法核查的数字", "据说"});
        put("问句方向反了", new String[]{"问句方向", "抛回对方", "先答自己的口径"});
    }};

    /** 把一句「问题描述」归到某个类型；归不进去返回 null（不参与共识统计）。 */
    private static String categorize(String why) {
        if (why == null || why.isBlank()) return null;
        for (Map.Entry<String, String[]> e : CATEGORIES.entrySet()) {
            for (String kw : e.getValue()) {
                if (why.contains(kw)) return e.getKey();
            }
        }
        return null;
    }

    /** 归一化「问题描述」，用于判断两位裁判说的是不是同一件事。 */
    private static String normalize(String why) {
        if (why == null) return "";
        String s = why.replaceAll("[\\s，。；、,.!?：:；\"'（）()]", "");
        return s.length() > 12 ? s.substring(0, 12) : s;
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
