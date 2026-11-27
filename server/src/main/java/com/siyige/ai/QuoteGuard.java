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
 *   <li><b>出处类引用豁免</b>：引文里带书名号（{@code 《…》}）或紧邻「据/根据/依据/出自」的，算论据出处而非
 *       对方原话，不判 fabricated（证据卡是外部材料，本来就不在历史发言里）。</li>
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
        /** 在历史里找到了（精确或模糊）。 */
        MATCHED,
        /** 历史里找不到 —— 编的。 */
        FABRICATED,
        /** 太短，不判。 */
        TOO_SHORT,
        /** 出处类引用（书名号 / 据…），不判。 */
        CITATION
    }

    /** 一条引文的核对记录（复盘可以直接把这些打出来）。 */
    public record Verdict(String quote, Status status, double score) { }

    /** 处理结果：可直接落库的正文 + 统计。 */
    public record Result(String text, int quoted, int fabricated, List<Verdict> verdicts) {
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

        for (Span s : spans) {
            String norm = normalize(s.quote());
            if (norm.length() < MIN_QUOTE_CHARS) {
                verdicts.add(new Verdict(s.quote(), Status.TOO_SHORT, 0));
                continue;
            }
            if (looksLikeCitation(src, s)) {
                verdicts.add(new Verdict(s.quote(), Status.CITATION, 0));
                continue;
            }
            double score = bestScore(norm, corpus);
            if (score >= MATCH_THRESHOLD) {
                verdicts.add(new Verdict(s.quote(), Status.MATCHED, score));
            } else {
                verdicts.add(new Verdict(s.quote(), Status.FABRICATED, score));
                fabricated.add(s);
            }
        }

        if (fabricated.isEmpty()) return new Result(src, spans.size(), 0, verdicts);

        // 从右往左替换，保证左侧下标不失效
        StringBuilder sb = new StringBuilder(src);
        for (int i = fabricated.size() - 1; i >= 0; i--) {
            Span s = fabricated.get(i);
            sb.replace(s.start(), s.end(), replacementFor(src, s));
        }
        return new Result(cleanup(sb.toString()), spans.size(), fabricated.size(), verdicts);
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

    /** 出处类引用：书名号，或紧邻「据/根据/依据/出自/来源」。 */
    private static boolean looksLikeCitation(String text, Span s) {
        String q = s.quote();
        if (q.indexOf('《') >= 0 || q.indexOf('》') >= 0) return true;
        int from = Math.max(0, s.start() - 6);
        String before = text.substring(from, s.start());
        for (String marker : new String[]{"据", "根据", "依据", "出自", "来源", "援引"}) {
            if (before.contains(marker)) return true;
        }
        return false;
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

    static double bestScore(String needle, List<String> corpus) {
        if (needle.isEmpty()) return 0;
        double best = 0;
        for (String hay : corpus) {
            if (hay.contains(needle)) return 1.0;
            double d = slidingDice(needle, hay);
            if (d > best) best = d;
            if (best >= 1.0) return 1.0;
        }
        return best;
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
