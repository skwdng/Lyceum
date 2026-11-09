package com.siyige.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 赛制常量。
 *
 * <p>v5 起质询与自由辩改成**多轮**，轮数在开局时随机决定（真实比赛也不固定）：
 * <ul>
 *   <li>质询：2–4 轮/方，每轮「问 → 答」两步，正反各来一遍</li>
 *   <li>自由辩：3–6 轮，双方三辩二辩交替短打</li>
 * </ul>
 * 所以步骤序列不再是固定 12 步，而是按轮数生成。
 */
public final class Format {

    public record Step(int no, String seg, String seat, int sec, String duty) { }

    /** 轮数随机范围（含两端）。 */
    public static final int QUERY_MIN = 2, QUERY_MAX = 4;
    public static final int FREE_MIN = 3, FREE_MAX = 6;

    /** 固定部分：立论 + 驳立论；总结放在最后单独拼。 */
    private static final List<Step> OPENING = List.of(
            new Step(0, "立论",   "A1", 180, "立论"),
            new Step(0, "立论",   "B1", 180, "立论"),
            new Step(0, "驳立论", "A2", 120, "驳立论"),
            new Step(0, "驳立论", "B2", 120, "驳立论")
    );

    /** 自由辩短打：20 秒一轮，轮转这四个席位。 */
    private static final String[] FREE_SEATS = {"A2", "B2", "A3", "B3"};

    /** 质询：一组「问方 → 答方」，正反各一组。 */
    private static final String[][] QUERY_PAIRS = {
            {"A3", "B3"},   // 正方三辩问 → 反方三辩答
            {"B3", "A3"}    // 反方三辩问 → 正方三辩答
    };

    public static final List<String> SEATS = List.of("A1","A2","A3","A4","B1","B2","B3","B4");

    /** 随机轮数：真实比赛每场不一样，别写死。 */
    public static int randomQueryRounds(Random r) { return QUERY_MIN + r.nextInt(QUERY_MAX - QUERY_MIN + 1); }
    public static int randomFreeRounds(Random r)  { return FREE_MIN + r.nextInt(FREE_MAX - FREE_MIN + 1); }

    /**
     * 生成步骤序列。
     *
     * @param mode   FULL / SPRINT
     * @param queryRounds 每方质询轮数（2–4）
     * @param freeRounds  自由辩轮数（3–6）
     */
    public static List<Step> stepsOf(String mode, int queryRounds, int freeRounds) {
        int q = Math.max(1, Math.min(QUERY_MAX, queryRounds));
        int f = Math.max(1, Math.min(FREE_MAX, freeRounds));

        List<Step> out = new ArrayList<>(OPENING);

        boolean sprint = "SPRINT".equalsIgnoreCase(mode);
        if (!sprint) {
            // 质询：正反各 q 轮，每轮「问 → 答」
            for (int round = 0; round < q; round++) {
                for (String[] pair : QUERY_PAIRS) {
                    out.add(new Step(0, "质询", pair[0], 60, "质询·问"));
                    out.add(new Step(0, "质询", pair[1], 45, "质询·答"));
                }
            }
        }

        // 自由辩：f 轮短打，席位轮转
        for (int i = 0; i < f; i++) {
            out.add(new Step(0, "自由辩", FREE_SEATS[i % FREE_SEATS.length], 25, "自由辩"));
        }

        out.add(new Step(0, "总结", "B4", 180, "总结"));
        out.add(new Step(0, "总结", "A4", 180, "总结"));

        // 重新编号
        List<Step> numbered = new ArrayList<>(out.size());
        for (int i = 0; i < out.size(); i++) {
            Step s = out.get(i);
            numbered.add(new Step(i + 1, s.seg(), s.seat(), s.sec(), s.duty()));
        }
        return numbered;
    }

    /** 兼容旧调用：按默认轮数生成。 */
    public static List<Step> stepsOf(String mode) {
        return stepsOf(mode, 2, 4);
    }

    public static List<Step> STEPS = stepsOf("FULL", 2, 4);

    public static String side(String seat) { return seat.substring(0, 1); }

    public static String role(String seat) {
        return switch (seat.charAt(1)) {
            case '1' -> "一辩";
            case '2' -> "二辩";
            case '3' -> "三辩";
            default  -> "四辩";
        };
    }

    public static Step stepAt(List<Step> steps, int index) {
        return index >= 0 && index < steps.size() ? steps.get(index) : null;
    }

    private Format() {}
}
