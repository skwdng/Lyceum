package com.siyige.eval;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 引用真实性校验接口（QuoteGuard 的测试侧契约）。
 *
 * <p>后端 QuoteGuard 已合并（{@code com.siyige.ai.QuoteGuard}），这里仍然用**反射适配**而不是直接
 * import：
 * <ul>
 *   <li>能自动接上 {@code QuoteGuard.inspect(String text, List<Map> history, String... extraSources)}
 *       （或 {@code scrub}），把「引文 + 来源」包装成一条历史发言再取判定；</li>
 *   <li>QuoteGuard 若被回滚/改名，测试仍能编译，并回退到 {@link VerbatimQuoteVerifier} 逐字比对，
 *       指标不会因为主代码缺失而崩。</li>
 * </ul>
 *
 * <p>判定映射：MATCHED / CITATION（出处类引用豁免）/ TOO_SHORT（不足 8 字不判）→ 可核实；
 * FABRICATED → 未命中。指标只统计伪造与改写样本的漏检。
 */
interface QuoteVerifier {

    /** cited=true 表示「该引用在来源里可核实」。 */
    record Verdict(boolean cited, String reason) {}

    String name();

    Verdict verify(String quote, String source);

    /** 自动选择：真实 QuoteGuard 优先，缺失时用逐字占位实现。 */
    static QuoteVerifier active() {
        QuoteVerifier guard = ReflectiveQuoteGuardVerifier.discover();
        return guard != null ? guard : new VerbatimQuoteVerifier();
    }
}

/**
 * 占位实现：逐字比对。
 *
 * <p>QuoteGuard 不在 classpath 时用它兜底：能稳定抓住「编数字 / 编法条 / 改写后当原话引用」，
 * 只是不如 QuoteGuard 语义化（不做模糊匹配、不识别出处类引用）。
 */
final class VerbatimQuoteVerifier implements QuoteVerifier {

    @Override
    public String name() {
        return "verbatim-fallback(占位：逐字比对)";
    }

    @Override
    public Verdict verify(String quote, String source) {
        String q = normalize(quote);
        String s = normalize(source);
        if (q.isEmpty()) return new Verdict(false, "空引用");
        if (s.isEmpty()) return new Verdict(false, "无来源可比对");
        boolean cited = s.contains(q);
        return new Verdict(cited, cited ? "与来源逐字一致" : "来源中查不到该原话（逐字比对未命中）");
    }

    /** 去掉空白与中英文标点、统一小写，避免「换行/全角逗号」这类格式差异造成误判。 */
    static String normalize(String s) {
        if (s == null) return "";
        return s.replaceAll("[\\s\\p{Punct}，。；：、！？「」『』（）《》〈〉“”‘’…—·]", "")
                .toLowerCase(Locale.ROOT);
    }
}

/**
 * 反射适配器：接 {@code com.siyige.ai.QuoteGuard}，不改测试代码即可跟随后端实现。
 *
 * <p>只做最小假设：把待校验引用包成 {@code 「quote」}，来源包成一条 history，
 * 调 {@code inspect} / {@code scrub} 后读第一条 verdict 的 {@code status()}。
 */
final class ReflectiveQuoteGuardVerifier implements QuoteVerifier {

    private static final String[] CANDIDATE_CLASSES = {
            "com.siyige.ai.QuoteGuard",
            "com.siyige.service.QuoteGuard"
    };

    private final String className;
    private final Method method;       // inspect 或 scrub
    private final boolean scrub;

    private ReflectiveQuoteGuardVerifier(String className, Method method, boolean scrub) {
        this.className = className;
        this.method = method;
        this.scrub = scrub;
    }

    static QuoteVerifier discover() {
        ClassLoader cl = ReflectiveQuoteGuardVerifier.class.getClassLoader();
        for (String cn : CANDIDATE_CLASSES) {
            Class<?> c;
            try {
                c = Class.forName(cn, false, cl);
            } catch (Throwable missing) {
                continue;
            }
            try {
                Method m = c.getMethod("inspect", String.class, List.class, String[].class);
                if (Modifier.isStatic(m.getModifiers())) {
                    return new ReflectiveQuoteGuardVerifier(cn, m, false);
                }
            } catch (Throwable ignore) {
                // 没有 inspect 就试 scrub
            }
            try {
                Method m = c.getMethod("scrub", String.class, List.class, String[].class);
                if (Modifier.isStatic(m.getModifiers())) {
                    return new ReflectiveQuoteGuardVerifier(cn, m, true);
                }
            } catch (Throwable ignore) {
                // 两个入口都没有，换下一个类名
            }
        }
        return null;
    }

    @Override
    public String name() {
        return "QuoteGuard(reflective:" + className + "#" + method.getName() + ")";
    }

    @Override
    public Verdict verify(String quote, String source) {
        try {
            String text = "「" + quote + "」";
            List<Map<String, Object>> history = List.of(Map.of("content", source));
            Object raw = method.invoke(null, text, history, new String[0]);
            List<?> verdicts = scrub ? asList(accessor(raw, "verdicts")) : asList(raw);
            if (verdicts == null || verdicts.isEmpty()) {
                return new Verdict(false, "QuoteGuard 未抽取到引文");
            }
            Object first = verdicts.get(0);
            String status = String.valueOf(accessor(first, "status"));
            Object similarity = accessor(first, "score");
            boolean cited = switch (status) {
                case "MATCHED", "CITATION", "TOO_SHORT" -> true;
                default -> false;
            };
            return new Verdict(cited, "QuoteGuard status=" + status
                    + (similarity == null ? "" : " · 相似度=" + similarity));
        } catch (Throwable t) {
            Throwable cause = t.getCause() == null ? t : t.getCause();
            return new Verdict(false, "QuoteGuard 调用失败：" + cause);
        }
    }

    private static Object accessor(Object target, String name) {
        if (target == null) return null;
        try {
            Method m = target.getClass().getMethod(name);
            return m.invoke(target);
        } catch (Throwable ignore) {
            return null;
        }
    }

    private static List<?> asList(Object v) {
        return v instanceof List<?> l ? l : null;
    }
}
