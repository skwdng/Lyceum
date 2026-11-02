package com.siyige.domain;

import java.util.Map;

/**
 * 弹性节奏（v3）。
 *
 * 为什么不能定死：玩家是**打字**不是说话。中文打字 30–50 字/分钟，
 * 一段 250 字的立论，光敲进去就要 5 分钟以上；而定死 180 秒会逼人写半截。
 *
 * 所以按「环节 × 节奏」给基准时长，再叠三层弹性：
 *   ① 提前结束：点发送立刻进下一步（不用等倒计时）
 *   ② 打字续命：正在输入时自动 +30s，每步最多 3 次
 *   ③ 30 秒预警：先变红提示，超时只记「超时」，不判负
 */
public final class Pace {

    /** 标准节奏下的每环节秒数（按目标字数 ÷ 40 字/分钟 + 15 秒思考留白估算）。 */
    private static final Map<String, Integer> BASE = Map.of(
            "立论", 300,
            "驳立论", 210,
            "质询", 150,
            "自由辩", 90,
            "总结", 240
    );

    public static final String TIGHT = "tight";     // 紧凑 0.6×
    public static final String NORMAL = "normal";   // 标准 1.0×
    public static final String LOOSE = "loose";     // 宽松 1.4×

    public static double factor(String pace) {
        if (TIGHT.equalsIgnoreCase(pace)) return 0.6;
        if (LOOSE.equalsIgnoreCase(pace)) return 1.4;
        return 1.0;
    }

    /** 该环节给玩家多少秒。 */
    public static int secondsFor(String seg, String pace) {
        int base = BASE.getOrDefault(seg, 180);
        return Math.max(45, (int) Math.round(base * factor(pace)));
    }

    public static String label(String pace) {
        return switch (pace == null ? NORMAL : pace.toLowerCase()) {
            case TIGHT -> "紧凑";
            case LOOSE -> "宽松";
            default -> "标准";
        };
    }

    /** 每步最多自动续命几次、每次加多少秒。 */
    public static final int MAX_EXTEND = 3;
    public static final int EXTEND_SEC = 30;

    /** 距离结束多少秒开始预警。 */
    public static final int WARN_SEC = 30;

    private Pace() {}
}
