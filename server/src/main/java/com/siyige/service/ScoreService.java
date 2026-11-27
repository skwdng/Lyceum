package com.siyige.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 评分（v3）。
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
 * v3 只加「可解释」这一层，**不动任何分数**：同样的输入，v2 和 v3 的 total 与五维分完全一样。
 * 新增的 {@link Rubric} 回答三个问题——这个分是怎么来的（basis 由下面 measure* 的真实命中生成，
 * 不是事后编的）、证据是哪句原话（evidence 从选手 turn 原文里截 30–60 字）、下一步先改哪一维
 * （focus = 权重×失分最大的一维 + 一句可执行动作）。
 *
 * 另外：协同分（接队友）与「瑕疵检出」都进复盘与画像，瑕疵不再是写死的假数据。
 */
@Service
public class ScoreService {

    /** 评分口径版本：维度含义、权重、basis 文案口径一变就升版，前端按版本号决定怎么渲染。 */
    public static final String RUBRIC_VERSION = "v3-2026-11";

    /** 五维口径中的一维：key 给前端做映射，weight 是百分比（五维合计 100）。 */
    public record RubricDim(String key, String name, int weight, int score, String basis, String evidence) {}

    /** 优先改进项：权重×失分最大的一维，带一句可执行动作。 */
    public record RubricFocus(String key, String name, int weight, int score, String action, String reason) {}

    /** 评分口径详情：分数怎么来的、证据在哪、先改哪一维。 */
    public record Rubric(String version, List<RubricDim> dims, RubricFocus focus) {}

    public record Score(int total, int matter, int method, int manner, int adapt, int evidence,
                        int collab, String collabNote,
                        int cited, List<String> fabricated,
                        int flawHits, int flawTries,
                        List<Map<String, Object>> perTurn,
                        Map<String, Integer> flaws,
                        String quote, String problem, String improve, int turns, int timeout,
                        Rubric rubric) {

        /**
         * 旧签名（不带 rubric）。
         *
         * <p>留这条是为了「既有字段与所有调用点不能破」：老的 {@code new Score(...)} 照样编译，
         * rubric 为 null。生产路径全部走 20 参的规范构造器，所以接口里 rubric 永远有值。
         */
        public Score(int total, int matter, int method, int manner, int adapt, int evidence,
                     int collab, String collabNote,
                     int cited, List<String> fabricated,
                     int flawHits, int flawTries,
                     List<Map<String, Object>> perTurn,
                     Map<String, Integer> flaws,
                     String quote, String problem, String improve, int turns, int timeout) {
            this(total, matter, method, manner, adapt, evidence, collab, collabNote,
                    cited, fabricated, flawHits, flawTries, perTurn, flaws,
                    quote, problem, improve, turns, timeout, null);
        }
    }

    // 结构标记
    private static final Pattern JUDGE = Pattern.compile("(我方认为|我方主张|我方判断|判断是|结论是|应当|不应|必须|不能)");
    private static final Pattern STANDARD = Pattern.compile("(标准|三条|两条|首先|第一|前提|口径)");
    private static final Pattern CAUSAL = Pattern.compile("(因为|所以|因此|由于|导致|从而|既然)");
    private static final Pattern CONCEDE = Pattern.compile("(虽然|但是|然而|即便|退一步|就算)");
    private static final Pattern HYPOTHESIS = Pattern.compile("(如果|假如|倘若|否则|不然)");
    private static final Pattern OPPONENT = Pattern.compile("(对方|你方|反方|正方)");
    private static final Pattern QUESTION = Pattern.compile("[？?]|(请问|我请教|我想问|请你回答)");
    private static final Pattern FILLER = Pattern.compile("(然后|那个|就是说|其实吧|嗯|呃)");

    // 瑕疵
    private static final Pattern FLAW_UNPROVEN = Pattern.compile("(显然|众所周知|毋庸置疑|不言而喻|不用多说)");
    private static final Pattern FLAW_ABSOLUTE = Pattern.compile("(所有|全部|一律|从来没有|绝对)");
    private static final Pattern FLAW_AUTHORITY = Pattern.compile("(专家说|权威|大家都|人人都)");
    private static final Pattern EXAMPLE = Pattern.compile("(例如|比如|举个例子|以.*为例|案例)");

