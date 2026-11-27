package com.siyige.ai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 引用真实性护栏（静态工具）。
 *
 * <p>要治的病是模型的「虚空引用」：
 * <pre>
 * 对方刚才说「现行学分认定完全刚性、无法替代」，这一点我不同意：……
 * </pre>
 * 而对方整场根本没说过这半句。选手引用错原话在正式赛里是硬伤（评委可以拿记录核对），
 * 用户看到也会觉得「这个 AI 在编」。所以输出后必须逐条核对引文：**引号里的东西要么能在历史发言里找到，要么就不许带引号**。
 *
 * <p>判定规则：
 * <ol>
 *   <li><b>抽取</b>：在 AI 文本里找成对引号 {@code 「」『』“”""''} 之间的片段（嵌套按最外层处理）；</li>
 *   <li><b>归一化</b>：去掉空白、标点、符号（{@code \p{P}\p{S}\p{Zs}} 与全角空格），只留文字与数字，避免
 *       「，」「、」和换行造成的假不命中；</li>
 *   <li><b>短引用不判</b>：归一化后不足 {@value #MIN_QUOTE_CHARS} 字（如「成本过高」「11」）不参与核对 —— 太短
 *       没法区分是引用还是普通词组，硬判会误伤；</li>
 *   <li><b>命中</b>：归一片段是历史原文的子串，或与历史某段窗口的二元组 Dice 相似度 ≥ {@value #MATCH_THRESHOLD}
 *       （默认 0.8，容忍模型改一两个字、补一个标点）；</li>
 *   <li><b>未命中 = fabricated</b>：把整段引号（含引号与前面的「对方刚才说」这类归属词）改写成不带引号的说法，
 *       默认 {@code 你刚才那个说法}；归属是我方/队友时用 {@code 我方刚才那个说法}；被「把/将/用…」支配或
 *       无法判断归属时用中性的 {@code 那个说法}；</li>
 *   <li><b>硬指纹</b>：模糊命中还不够——引文里出现的数字/百分比、否定词（不/未/无/没有/禁止）必须在原文里也出现，
 *       否则判 {@link Status#MISMATCH}（「必须有」被写成「必须没有」、21% 被写成 37% 都属于这一类），
 *       按编造处理并改写；</li>
 *   <li><b>出处豁免只豁免出处本身</b>：带书名号时只放行书名号内部，书名号外面的话（如「显示下降 37%」）
 *       仍是主张，要照常核；紧邻「据/根据/依据/出自」且不含数据口径（%、百分点、倍）的，视为出处名放行。
 *       证据卡是外部材料，本来就不在历史发言里，所以出处名不该被判成编造。</li>
 * </ol>
 *
 * <p>调用方拿到 {@link Result#fabricated()} 后可以计数上报/复盘标注；{@link Result#text()} 永远是可以直接落库的正文。
 */
public final class QuoteGuard {

    /** 少于这个字数（归一化后）的引文不参与核对。 */
    public static final int MIN_QUOTE_CHARS = 8;

    /** 模糊命中阈值：二元组 Dice 相似度。 */
    public static final double MATCH_THRESHOLD = 0.80;

    /** 判为编造后替换成的说法（保留句子通顺，且不带引号）。 */
    public static final String OPP_REPHRASE = "你刚才那个说法";
    public static final String MATE_REPHRASE = "我方刚才那个说法";
    public static final String NEUTRAL_REPHRASE = "那个说法";

    /** 单条引文的判定结果。 */
    public enum Status {
        /** 在历史里找到了（精确或模糊），且硬指纹（数字/否定词）一致。 */
        MATCHED,
        /** 历史里找不到 —— 编的。 */
        FABRICATED,
        /**
         * 能匹配到原文，但**硬指纹对不上**：引文里的数字/百分比或否定词（不/未/无/没有/禁止）
         * 在原文里没有。典型是「必须有」被写成「必须没有」、21% 被写成 37%。
         * 语义已经变了，按编造处理（改写 + 计数），单独留一个状态是为了复盘能说清原因。
         */
        MISMATCH,
        /** 太短，不判。 */
        TOO_SHORT,
        /** 纯出处名（书名号内部 / 「据…」后面的出处），不判。 */
        CITATION
    }

    /** 一条引文的核对记录（复盘可以直接把这些打出来）。 */
    public record Verdict(String quote, Status status, double score) { }

    /** 处理结果：可直接落库的正文 + 统计。 */
    public record Result(String text, int quoted, int fabricated, int mismatched, List<Verdict> verdicts) {
        /** 有引文被改写过。 */
        public boolean changed() { return fabricated > 0; }
    }

    private QuoteGuard() { }

    // ------------------------------------------------------------------ 对外入口

    /**
     * 核对并改写一段 AI 文本里的引用。
     *
     * @param text          AI 输出（可为 null）
     * @param history       历史发言（每条 turn 取 content 字段），对方与队友的原文都在这里
     * @param extraSources  额外的可信原文（如 lastOpposite / lastSameSide 的原文）
     */
    public static Result scrub(String text, List<Map<String, Object>> history, String... extraSources) {
        String src = text == null ? "" : text;
        List<String> corpus = corpusOf(history, extraSources);

        List<Span> spans = spans(src);
        List<Verdict> verdicts = new ArrayList<>(spans.size());
        List<Span> fabricated = new ArrayList<>();
        int mismatched = 0;

        for (Span s : spans) {
            Verdict v = check(s, src, corpus);
            verdicts.add(v);
            if (v.status() == Status.FABRICATED) {
                fabricated.add(s);
            } else if (v.status() == Status.MISMATCH) {
                fabricated.add(s);        // 语义变了，当编造处理：改写 + 计数
                mismatched++;
            }
        }

        if (fabricated.isEmpty()) return new Result(src, spans.size(), 0, 0, verdicts);

        // 从右往左替换，保证左侧下标不失效
        StringBuilder sb = new StringBuilder(src);
        for (int i = fabricated.size() - 1; i >= 0; i--) {
            Span s = fabricated.get(i);
            sb.replace(s.start(), s.end(), replacementFor(src, s));
        }
        return new Result(cleanup(sb.toString()), spans.size(), fabricated.size(), mismatched, verdicts);
    }

    /** 单条引文的完整判定：长度 → 出处 → 模糊命中 → 硬指纹。 */
    private static Verdict check(Span s, String text, List<String> corpus) {
        String norm = normalize(s.quote());
        if (norm.length() < MIN_QUOTE_CHARS) return new Verdict(s.quote(), Status.TOO_SHORT, 0);

        QuoteParts parts = parts(s.quote());
        if (isCitationOnly(s, text, parts)) return new Verdict(s.quote(), Status.CITATION, 0);

        Best best = bestMatch(norm, corpus);
        if (best.score() < MATCH_THRESHOLD) return new Verdict(s.quote(), Status.FABRICATED, best.score());
        if (fingerprintMismatch(parts.claim(), best.source()))
            return new Verdict(s.quote(), Status.MISMATCH, best.score());
        return new Verdict(s.quote(), Status.MATCHED, best.score());
    }

    /** 只核对不改写：返回全部引文的判定（调试/评测集用）。 */
    public static List<Verdict> inspect(String text, List<Map<String, Object>> history, String... extraSources) {
        return scrub(text, history, extraSources).verdicts();
    }

    /** 单条引文在给定文本集合里的最高相似度（0–1，精确包含即 1）。 */
    public static double score(String quote, List<Map<String, Object>> history, String... extraSources) {
        return bestScore(normalize(quote), corpusOf(history, extraSources));
    }

    /** 两条文本的相似度（归一化后：包含=1，否则取双向滑窗 Dice 的较大者）。 */
    public static double similarity(String a, String b) {
        String x = normalize(a), y = normalize(b);
        if (x.isEmpty() || y.isEmpty()) return 0;
        if (x.equals(y) || x.contains(y) || y.contains(x)) return 1.0;
        return Math.max(slidingDice(x, y), slidingDice(y, x));
    }

    // ------------------------------------------------------------------ 归一化

    /** 去掉空白、标点、符号与控制字符，只留文字与数字。 */
    public static String normalize(String s) {
        if (s == null) return "";
        return s.replaceAll("[\\s\\u3000\\p{P}\\p{S}\\p{Cf}]", "");
    }

    // ------------------------------------------------------------------ 抽取

    /** 引号内片段在原文本中的位置（含引号本身，end 为闭区间+1）。 */
    record Span(int start, int end, String quote) { }

    private static Character closerOf(char c) {
        return switch (c) {
            case '「' -> '」';
            case '『' -> '』';
            case '“' -> '”';
            case '‘' -> '’';
            case '"' -> '"';
            default -> null;
        };
    }

    /** 抽出文本里所有成对引号的内容（嵌套按最外层处理）。 */
    static List<Span> spans(String text) {
        List<Span> out = new ArrayList<>();
        if (text == null || text.isEmpty()) return out;
        for (int i = 0; i < text.length(); i++) {
            Character closer = closerOf(text.charAt(i));
            if (closer == null) continue;
            int j = text.indexOf(closer, i + 1);
            if (j <= i + 1) continue;                      // 空引号 / 没有闭引号
            out.add(new Span(i, j + 1, text.substring(i + 1, j)));
            i = j;                                          // 跳过这一段，嵌套交给内层下一次
        }
        return out;
    }

    /** 只有引文内容（不留下标），给单测/日志用。 */
    public static List<String> quotes(String text) {
        List<String> out = new ArrayList<>();
        for (Span s : spans(text)) out.add(s.quote());
        return out;
    }

    /**
     * 引文拆成「出处」与「主张」两部分。
     *
     * <p>{@code hasBookTitle} = 引文里有书名号；{@code claim} = 去掉书名号内部之后的剩余部分。
     * 出处豁免只作用于书名号内部——书名号外面的内容（「显示不及格率下降 37%」这类）仍然是主张，要照常核。
     */
    record QuoteParts(String claim, boolean hasBookTitle) { }

    static QuoteParts parts(String quote) {
        String q = quote == null ? "" : quote;
        boolean has = q.indexOf('《') >= 0 || q.indexOf('》') >= 0;
        String claim = q.replaceAll("《[^》]{0,60}》", " ");
        return new QuoteParts(claim, has);
    }

    /**
     * 纯出处引用：整条引文只是"出处名"，不含主张。
     *
     * <p>两种形态：
     * <ul>
     *   <li>带书名号，且书名号外没有实质内容（剩余归一化 &lt; 8 字）→ 豁免；</li>
     *   <li>不带书名号但紧邻「据/根据/依据/出自/来源/援引」，且引文里没有数据口径
     *       （{@code %}、百分点、倍）→ 视为出处名，豁免。年份（2021）不算数据口径。</li>
     * </ul>
     * 其余一律不豁免：带数字的"出处+数据"要把数字拿去核（见 {@link #fingerprintMismatch}）。
     */
    private static boolean isCitationOnly(Span s, String text, QuoteParts parts) {
        if (parts.hasBookTitle()) {
            return normalize(parts.claim()).length() < MIN_QUOTE_CHARS;
        }
        int from = Math.max(0, s.start() - 6);
        String before = text.substring(from, s.start());
        boolean afterCiteVerb = false;
        for (String marker : new String[]{"据", "根据", "依据", "出自", "来源", "援引"}) {
            if (before.contains(marker)) { afterCiteVerb = true; break; }
        }
        if (!afterCiteVerb) return false;
        return !hasDataUnit(parts.claim());
    }

    /** 有没有"数据口径"（百分比/百分点/倍数）——这种引文不能当纯出处放过去。 */
    private static boolean hasDataUnit(String s) {
        if (s == null) return false;
        return s.matches("(?s).*(%|％|个百分点|倍).*");
    }

    /** 引文里的数字（归一化后 % 会被去掉，只留数值）。 */
    private static final java.util.regex.Pattern NUMBER =
            java.util.regex.Pattern.compile("\\d+(?:\\.\\d+)?");

    /** 否定词表：不/未/无/没有/禁止（"不能/不必…"这类都以「不」起头，查「不」即可覆盖）。 */
    private static final List<String> NEGATIONS = List.of("没有", "没", "禁止", "不", "未", "无");

    /**
     * 硬指纹核对：引文里的数字/百分比、否定词，必须在原文里也出现。
     *
     * <p>为什么单靠 Dice 不够：17 字的引文里插一个「没」，只毁 2–3 个 bigram，相似度仍 &gt; 0.9，
     * 但语义已经反了（「必须有」→「必须没有」）。数字同理（21% 改成 37%）。
     * 这里只做"有没有"级别的核对，不追求语序——宁可误伤个别同义改写，也不放过语义反转。
     */
    static boolean fingerprintMismatch(String quote, String source) {
        String q = normalize(quote);
        String s = normalize(source);
        if (q.isEmpty()) return false;
        java.util.regex.Matcher m = NUMBER.matcher(q);
        while (m.find()) {
            if (!s.contains(m.group())) return true;      // 引文里的数字在原文里找不到
        }
        for (String neg : NEGATIONS) {
            if (q.contains(neg) && !negationOk(neg, s)) return true;
        }
        return false;
    }

    /** 「没有 / 没」互为等价，其余否定词要求原样出现。 */
    private static boolean negationOk(String token, String source) {
        return switch (token) {
            case "没有", "没" -> source.contains("没有") || source.contains("没");
            default -> source.contains(token);
        };
    }

    // ------------------------------------------------------------------ 语料

    /** 历史发言 + 附带原文，全部归一化。 */
    static List<String> corpusOf(List<Map<String, Object>> history, String... extraSources) {
        List<String> out = new ArrayList<>();
        if (history != null) {
            for (Map<String, Object> t : history) {
                if (t == null) continue;
                Object c = t.get("content");
                if (c == null) continue;
                addCorpus(out, String.valueOf(c));
            }
        }
        if (extraSources != null) {
            for (String s : extraSources) addCorpus(out, s);
        }
        return out;
    }

    private static void addCorpus(List<String> out, String raw) {
        if (raw == null || raw.isBlank() || "null".equals(raw)) return;
        String norm = normalize(raw);
        if (!norm.isEmpty()) out.add(norm);
    }

    // ------------------------------------------------------------------ 匹配

    /** 最高相似度 + 命中它的那条原文（硬指纹要拿原文比对）。 */
    record Best(double score, String source) { }

    static Best bestMatch(String needle, List<String> corpus) {
        if (needle.isEmpty()) return new Best(0, "");
        Best best = new Best(0, "");
        for (String hay : corpus) {
            if (hay.contains(needle)) return new Best(1.0, hay);
            double d = slidingDice(needle, hay);
            if (d > best.score()) best = new Best(d, hay);
            if (best.score() >= 1.0) return best;
        }
        return best;
    }

    static double bestScore(String needle, List<String> corpus) {
        return bestMatch(needle, corpus).score();
    }

    /** 在 hay 上滑窗口（长度在 needle±2 之间），取与 needle 的最高二元组相似度。 */
    static double slidingDice(String needle, String hay) {
        int n = needle.length();
        if (n == 0 || hay == null || hay.isEmpty()) return 0;
        Map<String, Integer> nb = bigrams(needle);
        double best = 0;
        int minLen = Math.max(2, n - 2);
        int maxLen = Math.min(hay.length(), n + 2);
        for (int len = minLen; len <= maxLen; len++) {
            for (int i = 0; i + len <= hay.length(); i++) {
                double d = dice(nb, bigrams(hay.substring(i, i + len)));
                if (d > best) {
                    best = d;
                    if (best >= 0.999) return 1.0;
                }
            }
        }
        return best;
    }

    /** 二元组多重集合（单字串退化成它自己）。 */
    private static Map<String, Integer> bigrams(String s) {
        Map<String, Integer> m = new HashMap<>();
        if (s.length() < 2) {
            if (!s.isEmpty()) m.put(s, 1);
            return m;
        }
        for (int i = 0; i + 2 <= s.length(); i++) m.merge(s.substring(i, i + 2), 1, Integer::sum);
        return m;
    }

    private static double dice(Map<String, Integer> a, Map<String, Integer> b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        int inter = 0, total = 0;
        for (Map.Entry<String, Integer> e : a.entrySet()) total += e.getValue();
        for (Map.Entry<String, Integer> e : b.entrySet()) {
            total += e.getValue();
            Integer c = a.get(e.getKey());
            if (c != null) inter += Math.min(c, e.getValue());
        }
        return total == 0 ? 0 : 2.0 * inter / total;
    }

    // ------------------------------------------------------------------ 改写

    /** 按上下文选一个不带引号的说法。 */
    private static String replacementFor(String text, Span s) {
        String before = text.substring(Math.max(0, s.start() - 24), s.start());
        // 「把/将/用/拿/对…」支配的引文塞回「你刚才那个说法」会很别扭，用中性词
        if (before.matches("(?s).*(把|将|用|拿|对|就|围绕|针对|照着|顺着|依据|所谓)$")) return NEUTRAL_REPHRASE;
        if (before.contains("我方") || before.contains("队友")) return MATE_REPHRASE;
        if (before.contains("对方") || before.contains("你方") || before.contains("反方") || before.contains("正方"))
            return OPP_REPHRASE;
        return NEUTRAL_REPHRASE;
    }

    /** 把改写后残留的归属词、重复说法、断掉的引号收拾干净。 */
    static String cleanup(String src) {
        String s = src == null ? "" : src;
        final String OPP_ATTR = "(?:对方|你方|反方|正方|对方[一二三四]辩|你方[一二三四]辩)";
        final String MATE_ATTR = "(?:我方[一二三四]辩|我方队友|我方|队友)";
        final String SOFT = "(?:刚才|刚刚|上一轮|这一轮|之前|前面|此前|前面所说)?";
        final String VERB = "(?:说过|说的|说|讲到|讲的|讲|提到的|提到|认为|宣称|表示|那句|那句话|原话)?";
        final String PUNCT = "[，,：:]?\\s*";
        for (int round = 0; round < 3; round++) {
            String before = s;
            s = s.replaceAll(OPP_ATTR + SOFT + VERB + PUNCT + OPP_REPHRASE, OPP_REPHRASE);
            s = s.replaceAll(MATE_ATTR + SOFT + VERB + PUNCT + MATE_REPHRASE, MATE_REPHRASE);
            s = s.replaceAll("(" + OPP_REPHRASE + ")" + PUNCT + "\\1", "$1");
            s = s.replaceAll("(" + MATE_REPHRASE + ")" + PUNCT + "\\1", "$1");
            s = s.replaceAll(NEUTRAL_REPHRASE + PUNCT + NEUTRAL_REPHRASE, NEUTRAL_REPHRASE);
            if (s.equals(before)) break;
        }
        s = dropDanglingOpeners(s);
        return s.replaceAll("[ \\t]{2,}", " ").trim();
    }

    /**
     * 对外：删掉没有闭合的孤立开引号。
     *
     * <p>{@code guardDetailed} 在字数截断后无条件调一次——截断可能正好切进引文，
     * 留下一个没有后半句的「（旧实现在没有 fabricated 引文时不会走到 cleanup，于是残片会落库）。
     */
    public static String dropDangling(String text) {
        return text == null ? "" : dropDanglingOpeners(text);
    }

    /** 截断后可能留下一个没有闭引号的「，这种残片直接删掉。 */
    private static String dropDanglingOpeners(String s) {
        StringBuilder sb = new StringBuilder(s);
        for (int i = sb.length() - 1; i >= 0; i--) {
            Character closer = closerOf(sb.charAt(i));
            if (closer == null) continue;
            if (sb.charAt(i) != closer && sb.indexOf(String.valueOf(closer), i + 1) < 0) sb.deleteCharAt(i);
        }
        return sb.toString();
    }
}
