package com.siyige;

import com.siyige.domain.Format;
import com.siyige.engine.TurnEngine;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class FormatTest {

    @Test
    void fullFormatHas12Steps() {
        assertEquals(12, Format.STEPS.size());
        assertEquals("A1", Format.STEPS.get(0).seat());
        assertEquals("A4", Format.STEPS.get(11).seat());
        // 自由辩展开 4 个子回合
        long free = Format.STEPS.stream().filter(s -> "自由辩".equals(s.seg())).count();
        assertEquals(4, free);
    }

    @Test
    void sprintDropsRebutAndQuestioning() {
        List<Format.Step> sprint = Format.stepsOf("SPRINT");
        assertEquals(8, sprint.size());
        assertTrue(sprint.stream().noneMatch(s -> "驳立论".equals(s.seg())));
    }

    @Test
    void mySeatsIsASet() {
        Set<String> mine = TurnEngine.parseSeats("A1, a2");
        assertEquals(Set.of("A1", "A2"), mine);
        assertTrue(TurnEngine.isMine(mine, "A2"));
        assertFalse(TurnEngine.isMine(mine, "B2"));
    }

    @Test
    void seatTurnsMatchProductCopy() {
        assertEquals(1, TurnEngine.turnsOf(Format.STEPS, "A1"));
        assertEquals(2, TurnEngine.turnsOf(Format.STEPS, "A2"));
        assertEquals(2, TurnEngine.turnsOf(Format.STEPS, "A3"));
        assertEquals(1, TurnEngine.turnsOf(Format.STEPS, "A4"));
    }

    @Test
    void seatBounds() {
        assertTrue(TurnEngine.validSeat("b4"));
        assertFalse(TurnEngine.validSeat("A5"));
        assertFalse(TurnEngine.validSeat(null));
    }
}
