package com.siyige.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 评分（v2）。
 *
 * 和 v1 的差别——v1 是「字数 + 关键词计数」，写得长就高分，所以用户会觉得"评分有问题"。
 * v2 按**结构**打分，长度只是门槛：
 *
 *   立论 25%  有没有明确判断 + 判断标准
 *   论证 30%  有没有因果链 / 让步转折 / 前提到结论
 *   表达 15%  句子长度是否合理、口癖多不多（太长不加分）
 *   应变 20%  有没有真的点对方、有没有用问句施压
 *   论据 10%  引用论据库的条数（编数字倒扣）
 *
 * 另外：协同分（接队友）与「瑕疵检出」都进复盘与画像，瑕疵不再是写死的假数据。
 */
@Service
public class ScoreService {

    public record Score(int total, int matter, int method, int manner, int adapt, int evidence,
                        int collab, String collabNote,
                        int cited, List<String> fabricated,
                        int flawHits, int flawTries,
                        List<Map<String, Object>> perTurn,
                        Map<String, Integer> flaws,
                        String quote, String problem, String improve, int turns, int timeout) {}

    // 结构标记
    private static final Pattern JUDGE = Pattern.compile("(我方认为|我方主张|我方判断|判断是|结论是|应当|不应|必须|不能)");
    private static final Pattern STANDARD = Pattern.compile("(标准|三条|两条|首先|第一|前提|口径)");
    private static final Pattern CAUSAL = Pattern.compile("(因为|所以|因此|由于|导致|从而|既然)");
    private static final Pattern CONCEDE = Pattern.compile("(虽然|但是|然而|即便|退一步|就算)");
    private static final Pattern HYPOTHESIS = Pattern.compile("(如果|假如|倘若)");
    private static final Pattern OPPONENT = Pattern.compile("(对方|你方|反方|正方)");
    private static final Pattern QUESTION = Pattern.compile("[？?]|(请问|我请教|我想问|请你回答)");
    private static final Pattern FILLER = Pattern.compile("(然后|那个|就是说|其实吧|嗯|呃)");

    // 瑕疵
    private static final Pattern FLAW_UNPROVEN = Pattern.compile("(显然|众所周知|毋庸置疑|不言而喻|不用多说)");
    private static final Pattern FLAW_ABSOLUTE = Pattern.compile("(所有|全部|一律|从来没有|绝对)");
    private static final Pattern FLAW_AUTHORITY = Pattern.compile("(专家说|权威|大家都|人人都)");
    private static final Pattern EXAMPLE = Pattern.compile("(例如|比如|举个例子|以.*为例|案例)");

    private final EvidenceService evidenceService;

