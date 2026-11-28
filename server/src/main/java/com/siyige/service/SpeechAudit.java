package com.siyige.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 发言审核官：发出去之前先把「这句说了等于没说」拦下来。
 *
 * <p>为什么要有它：训练里最贵的浪费不是想不出来，而是**写了一句话就点发送**——
 * 半句话（「因为……然后」）、口号（「必须警惕」）、敷衍（「11」）、把上一轮原话再念一遍。
 * 这些东西在复盘里会直接变成低分，但用户在场上并不知道。
 *
 * <p>设计约束：
 * <ul>
 *   <li>**纯规则、不调模型**：接口要 &lt;50ms 返回，用户在打字框里就能看到提示；</li>
 *   <li>**确定性**：同一句永远同样的结论，便于前端做「改完再检查」；</li>
 *   <li>**只拦硬伤**：判断标准/论据质量交给评分，这里只管「这句能不能算一次发言」。</li>
 * </ul>
 */
public final class SpeechAudit {

    /** 一条问题：{@code code} 给前端做定位，{@code message} 说人话，{@code fix} 是可执行的一句话。 */
    public record Issue(String code, String message, String fix) {}

    /** 审核结果：{@code ok} 只有在 issues 为空时为 true。 */
    public record Verdict(boolean ok, List<Issue> issues, List<String> tips) {}

    /** 去空白后的最少字数。低于这个数不可能同时给出「判断 + 理由」。 */
    public static final int MIN_CHARS = 20;

    /** 这些词收尾 = 句子没说完（用户最常见的半句话）。 */
    private static final String[] DANGLING_TAIL = {
            "因为", "所以", "但是", "而且", "然后", "比如", "例如", "虽然",
            "如果", "当", "并且", "以及", "或者", "就是"
    };

    /** 有这些标记才算「给了判断或论证」，否则只是感想。 */
    private static final Pattern CLAIM = Pattern.compile(
            "我方|我认为|应当|不应|必须|不能|因为|所以|因此|首先|第一|标准|口径");

    /** 成对的引号/括号：不闭合说明话被截断了。 */
    private static final String[][] PAIRS = {
            {"（", "）"}, {"(", ")"}, {"「", "」"}, {"“", "”"}, {"《", "》"}, {"【", "】"}
    };

    /**
     * 审核一句（同一轮可以反复调用）。
     *
     * @param content   待发内容
     * @param seg       当前环节（「质询」时豁免「整段只有问句」——质询本来就该提问）
     * @param myPrev    本场**我自己**已经发过的内容（用于查重）
     * @param utterance 敷衍判定（复用对局那套口径；传 null 时退化成极短判定）
     */
    public Verdict check(String content, String seg, List<String> myPrev, UtteranceCheck utterance) {
        String raw = content == null ? "" : content;
        String s = raw.trim();
        String compact = raw.replaceAll("\\s", "");

        List<Issue> issues = new ArrayList<>();

        // ① 太短：去空白后 < 20 字，说不完「判断 + 理由」
        if (compact.length() < MIN_CHARS) {
            issues.add(new Issue("TOO_SHORT",
                    "这一句只有 " + compact.length() + " 字，来不及说清判断和理由。",
                    "补到 20 字以上：先给判断，再给一条理由。"));
        }

        // ② 半句话 / 没闭合
        if (danglingTail(s)) {
            issues.add(new Issue("INCOMPLETE",
                    "这句话以连接词收尾，读起来是半句。",
                    "把「" + danglingWord(s) + "」后面补完，或者删掉这个连接词直接下结论。"));
        } else if (!balanced(s)) {
            issues.add(new Issue("INCOMPLETE",
                    "引号或括号没有闭合，话像是被截断了。",
                    "检查「」（）《》是不是成对出现。"));
        }

        // ③ 没有判断也没有论证：只是感想
        if (!CLAIM.matcher(s).find()) {
            issues.add(new Issue("NO_CLAIM",
                    "这段里没有判断（我方认为/应当/不应），也没有论证（因为/所以/因此）。",
                    "开头先给一句「我方认为……」，再用「因为……」补一条理由。"));
        }

        // ④ 敷衍（「11」「嗯」「对」）
        boolean vacuous = utterance != null ? utterance.vacuous(s) : compact.length() <= 2;
        if (vacuous && !s.isEmpty()) {
            issues.add(new Issue("VACUOUS",
                    "这句没有可以回应的实质内容。",
                    "换成一句真正的主张：要么回答问题，要么点出对方哪里不成立。"));
        }

        // ⑤ 把上一轮的话再说一遍
        if (repeats(s, myPrev)) {
            issues.add(new Issue("REPEAT",
                    "这句和你本场已经说过的话重复了。",
                    "换成推进：这一轮要新加一个理由，或者直接回应对方最新那句。"));
        }

        // ⑥ 整段只有问句、没有自己的判断（质询环节豁免）
        boolean inQuery = seg != null && seg.contains("质询");
        if (!inQuery && onlyQuestions(s)) {
            issues.add(new Issue("ONLY_QUESTION",
                    "整段都在提问，没有给出你自己的判断。",
                    "先自答一句「我方认为……」，再把问题抛给对方。"));
        }

        return new Verdict(issues.isEmpty(), List.copyOf(issues), tips(issues));
    }

