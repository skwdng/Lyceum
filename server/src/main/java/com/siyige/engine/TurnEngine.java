package com.siyige.engine;

import com.siyige.domain.Format;

import java.util.List;
import java.util.Set;

/**
 * 赛制推进的纯函数集合：没有 IO、没有 Spring，可以直接单测。
 * 房间模式与单人模式共用（规格 R-TECH-01 / R-TECH-15）。
 */
public final class TurnEngine {

    /** 当前步骤该谁说话。 */
    public static Format.Step current(List<Format.Step> steps, int step) {
        return Format.stepAt(steps, step);
    }

    /** 这一步是不是玩家本人发言（可多席位，R-SOLO-03）。 */
    public static boolean isMine(Set<String> mySeats, String seat) {
        return seat != null && mySeats.contains(seat);
    }

    /** 解析 "A1,A2" → set。 */
    public static Set<String> parseSeats(String raw) {
        if (raw == null || raw.isBlank()) return Set.of("A1");
        return java.util.Arrays.stream(raw.split("[,\\s]+"))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(String::toUpperCase).collect(java.util.stream.Collectors.toSet());
    }

    public static String joinSeats(Set<String> seats) {
        return seats.stream().sorted().reduce((a, b) -> a + "," + b).orElse("A1");
    }

    /** 该席位在本赛制下的发言次数（用于座位卡预告 R-SEAT-07）。 */
    public static int turnsOf(List<Format.Step> steps, String seat) {
        return (int) steps.stream().filter(s -> s.seat().equals(seat)).count();
    }

    /** 校验玩家只能占合法席位。 */
    public static boolean validSeat(String seat) {
        return seat != null && Format.SEATS.contains(seat.toUpperCase());
    }

    private TurnEngine() {}
}