    public ScoreService(EvidenceService evidenceService) { this.evidenceService = evidenceService; }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats) {
        return score(turns, mySeats, null);
    }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats, String topicId) {
        return score(turns, mySeats, topicId, List.of());
    }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats, String topicId,
                       List<Map<String, Object>> flawRows) {
        List<String> mine = new ArrayList<>();
        int timeouts = 0;
        String firstQuote = "";

        for (Map<String, Object> t : turns) {
            String seat = String.valueOf(t.get("seat"));
            if (!mySeats.contains(seat)) continue;
            if ("TIMEOUT".equals(String.valueOf(t.get("status")))) { timeouts++; continue; }
            String c = String.valueOf(t.get("content"));
            if (firstQuote.isEmpty()) firstQuote = c;
            mine.add(c);
        }

        String all = String.join("\n", mine);
        int chars = all.replaceAll("\\s", "").length();
        int okTurns = mine.size();

        int matter = measureMatter(all, chars);
        int method = measureMethod(all, chars);
        int manner = measureManner(all);
        int adapt = measureAdapt(all, mine, turns, mySeats);
        int evidence = 40;
        int collab = measureCollab(mine, turns, mySeats, all);

        int cited = 0;
        List<String> fabricated = new ArrayList<>();
        if (topicId != null && evidenceService != null) {
            List<Map<String, Object>> cards = evidenceService.cards(topicId);
            if (!cards.isEmpty()) {
                for (String c : mine) {
                    EvidenceService.Audit a = evidenceService.audit(c, cards);
                    cited += a.cited();
                    for (String f : a.fabricated()) if (!fabricated.contains(f)) fabricated.add(f);
                }
                evidence = clamp(40 + cited * 10);
                evidence = Math.max(20, evidence - 8 * fabricated.size());
            }
        } else {
            evidence = clamp(45 + (all.contains("据") ? 6 : 0) + (EXAMPLE.matcher(all).find() ? 6 : 0));
        }

        int flawHits = 0, flawTries = 0;
        if (flawRows != null) {
            for (Map<String, Object> r : flawRows) {
                Object h = r.get("hit");
                if (h == null) continue;                  // 没作答的不算分母
                flawTries++;
                if (Boolean.TRUE.equals(h) || "true".equalsIgnoreCase(String.valueOf(h)) || "1".equals(String.valueOf(h))) {
                    flawHits++;
                }
            }
        }

        double base = matter * 0.25 + method * 0.30 + manner * 0.15 + adapt * 0.20 + evidence * 0.10;
        int flawBonus = Math.min(9, flawHits * 3);
        int total = Math.min(100, (int) Math.round(base) + collab + flawBonus);

        Map<String, Integer> flaws = detectFlaws(all, adapt, mine);

        List<Map<String, Object>> perTurn = new ArrayList<>();
        for (Map<String, Object> t : turns) {
            String seat = String.valueOf(t.get("seat"));
            if (!mySeats.contains(seat)) continue;
            String c = String.valueOf(t.get("content"));
            int len = c.replaceAll("\\\\s", "").length();
            boolean off = !OPPONENT.matcher(c).find() && !QUESTION.matcher(c).find();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("step", t.get("step"));
            row.put("seg", t.get("seg"));
            row.put("seat", seat);
            row.put("chars", len);
            row.put("verdict", len < 40 ? "太短" : off ? "脱靶" : "有交锋");
            row.put("note", len < 40 ? "这一轮只写了 " + len + " 字，判断和依据都没展开"
                    : off ? "没有点对方、也没有提问，属于自说自话"
                    : "点到对方并推进了论点");
            perTurn.add(row);
        }

        String problem;
        String improve;
        if (!fabricated.isEmpty()) {
            problem = "发言里出现了论据库里查不到的数字：" + String.join("、", fabricated) + "。辩论里编数字最伤可信度。";
            improve = "删掉具体数字，改成「请对方给出可核查口径」，或者直接引用论据卡里的制度事实。";
        } else if (chars < 60) {
            problem = "整场只说了 " + chars + " 字，等于没展开：既没有判断标准，也没有依据。";
            improve = "至少给出三段：① 我的判断 ② 判断标准 ③ 一条可核查依据。";
        } else if (adapt < 55) {
            problem = "你几乎没有回应对方的具体说法，全程在讲自己的观点——这在 4v4 里最容易被判「脱靶」。";
            improve = "下一轮开头先点名：「对方刚才说『……』，这个判断我不同意，因为它跳过了……」。";
        } else if (flaws.containsKey("未证明前提")) {
            problem = "出现了「显然 / 众所周知」这类未证明前提，对方一句「凭什么」就能拆掉。";
            improve = "把「显然」换成一个具体的、对方可以验证的依据或例子。";
        } else if (collab == 0) {
            problem = "你几乎没接队友的话——4v4 里这等于让队友白说。";
            improve = "开头先接一句：「顺着我方一辩刚才说的成本口径，我再补一层……」。";
        } else {
            problem = "论证结构成立，下一步补「预判对方最强反驳并先答」，这是区分新手和熟练的点。";
            improve = "在结尾加一句：「对方可能会说……，但这一点不成立，因为……」。";
        }

        return new Score(total, matter, method, manner, adapt, evidence, collab, collabNoteOf(collab),
                cited, fabricated, flawHits, flawTries, perTurn, flaws,
                cut(firstQuote, 60), problem, improve, okTurns, timeouts);
    }

    // ---------------- 各维度 ----------------

    private int measureMatter(String s, int chars) {
        int v = 45;
        if (JUDGE.matcher(s).find()) v += 15;          // 有明确判断
        if (STANDARD.matcher(s).find()) v += 12;       // 有标准
        if (chars >= 120) v += 8;                      // 有展开（不是靠长度堆分）
        if (chars > 900) v -= 5;                       // 太长反而扣：说不清
        return clamp(v);
    }

    private int measureMethod(String s, int chars) {
        int v = 42;
        var c = CAUSAL.matcher(s);
        int causal = 0; while (c.find()) causal++;
        if (causal >= 1) v += 10;
        if (causal >= 3) v += 8;
        if (CONCEDE.matcher(s).find()) v += 10;        // 会让步转折 = 有对抗意识
        if (HYPOTHESIS.matcher(s).find()) v += 8;      // 会假设推演
        if (chars < 80) v -= 8;
        return clamp(v);
    }

    private int measureManner(String s) {
        String[] sentences = s.split("[。！？!?]");
        int n = 0, longOnes = 0;
        for (String x : sentences) {
            String t = x.trim();
            if (t.isEmpty()) continue;
            n++;
            if (t.length() > 60) longOnes++;
        }
        int v = 58;
        if (n >= 3) v += 8;
        if (longOnes > 0) v -= longOnes * 4;           // 一口气说不完的句子，听感差
        var f = FILLER.matcher(s);
        int fillers = 0; while (f.find()) fillers++;
        v -= Math.min(10, fillers * 2);
        return clamp(v);
    }

    private int measureAdapt(String s, List<String> mine, List<Map<String, Object>> turns, Set<String> mySeats) {
        int v = 40;
        if (OPPONENT.matcher(s).find()) v += 18;       // 点到对方
        if (QUESTION.matcher(s).find()) v += 12;       // 用问句施压
        // 与对方发言有实质重叠 = 真的在回应
        String opp = lastOpponentText(turns, mySeats);
        if (!opp.isEmpty() && shares(s, opp, 6)) v += 15;
        if (mine.size() >= 2) v += 5;
        return clamp(v);
    }

    private int measureCollab(List<String> mine, List<Map<String, Object>> turns, Set<String> mySeats, String all) {
        String mate = lastMateText(turns, mySeats);
        if (mate.isEmpty()) return 0;
        if (shares(all, mate, 6)) return 3;
        if (Pattern.compile("(顺着|接着|接住|我方[一二三四]辩)").matcher(all).find()) return 2;
        return 0;
    }

    private String collabNoteOf(int collab) {
        return switch (collab) {
            case 3 -> "接住了队友的论点（复用了他说的内容）";
            case 2 -> "用衔接语接住了队友，但没复用他的具体论点";
            default -> "";
        };
    }

    // ---------------- 瑕疵检出 ----------------

    private Map<String, Integer> detectFlaws(String all, int adapt, List<String> mine) {
        Map<String, Integer> f = new LinkedHashMap<>();
        if (FLAW_UNPROVEN.matcher(all).find()) f.merge("未证明前提", 1, Integer::sum);
        if (FLAW_ABSOLUTE.matcher(all).find() && !EXAMPLE.matcher(all).find())
            f.merge("以偏概全", 1, Integer::sum);
        if (FLAW_AUTHORITY.matcher(all).find()) f.merge("诉诸权威", 1, Integer::sum);
        if (adapt < 55) f.merge("未回应对方", 1, Integer::sum);
        // 循环论证：同一句在两次发言里高度重复
        if (mine.size() >= 2) {
            String a = mine.get(mine.size() - 2), b = mine.get(mine.size() - 1);
            if (overlap(a, b) > 0.6) f.merge("同义反复", 1, Integer::sum);
        }
        return f;
    }

    // ---------------- 工具 ----------------

    private String lastOpponentText(List<Map<String, Object>> turns, Set<String> mySeats) {
        String side = mySeats.iterator().next().substring(0, 1);
        for (int i = turns.size() - 1; i >= 0; i--) {
            String s = String.valueOf(turns.get(i).get("seat"));
            if (s.startsWith(side)) continue;
            String c = String.valueOf(turns.get(i).get("content"));
            if (c != null && !c.isBlank() && !c.contains("超时")) return c;
        }
        return "";
    }

    private String lastMateText(List<Map<String, Object>> turns, Set<String> mySeats) {
        String side = mySeats.iterator().next().substring(0, 1);
        for (int i = turns.size() - 1; i >= 0; i--) {
            String s = String.valueOf(turns.get(i).get("seat"));
            if (!s.startsWith(side)) continue;
            if (mySeats.contains(s)) continue;
            String c = String.valueOf(turns.get(i).get("content"));
            if (c != null && !c.isBlank() && !c.contains("超时")) return c;
        }
        return "";
    }

    static boolean shares(String a, String b, int n) {
        String x = strip(a), y = strip(b);
        if (y.length() < n) return x.contains(y);
        for (int i = 0; i + n <= y.length(); i++) if (x.contains(y.substring(i, i + n))) return true;
        return false;
    }

    static double overlap(String a, String b) {
        String x = strip(a), y = strip(b);
        if (x.length() < 4 || y.length() < 4) return 0;
        Set<String> grams = new java.util.HashSet<>();
        for (int i = 0; i + 4 <= y.length(); i++) grams.add(y.substring(i, i + 4));
        int hit = 0, total = 0;
        for (int i = 0; i + 4 <= x.length(); i++) { total++; if (grams.contains(x.substring(i, i + 4))) hit++; }
        return total == 0 ? 0 : (double) hit / total;
    }

    private static String strip(String s) {
        return s == null ? "" : s.replaceAll("[\\s，。；：、！？「」（）“”\"']", "");
    }

    private static String cut(String s, int n) {
        if (s == null) return "";
        String t = s.replace("\n", " ").trim();
        return t.length() <= n ? t : t.substring(0, n) + "…";
    }

    private static int clamp(int v) { return Math.max(30, Math.min(95, v)); }
}
