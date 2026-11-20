package com.siyige;

import com.siyige.domain.Format;
import com.siyige.engine.TurnEngine;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class FormatTest {

    /**
     * 赛制长度不再写死 12 步：引擎改成「质询 q 轮 × 正反各一轮 + 自由辩 f 轮」后，
     * 步数 = 4 开场 + 4q 质询 + f 自由辩 + 2 总结。
     * 之前这里断言 12 步，是随机轮数上线前的旧口径（实跑会直接红）。
     */
    @Test
    void fullFormatFollowsSpec() {
        int q = 2, f = 4;
        List<Format.Step> steps = Format.stepsOf("FULL", q, f);
        assertEquals(4 + 4 * q + f + 2, steps.size());
        assertEquals("A1", steps.get(0).seat());
        assertEquals("A4", steps.get(steps.size() - 1).seat());
        assertEquals(f, steps.stream().filter(s -> "自由辩".equals(s.seg())).count());
        assertEquals(4 * q, steps.stream().filter(s -> "质询".equals(s.seg())).count());
        // 默认 STEPS 就是 2 质询轮 + 4 自由辩轮
        assertEquals(steps.size(), Format.STEPS.size());
    }

    @Test
    void sprintDropsRebutAndQuestioning() {
        List<Format.Step> sprint = Format.stepsOf("SPRINT", 2, 4);
        assertEquals(4 + 4 + 2, sprint.size());          // 开场（含驳立论）+ 自由辩 + 总结
        assertTrue(sprint.stream().noneMatch(s -> "质询".equals(s.seg())));   // 快速局只砍质询
        assertEquals(2, sprint.stream().filter(s -> "驳立论".equals(s.seg())).count());
    }

    @Test
    void mySeatsIsASet() {
        Set<String> mine = TurnEngine.parseSeats("A1, a2");
        assertEquals(Set.of("A1", "A2"), mine);
        assertTrue(TurnEngine.isMine(mine, "A2"));
        assertFalse(TurnEngine.isMine(mine, "B2"));
    }

    @Test
    void seatTurnsMatchSpec() {
        List<Format.Step> steps = Format.stepsOf("FULL", 2, 4);
        assertEquals(1, TurnEngine.turnsOf(steps, "A1"));   // 只立论一次
        assertEquals(1, TurnEngine.turnsOf(steps, "B1"));
        assertEquals(1, TurnEngine.turnsOf(steps, "A4"));   // 只总结一次
        assertEquals(1, TurnEngine.turnsOf(steps, "B4"));
        // 质询固定由三辩承担：2 轮 × (问+答) = 4 次；再各有一轮自由辩 → 5 次
        assertEquals(5, TurnEngine.turnsOf(steps, "A3"));
        assertEquals(5, TurnEngine.turnsOf(steps, "B3"));
        // 每个席位至少轮得到一次，且总次数等于步数
        int sum = 0;
        for (String seat : Format.SEATS) sum += TurnEngine.turnsOf(steps, seat);
        assertEquals(steps.size(), sum);
    }

    @Test
    void seatBounds() {
        assertTrue(TurnEngine.validSeat("b4"));
        assertFalse(TurnEngine.validSeat("A5"));
        assertFalse(TurnEngine.validSeat(null));
    }
}
