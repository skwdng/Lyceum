package com.siyige.domain;

import java.util.List;

/** 赛制常量：9 个环节、自由辩展开 4 子回合，共 12 步。顺序不可改（规格 §3.1）。 */
public final class Format {

    public record Step(int no, String seg, String seat, int sec) {}

    public static final List<Step> STEPS = List.of(
            new Step(1,  "立论",   "A1", 180),
            new Step(2,  "立论",   "B1", 180),
            new Step(3,  "驳立论", "A2", 120),
            new Step(4,  "驳立论", "B2", 120),
            new Step(5,  "质询",   "A3", 120),
            new Step(6,  "质询",   "B3", 120),
            new Step(7,  "自由辩", "A2", 120),
            new Step(8,  "自由辩", "B2", 120),
            new Step(9,  "自由辩", "A3", 120),
            new Step(10, "自由辩", "B3", 120),
            new Step(11, "总结",   "B4", 180),
            new Step(12, "总结",   "A4", 180)
    );

    public static final List<String> SEATS = List.of("A1","A2","A3","A4","B1","B2","B3","B4");

    /** 三种训练模式只换步骤序列，引擎不变。 */
    public static List<Step> stepsOf(String mode) {
        if ("SPRINT".equalsIgnoreCase(mode)) {
            return STEPS.stream().filter(s ->
                    s.no() == 1 || s.no() == 2 || (s.no() >= 7 && s.no() <= 12)).toList();
        }
        return STEPS;
    }

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
