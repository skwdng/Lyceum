package com.siyige.eval;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * rubric（评分口径）完整性检查器。
 *
 * <p>本迭代后端要给评分加 rubric：五维权重、每维的 basis（口径）、以及 focus（优先改进）。
 * 这个类做两件事：
 * <ol>
 *   <li><b>发现 rubric</b>：优先看评分结果自身的 {@code rubric()} 访问器，其次看
 *       {@code ScoreService#rubric()}，最后看 {@code com.siyige.ai.Rubric} 一类的静态入口。
 *       都找不到 → 返回 null，测试 skip 并打印「待后端合并」，不制造假绿也不误报红。</li>
 *   <li><b>校验完整性</b>：五维齐全、权重合计 = 100、每维 basis 非空、focus 存在。</li>
 * </ol>
 *
 * <p>适配的字段别名（兼容中英文命名）：
 * 维度 matter/method/manner/adapt/evidence ↔ 立论/论证/表达/应变/论据；
 * 权重 weight/weightPct/percent/占比/分值；口径 basis/口径/explain/why/reason；
 * 优先改进 focus/improve/优先改进/improvement。
 */
final class RubricInspector {

    static final List<String> CANONICAL = List.of("matter", "method", "manner", "adapt", "evidence");

    private static final Map<String, String> ALIASES = aliases();

    /** 单维：权重（百分制）、口径、该维的优先改进（可空，允许 focus 只在顶层出现）。 */
    record Dimension(String key, Double weight, String basis, String focus) {}

    /** 一份 rubric：五维 + 顶层 focus；origin 记录来源，方便报告里说明「从哪发现的」。 */
    record Rubric(Map<String, Dimension> dimensions, String focus, String origin) {}

    private RubricInspector() {}

    /**
     * 发现 rubric。
     *
     * @param scorer        ScoreService 实例（可为 null）
     * @param scoredSample  已评分的 Score 记录（可为 null）——未来 rubric 最可能挂在它上面
     * @return null 表示后端尚未落地
     */
    static Rubric discover(Object scorer, Object scoredSample) {
        Object raw = accessor(scoredSample, "rubric", "rubricTable", "rubricOf");
        if (raw != null) return parse(raw, "Score#rubric()");

        raw = accessor(scorer, "rubric", "rubricTable", "rubricOf");
        if (raw != null) return parse(raw, "ScoreService#rubric()");

        ClassLoader cl = RubricInspector.class.getClassLoader();
        for (String cn : List.of("com.siyige.ai.Rubric", "com.siyige.ai.RubricTable", "com.siyige.service.Rubric")) {
            Class<?> c;
            try {
                c = Class.forName(cn, false, cl);
            } catch (Throwable missing) {
                continue;
            }
            for (String mn : List.of("rubric", "defaultRubric", "table", "of", "get", "load")) {
                try {
                    Method m = c.getMethod(mn);
                    boolean isStatic = Modifier.isStatic(m.getModifiers());
                    Object instance = isStatic ? null : newInstance(c);
                    if (!isStatic && instance == null) continue;
                    Object v = m.invoke(instance);
                    if (v != null) return parse(v, cn + "#" + mn + "()");
                } catch (Throwable ignore) {
                    // 试下一个入口
                }
            }
        }
        return null;
    }

    /** 把 Map / 记录对象解析成统一结构；结构不可识别时返回 null。 */
    static Rubric parse(Object raw, String origin) {
        if (raw == null) return null;
        Map<String, Object> top = toMap(raw);
        if (top == null || top.isEmpty()) return null;

        Map<String, Object> dimsRaw = new LinkedHashMap<>();
        Object nested = first(top, "dimensions", "dims", "rows", "items", "weights", "dimensionsWeights");
        if (nested instanceof Map<?, ?> m) {
            m.forEach((k, v) -> dimsRaw.put(String.valueOf(k), v));
        } else if (nested instanceof List<?> list) {
            for (Object item : list) {
                Map<String, Object> im = toMap(item);
                if (im == null) continue;
                Object key = first(im, "key", "name", "dim", "dimension", "id", "维度");
                if (key != null) dimsRaw.put(String.valueOf(key), item);
            }
        } else {
            // 顶层直接写五个维度（如 {matter:{weight,basis}, ...}）
            for (Map.Entry<String, Object> e : top.entrySet()) {
                if (ALIASES.containsKey(normalizeKey(e.getKey()))) dimsRaw.put(e.getKey(), e.getValue());
            }
        }
        if (dimsRaw.isEmpty()) return null;

        Map<String, Dimension> dims = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : dimsRaw.entrySet()) {
            String key = ALIASES.getOrDefault(normalizeKey(e.getKey()), normalizeKey(e.getKey()));
            Map<String, Object> dm = toMap(e.getValue());
            Double weight = dm == null
                    ? toDouble(e.getValue())
                    : toDouble(first(dm, "weight", "weightPct", "percent", "占比", "分值", "score"));
            String basis = dm == null ? null
                    : text(first(dm, "basis", "basisText", "口径", "explain", "why", "reason", "desc"));
            String focus = dm == null ? null
                    : text(first(dm, "focus", "improve", "improvement", "优先改进", "next"));
            dims.put(key, new Dimension(key, weight, basis, focus));
        }

        String focus = focusText(first(top, "focus", "优先改进", "improvement", "nextFocus"));
        return new Rubric(dims, focus, origin);
    }

    /** 完整性校验；返回空列表表示通过。 */
    static List<String> completenessProblems(Rubric r) {
        List<String> problems = new ArrayList<>();
        if (r == null) {
            problems.add("rubric 为空");
            return problems;
        }
        double sum = 0;
        int weighted = 0;
        for (String key : CANONICAL) {
            Dimension d = r.dimensions().get(key);
            if (d == null) {
                problems.add("缺少维度 " + key + "(" + label(key) + ")");
                continue;
            }
            if (d.weight() == null) {
                problems.add("维度 " + key + " 缺权重");
            } else {
                sum += d.weight();
                weighted++;
            }
            if (d.basis() == null || d.basis().isBlank()) {
                problems.add("维度 " + key + " 缺 basis（口径）");
            }
        }
        if (weighted > 0 && Math.abs(sum - 100.0) > 0.001) {
            problems.add("五维权重合计=" + trim(sum) + "，应=100");
        }
        if (r.focus() == null || r.focus().isBlank()) {
            problems.add("缺 focus（优先改进）");
        }
        return problems;
    }

    static String label(String key) {
        return switch (key) {
            case "matter" -> "立论";
            case "method" -> "论证";
            case "manner" -> "表达";
            case "adapt" -> "应变";
            case "evidence" -> "论据";
            default -> key;
        };
    }

    // ---------------- 反射 / 类型适配 ----------------

    private static Object accessor(Object target, String... names) {
        if (target == null) return null;
        for (String n : names) {
            try {
                Method m = target.getClass().getMethod(n);
                Object v = m.invoke(target);
                if (v != null) return v;
            } catch (Throwable ignore) {
                // 没有这个访问器是正常的
            }
        }
        return null;
    }

    /** 反射候选类可能需要实例：只有无参构造才尝试，失败就当该类不可用。 */
    private static Object newInstance(Class<?> c) {
        try {
            var ctor = c.getDeclaredConstructor();
            ctor.setAccessible(true);
            return ctor.newInstance();
        } catch (Throwable ignore) {
            return null;
        }
    }

    private static Map<String, Object> toMap(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            m.forEach((k, v) -> out.put(String.valueOf(k), v));
            return out;
        }
        // 支持 record / POJO：把 rubric、维度、focus 可能用到的访问器都探一遍。
        // 只读不写，缺哪个访问器就跳过，不会误判成「结构非法」。
        Map<String, Object> out = new LinkedHashMap<>();
        for (String n : List.of(
                "dimensions", "dims", "rows", "items", "weights", "focus", "improvement", "优先改进",
                "key", "name", "weight", "weightPct", "percent", "占比", "分值", "score",
                "basis", "basisText", "口径", "explain", "why", "reason", "evidence", "action", "improve")) {
            Object v = accessor(raw, n);
            if (v != null) out.put(n, v);
        }
        return out.isEmpty() ? null : out;
    }

    /** focus 可能是字符串，也可能是 RubricFocus 记录（带 action/reason）。 */
    private static String focusText(Object raw) {
        if (raw == null) return null;
        if (raw instanceof CharSequence) return text(raw);
        Object action = accessor(raw, "action");
        Object reason = accessor(raw, "reason");
        if (action != null) {
            String a = String.valueOf(action).trim();
            return reason == null || String.valueOf(reason).isBlank() ? a : a + "（" + reason + "）";
        }
        return text(raw);
    }

    private static Object first(Map<String, Object> map, String... keys) {
        if (map == null) return null;
        for (String k : keys) {
            Object v = map.get(k);
            if (v != null) return v;
        }
        return null;
    }

    private static Double toDouble(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String text(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String trim(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    private static String normalizeKey(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT).replace(" ", "").replace("_", "");
    }

    private static Map<String, String> aliases() {
        Map<String, String> m = new LinkedHashMap<>();
        for (String k : CANONICAL) m.put(k, k);
        m.put("立论", "matter");
        m.put("论证", "method");
        m.put("表达", "manner");
        m.put("应变", "adapt");
        m.put("论据", "evidence");
        return m;
    }
}