    /** 口号腔：只有态度和形容词，没有可核查内容。 */
    private static final Pattern SLOGAN = Pattern.compile("(落后的|很落后|太落后|内卷|趋势|常识|显而易见|不需要讨论|不需要论证|必须警惕|大家都知道|谁反对|就是害人|就是资本|本身就不成立|怎么可能|本身就是问题|谁说不是|没什么好讨论|不用讨论|明摆着|天经地义|必须管|当然重要|革命的本钱|电子毒品|世风日下)");

    /** 精确化表达：判准 / 口径 / 可核查 / 复核 / 指标 —— 这些是"真辩论"的语言特征。 */
    private static final Pattern PRECISION = Pattern.compile("(判准|口径|可核查|复核|指标|基线|门槛|可预期)");

    /** 证据引用：引证词 / 例证 / 书名号依据 / 具体数字。只用于挑「最能代表论据维度的原话」。 */
    private static final Pattern CITE_WORDS = Pattern.compile("(据|例如|比如|举个例子|案例|《[^》]{2,20}》|[0-9]+(%|个百分点|年|倍|项|条))");

    // ---- 挑证据原话时按维度看的关键词（只影响「选哪一句」，不影响分数）----
    private static final Pattern KEY_MATTER = union(JUDGE, STANDARD, PRECISION);
    private static final Pattern KEY_METHOD = union(CAUSAL, CONCEDE, HYPOTHESIS);
    private static final Pattern KEY_ADAPT = union(OPPONENT, QUESTION);

    /** 五维口径定义：顺序 = 复盘页展示顺序。 */
    private static final String[] DIM_KEYS = {"matter", "method", "manner", "adapt", "evidence"};
    private static final String[] DIM_NAMES = {"立论", "论证", "表达", "应变", "论据"};
    private static final int[] DIM_WEIGHTS = {25, 30, 15, 20, 10};

    private final EvidenceService evidenceService;