    // ---------- 规则实现 ----------

    /** 去掉句末标点后，是不是停在一个连接词上。 */
    private static boolean danglingTail(String s) {
        return !danglingWord(s).isEmpty();
    }

    private static String danglingWord(String s) {
        String tail = s.replaceAll("[\\s。！？!?，,、；;：:…\"'”』）)]+$", "");
        for (String w : DANGLING_TAIL) {
            if (tail.endsWith(w)) return w;
        }
        return "";
    }

    /** 引号/括号是否成对。 */
    private static boolean balanced(String s) {
        for (String[] p : PAIRS) {
            if (count(s, p[0]) != count(s, p[1])) return false;
        }
        return count(s, "\"") % 2 == 0;
    }

    private static int count(String s, String sub) {
        int n = 0, i = 0;
        while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length(); }
        return n;
    }

    /** 有没有「原样搬上一轮」的句子（8 字窗口命中即算）。 */
    private static boolean repeats(String s, List<String> myPrev) {
        String cur = normalize(s);
        if (cur.length() < 8 || myPrev == null || myPrev.isEmpty()) return false;
        for (String prev : myPrev) {
            String p = normalize(prev);
            if (p.length() < 8) continue;
            if (p.contains(cur)) return true;
            for (int i = 0; i + 8 <= cur.length(); i++) {
                if (p.contains(cur.substring(i, i + 8))) return true;
            }
        }
        return false;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.replaceAll("[\\s\\p{Punct}，。！？、；：\"'（）《》【】…—~「」]",
                "");
    }

    /** 整段只有问句：切出来的每个句子都以问号收尾，且没有陈述句。 */
    private static boolean onlyQuestions(String s) {
        if (s.isEmpty()) return false;
        if (s.contains("。") || s.contains("！") || s.contains("!")) return false;
        String[] parts = s.split("[？?]");
        boolean sawQuestion = false;
        for (String p : parts) {
            if (p.trim().isEmpty()) continue;
            sawQuestion = true;
            // 句内有问号之外的内容也要算，但只要没有陈述句就不算「给了判断」
            if (!p.trim().isEmpty() && CLAIM.matcher(p).find()) return false;
        }
        return sawQuestion && s.matches(".*[？?]\\s*$");
    }

    /** 给面板用的轻量建议（不重复 issues 的修复语）。 */
    private static List<String> tips(List<Issue> issues) {
        List<String> out = new ArrayList<>();
        if (issues.isEmpty()) {
            out.add("这句可以直接发。发之前再扫一眼：有没有一个对方必须回应的点？");
            return out;
        }
        boolean shortOrVacuous = issues.stream()
                .anyMatch(i -> "TOO_SHORT".equals(i.code()) || "VACUOUS".equals(i.code()));
        if (shortOrVacuous) out.add("结构模板：我方认为……，因为……，所以……。");
        if (issues.stream().anyMatch(i -> "NO_CLAIM".equals(i.code())))
            out.add("先结论后理由：第一句就把判断说出来，别让裁判猜。");
        if (issues.stream().anyMatch(i -> "REPEAT".equals(i.code())))
            out.add("重复不加分：这一轮只补一个新理由，或者回应对方最新那句。");
        if (out.isEmpty()) out.add("按 fix 改一句就能发。");
        return out;
    }
}