    public ScoreService(EvidenceService evidenceService) { this.evidenceService = evidenceService; }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats) {
        return score(turns, mySeats, null);
    }

    /**
     * 按席位分别评分。
     *
     * <p>原来把所有「我的席位」的发言拼成一段一起打分，占两个席位时分数会被混在一起，
     * 看不出「二辩这个位置我打得怎么样」。这里每个席位单独跑一遍规则，再汇总。
     *
     * @return 席位 → 该席位的分数（顺序按 mySeats 遍历到的先后）
     */
    public java.util.LinkedHashMap<String, Score> scorePerSeat(List<Map<String, Object>> turns,
                                                               Set<String> mySeats, String topicId,
                                                               List<Map<String, Object>> flawRows) {
        java.util.LinkedHashMap<String, Score> out = new java.util.LinkedHashMap<>();
        for (String seat : mySeats) {
            boolean hasSpeech = false;
            for (Map<String, Object> t : turns) {
                if (seat.equals(String.valueOf(t.get("seat")))
                        && !"TIMEOUT".equals(String.valueOf(t.get("status")))
                        && !"EMPTY".equals(String.valueOf(t.get("status")))) { hasSpeech = true; break; }
            }
            if (!hasSpeech) continue;
            out.put(seat, score(turns, java.util.Set.of(seat), topicId, flawRows));
        }
        return out;
    }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats, String topicId) {
        return score(turns, mySeats, topicId, List.of());
    }

    public Score score(List<Map<String, Object>> turns, Set<String> mySeats, String topicId,
                       List<Map<String, Object>> flawRows) {
        List<String> mine = new ArrayList<>();
        int timeouts = 0;
        int empties = 0;
        String firstQuote = "";

        for (Map<String, Object> t : turns) {
            String seat = String.valueOf(t.get("seat"));
            if (!mySeats.contains(seat)) continue;
            String st = String.valueOf(t.get("status"));
            if ("TIMEOUT".equals(st)) { timeouts++; continue; }
            if ("EMPTY".equals(st)) { empties++; continue; }   // 敷衍发言不算内容，但也不算超时
            String c = String.valueOf(t.get("content"));
            if (firstQuote.isEmpty()) firstQuote = c;
            mine.add(c);
        }

        String all = String.join("\n", mine);
        int okTurns = mine.size();

        // 先一次性把规则的**真实命中**数出来：打分和 basis 共用这一份，
        // 这样复盘里写的「命中判断句 2 处」不可能跟实际打分对不上。
        Facts f = facts(all, mine, turns, mySeats);

        int matter = measureMatter(f);
        int method = measureMethod(f);
        int manner = measureManner(f);
        int adapt = measureAdapt(f);
        int evidence = 40;
        int collab = measureCollab(f);

        int cited = 0;
        List<String> fabricated = new ArrayList<>();
        // 论据维度的三种状态，直接决定 basis 怎么写，也保证分数与 v2 完全一致：
        //   0 = 没绑辩题/没有题库 → 按引证词与例证估分
        //   1 = 有论据卡 → 命中加分、编造倒扣
        //   2 = 有辩题 id 但题库是空的 → 维持基准 40（v2 就是这个口径，不能悄悄改分）
        int cardState = 0;
        if (topicId != null && evidenceService != null) {
            List<Map<String, Object>> cards = evidenceService.cards(topicId);
            if (cards != null && !cards.isEmpty()) {
                cardState = 1;
                for (String c : mine) {
                    EvidenceService.Audit a = evidenceService.audit(c, cards);
                    cited += a.cited();
                    for (String fj : a.fabricated()) if (!fabricated.contains(fj)) fabricated.add(fj);
                }
                evidence = clamp(40 + cited * 10);
                evidence = Math.max(20, evidence - 8 * fabricated.size());
            } else {
                cardState = 2;
            }
        } else {
            evidence = clamp(45 + (f.hasJu() ? 6 : 0) + (f.example() ? 6 : 0));
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
        // 全场没有一句有效内容（全是敷衍/超时）→ 不该拿"基准分"，直接 0
        if (okTurns == 0) total = 0;

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
        } else if (f.chars() < 60) {
            problem = "整场只说了 " + f.chars() + " 字，等于没展开：既没有判断标准，也没有依据。";
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

        Rubric rubric = rubricOf(okTurns, timeouts, empties,
                new int[]{matter, method, manner, adapt, evidence},
                f, cardState, cited, fabricated.size(), mine);

        return new Score(total, matter, method, manner, adapt, evidence, collab, collabNoteOf(collab),
                cited, fabricated, flawHits, flawTries, perTurn, flaws,
                cut(firstQuote, 60), problem, improve, okTurns, timeouts, rubric);
    }

    // ---------------- 规则命中（打分与 basis 的唯一来源） ----------------

    /**
     * 一次把规则的真实命中数清楚。
     *
     * <p>为什么单独抽出来：v2 里 measureMatter/measureMethod/… 各自 find() 一遍，
     * 复盘要写「命中几处」就得再数一遍，两边一旦不一致就是**编造证据**。
     * 这里只数一次，打分和 basis 都读同一份计数。
     */
    private record Facts(int chars, int mineCount,
                         int judgeHits, int standardHits, int precisionHits, int causalHits,
                         int concedeHits, int hypothesisHits, int opponentHits, int questionHits,
                         int fillerHits, int sentences, int longSentences,
                         boolean judgeWithReason, boolean hasJu, boolean example, boolean slogan,
                         boolean sharesOpponent, boolean matePresent, boolean sharesMate,
                         boolean mateTransition) {}

    private Facts facts(String all, List<String> mine, List<Map<String, Object>> turns, Set<String> mySeats) {
        int chars = all.replaceAll("\\s", "").length();
        boolean example = EXAMPLE.matcher(all).find();
        boolean hasJu = all.contains("据");
        int judge = count(JUDGE, all);
        int precision = count(PRECISION, all);
        boolean hasReason = CAUSAL.matcher(all).find() || example || PRECISION.matcher(all).find() || hasJu;

        int sentences = 0, longOnes = 0;
        for (String x : all.split("[。！？!?]")) {
            String t = x.trim();
            if (t.isEmpty()) continue;
            sentences++;
            if (t.length() > 60) longOnes++;
        }

        String opp = lastOpponentText(turns, mySeats);
        String mate = lastMateText(turns, mySeats);

        return new Facts(chars, mine.size(),
                judge, count(STANDARD, all), precision, count(CAUSAL, all),
                count(CONCEDE, all), count(HYPOTHESIS, all), count(OPPONENT, all), count(QUESTION, all),
                count(FILLER, all), sentences, longOnes,
                judge > 0 && hasReason, hasJu, example,
                SLOGAN.matcher(all).find() && !example && !hasJu,
                !opp.isEmpty() && shares(all, opp, 6),
                !mate.isEmpty(), !mate.isEmpty() && shares(all, mate, 6),
                Pattern.compile("(顺着|接着|接住|我方[一二三四]辩)").matcher(all).find());
    }

    // ---------------- 各维度 ----------------

    private int measureMatter(Facts f) {
        int v = 45;
        if (f.judgeHits() > 0) v += 15;                // 有明确判断
        if (f.standardHits() > 0) v += 12;             // 有标准
        if (f.precisionHits() > 0) v += 8;             // 会把话说到可核查的层面
        // 「判断 + 理由」同时出现才算立住了立场；只有判断词（必须/应当）不给额外分
        if (f.judgeWithReason()) v += 8;
        if (f.chars() >= 120) v += 8;                  // 有展开（不是靠长度堆分）
        if (f.chars() > 900) v -= 5;                   // 太长反而扣：说不清
        // 口号腔：态度很足但没有任何可核查内容 → 显著扣分
        if (f.slogan()) v -= 20;
        return clamp(v);
    }

    private int measureMethod(Facts f) {
        int v = 42;
        if (f.causalHits() >= 1) v += 10;
        if (f.causalHits() >= 3) v += 8;
        if (f.concedeHits() > 0) v += 10;              // 会让步转折 = 有对抗意识
        if (f.hypothesisHits() > 0) v += 8;            // 会假设推演
        if (f.precisionHits() > 0) v += 6;             // 有口径意识
        if (f.chars() < 80) v -= 8;
        if (f.slogan() && f.causalHits() == 0) v -= 14;   // 光喊口号、没有因果链
        return clamp(v);
    }

    private int measureManner(Facts f) {
        int v = 58;
        if (f.sentences() >= 3) v += 8;
        if (f.longSentences() > 0) v -= f.longSentences() * 4;   // 一口气说不完的句子，听感差
        v -= Math.min(10, f.fillerHits() * 2);
        return clamp(v);
    }

    private int measureAdapt(Facts f) {
        int v = 40;
        if (f.opponentHits() > 0) v += 18;            // 点到对方
        if (f.questionHits() > 0) v += 12;            // 用问句施压
        if (f.sharesOpponent()) v += 15;              // 与对方发言有实质重叠 = 真的在回应
        if (f.mineCount() >= 2) v += 5;
        return clamp(v);
    }

    private int measureCollab(Facts f) {
        if (!f.matePresent()) return 0;
        if (f.sharesMate()) return 3;
        if (f.mateTransition()) return 2;
        return 0;
    }

    private String collabNoteOf(int collab) {
        return switch (collab) {
            case 3 -> "接住了队友的论点（复用了他说的内容）";
            case 2 -> "用衔接语接住了队友，但没复用他的具体论点";
            default -> "";
        };
    }

    // ---------------- 评分口径（rubric） ----------------

    /**
     * 组装 rubric。
     *
     * <p>全场没有一句有效发言时（total 强制 0），rubric **照样给**：五维 score 全 0，
     * focus 指向权重最高的那一维（失分一样多，权重大的先补收益最大），并给一条"先按时开口"的动作。
     */
    private Rubric rubricOf(int okTurns, int timeouts, int empties, int[] scores,
                            Facts f, int cardState, int cited, int fabricatedCount,
                            List<String> mine) {
        boolean empty = okTurns == 0;
        List<RubricDim> dims = new ArrayList<>();
        for (int i = 0; i < DIM_KEYS.length; i++) {
            int sc = empty ? 0 : scores[i];
            String basis = empty
                    ? "本场没有有效发言（超时 " + timeouts + " 次 + 敷衍 " + empties + " 次不计内容），该维度没有可核查的原文"
                    : basisOf(i, f, cardState, cited, fabricatedCount);
            String ev = empty ? "" : evidenceOf(keyPatOf(i), mine);
            dims.add(new RubricDim(DIM_KEYS[i], DIM_NAMES[i], DIM_WEIGHTS[i], sc, basis, ev));
        }

        RubricDim worst = dims.get(0);
        double worstLoss = -1;
        for (RubricDim d : dims) {
            // 权重×失分：25%·30 分的失分，比 10%·50 分的失分更值得先改
            double loss = d.weight() * (100.0 - d.score());
            if (loss > worstLoss) { worstLoss = loss; worst = d; }
        }

        String reason = empty
                ? "全场有效发言 0 句（超时 " + timeouts + " 次），五维均为 0；" + worst.name()
                  + "权重 " + worst.weight() + "% 居首，先补它收益最大。"
                : "该维度权重 " + worst.weight() + "%、本场 " + worst.score() + " 分，加权失分 "
                  + String.format(java.util.Locale.ROOT, "%.1f", worstLoss / 100.0)
                  + " 分（= " + worst.weight() + "% × 失分 " + (100 - worst.score()) + "），五维中最大。";

        RubricFocus focus = new RubricFocus(worst.key(), worst.name(), worst.weight(), worst.score(),
                actionOf(worst.key(), empty, f, cardState, cited, fabricatedCount), reason);

        return new Rubric(RUBRIC_VERSION, List.copyOf(dims), focus);
    }

    /** 每个维度的 basis：全部由 facts 里的真实命中拼出来，没有一句是写死的。 */
    private String basisOf(int idx, Facts f, int cardState, int cited, int fabricatedCount) {
        switch (idx) {
            case 0:
                return "命中判断句 " + f.judgeHits() + " 处 + 判断标准 " + f.standardHits() + " 处 + 可核查口径 "
                        + f.precisionHits() + " 处"
                        + (f.judgeWithReason() ? " + 判断与理由同现" : (f.judgeHits() > 0 ? " + 判断缺理由" : ""))
                        + (f.chars() >= 120 ? " + 展开 " + f.chars() + " 字" : " + 仅 " + f.chars() + " 字未展开")
                        + (f.chars() > 900 ? " + 篇幅过长扣分" : "")
                        + (f.slogan() ? " + 口号腔（无可核查内容）扣分" : "");
            case 1:
                return "命中因果链 " + f.causalHits() + " 处 + 让步转折 " + f.concedeHits() + " 处 + 假设推演 "
                        + f.hypothesisHits() + " 处 + 口径意识 " + f.precisionHits() + " 处"
                        + (f.chars() < 80 ? " + 篇幅不足 80 字扣分" : "")
                        + (f.slogan() && f.causalHits() == 0 ? " + 口号无因果扣分" : "");
            case 2:
                return "共 " + f.sentences() + " 句 + 超长句（>60 字）" + f.longSentences() + " 句 + 口癖 "
                        + f.fillerHits() + " 处";
            case 3:
                return "点名对方 " + f.opponentHits() + " 处 + 问句施压 " + f.questionHits() + " 处 + "
                        + (f.sharesOpponent() ? "与对方原话重叠 ≥6 字" : "未与对方原话重叠")
                        + (f.mineCount() >= 2 ? " + 多轮发言" : " + 仅一轮发言");
            default:
                if (cardState == 1) {
                    return "论据卡命中 " + cited + " 条 + "
                            + (fabricatedCount > 0 ? "编造数字 " + fabricatedCount + " 处（倒扣）" : "无编造数字");
                }
                if (cardState == 2) {
                    return "辩题有 id 但论据卡 0 张，按基准 40 分记，无法核验引用";
                }
                return "未绑定论据库（无辩题卡），按引证词「据」" + (f.hasJu() ? "有" : "无")
                        + " + 例证 " + (f.example() ? "有" : "无") + " 估分";
        }
    }

    /**
     * 从选手原话里截 30–60 字，取最能代表该维度的一句。
     *
     * <p>挑句规则（按优先级）：
     * <ol>
     *   <li>该维度的**主标记**命中多的先（立论看判断句、论证看因果词、应变看点名/问句、论据看引证）；</li>
     *   <li>其次看维度相关词命中总数；</li>
     *   <li>再其次优先「一句话就能装进 60 字窗口」的整句——跨句、跨轮的半句读起来像断章取义；</li>
     *   <li>最后取靠前的那句。</li>
     * </ol>
     * 返回的一定是原文的**连续片段**（只把换行折成空格），不做任何改写，复盘里可以直接引；
     * 窗口不会跨过轮次边界，避免把两轮的话拼成一句。
     */
    private String evidenceOf(KeyPat kp, List<String> mine) {
        if (mine == null || mine.isEmpty()) return "";
        List<String> turns = new ArrayList<>();
        for (String m : mine) {
            String t = m == null ? "" : m.replace('\u3000', ' ').replace('\n', ' ').trim();
            if (!t.isEmpty()) turns.add(t);
        }
        if (turns.isEmpty()) return "";
        String text = String.join(" ", turns);

        int bestStart = -1, bestEnd = -1, bestTurnStart = 0, bestTurnEnd = 0;
        int bestMain = -1, bestHits = -1, bestFit = Integer.MIN_VALUE;

        int cursor = 0;
        for (String turn : turns) {
            int turnStart = cursor;
            int turnEnd = cursor + turn.length();
            for (int[] sp : sentenceSpans(turn)) {
                int s = turnStart + sp[0];
                int e = turnStart + sp[1];
                String seg = text.substring(s, e).trim();
                if (seg.length() < 6) continue;                  // 碎片不当证据
                int main = kp.primary() == null ? 0 : count(kp.primary(), seg);
                int hits = kp.any() == null ? 0 : count(kp.any(), seg);
                // 整句能装进 60 字窗口最好；超过窗口的句子扣分（引用会被截断）
                int fit = seg.length() <= 60 ? seg.length() : 120 - seg.length();
                boolean better = main > bestMain
                        || (main == bestMain && hits > bestHits)
                        || (main == bestMain && hits == bestHits && fit > bestFit);
                if (better) {
                    bestMain = main; bestHits = hits; bestFit = fit;
                    bestStart = s; bestEnd = e;
                    bestTurnStart = turnStart; bestTurnEnd = turnEnd;
                }
            }
            cursor = turnEnd + 1;                                // join 用的是单个空格
        }
        if (bestStart < 0) return cut(text, 60);

        int start = bestStart;
        while (start < text.length() && Character.isWhitespace(text.charAt(start))) start++;
        int end = Math.min(bestEnd, start + 60);
        if (end - start < 30) {
            // 整句太短：先在本轮内往后补，再往前补，凑到 30 字以上
            end = Math.min(bestTurnEnd, start + 60);
            if (end - start < 30) start = Math.max(bestTurnStart, end - 60);
        }
        String out = text.substring(start, end).trim();
        return out.length() < 6 ? cut(text, 60) : out;
    }

    /** 句子切分：句末标点 + 分号 + 换行。 */
    private static List<int[]> sentenceSpans(String s) {
        List<int[]> out = new ArrayList<>();
        int from = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '\u3002' || ch == '\uff01' || ch == '\uff1f' || ch == '!' || ch == '?'
                    || ch == '\uff1b' || ch == ';' || ch == '\n') {
                out.add(new int[]{from, i + 1});
                from = i + 1;
            }
        }
        if (from < s.length()) out.add(new int[]{from, s.length()});
        return out;
    }

    /** 维度 → (主标记, 相关词)。表达维度两个都为空：按句长挑。 */
    private record KeyPat(Pattern primary, Pattern any) {}

    private static KeyPat keyPatOf(int idx) {
        return switch (idx) {
            case 0 -> new KeyPat(JUDGE, KEY_MATTER);
            case 1 -> new KeyPat(CAUSAL, KEY_METHOD);
            case 2 -> new KeyPat(null, null);
            case 3 -> new KeyPat(OPPONENT, KEY_ADAPT);
            default -> new KeyPat(CITE_WORDS, CITE_WORDS);
        };
    }

    /** focus 的动作：一句能照着做的话，按本场真实缺什么来给。 */
    private String actionOf(String key, boolean empty, Facts f, int cardState, int cited, int fabricatedCount) {
        if (empty) {
            return switch (key) {
                case "matter" -> "下一场开场第一句就给判断和标准：「我方判断：应当 X；标准是 A 和 B」，先按时开口。";
                case "method" -> "每轮至少写一句因果链：「因为 A，所以 B，因此 C」，避免再超时。";
                case "manner" -> "按时开口，一句一句说完：每句 40 字以内，去掉口癖。";
                case "adapt" -> "先完成发言，再在开头点对方一句：「对方说的 X 我不认」。";
                default -> "至少引用一张论据卡的制度事实，别空场。";
            };
        }
        return switch (key) {
            case "matter" -> f.judgeHits() == 0
                    ? "下一场开场先把立场写成一句话：「我方判断：应当 X，判断标准是 Y」。"
                    : f.standardHits() == 0
                    ? "在判断后面补一句判断标准：「我的标准有两条：一是……二是……」。"
                    : !f.judgeWithReason()
                    ? "给判断补一条可核查理由：「因为……，据……」，别让立场悬空。"
                    : "每轮开头用一句话重述判断，让裁判随时能记住你在证什么。";
            case "method" -> f.causalHits() == 0
                    ? "至少写出一条因果链：「因为 A，所以 B，因此 C，否则 D」。"
                    : f.concedeHits() == 0
                    ? "加一句让步转折：「对方说的 X 我认，但 Y 上不成立，因为……」。"
                    : f.hypothesisHits() == 0
                    ? "补一层假设推演：「如果按对方口径，那么……，这显然不成立」。"
                    : "把论证收束成「前提→结论」两句，删掉中间重复的铺垫。";
            case "manner" -> f.fillerHits() > 0
                    ? "删掉口癖（然后 / 那个 / 就是说），每句压到 40 字以内。"
                    : f.longSentences() > 0
                    ? "把超过 60 字的长句拆成两句，一口气说完一条。"
                    : "保持现在的句长，每轮收尾压成一句短句，方便裁判记录。";
            case "adapt" -> f.opponentHits() == 0
                    ? "下一轮开头点名对方：「对方刚才说……，我不同意，因为……」。"
                    : f.questionHits() == 0
                    ? "结尾加一句问句施压：「请对方回答：你说的标准由谁复核？」。"
                    : !f.sharesOpponent()
                    ? "先复述对方原话的关键词再反驳，让「回应」看得见。"
                    : "把回应压到最前面：第一句先答对方最强的那一点。";
            default -> cardState == 1
                    ? (fabricatedCount > 0
                        ? "删掉查不到的数字，改成「请对方给出可核查口径」，或直接引论据卡。"
                        : cited == 0
                        ? "每轮至少引用一张论据卡的制度事实或数据，别只讲道理。"
                        : "引用论据卡时带上出处与年份，方便裁判核验。")
                    : "先绑定辩题论据卡，再按卡里的制度事实上引证，别用记忆里的数字。";
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

    private static int count(Pattern p, String s) {
        if (s == null || s.isEmpty()) return 0;
        var m = p.matcher(s);
        int n = 0;
        while (m.find()) n++;
        return n;
    }

    /** 把几个 pattern 并成一个（只用于挑证据原话，不参与打分）。 */
    private static Pattern union(Pattern... ps) {
        StringBuilder sb = new StringBuilder();
        for (Pattern p : ps) {
            if (sb.length() > 0) sb.append('|');
            sb.append("(?:").append(p.pattern()).append(')');
        }
        return Pattern.compile(sb.toString());
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
