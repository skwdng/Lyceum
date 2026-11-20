package com.siyige.engine;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 席位与发言权的纯逻辑测试。
 *
 * <p>这块被判错一次就会连环出问题：席位解析错 → 「我的回合」判断错 → 我能替对方说话
 * 或者我该说话时没给输入框。之前只有零散的单测，这里补齐边界。
 */
class TurnEngineTest {

    @Test
    void 席位解析忽略大小写与空格并去重() {
        assertEquals(Set.of("A1", "A2", "B3"), TurnEngine.parseSeats(" a1, A2 ,b3 "));
        // 历史兼容：parseSeats 空值默认 {A1}（早期单人模式不传席位）；严格版才是空集合
        assertEquals(Set.of("A1"), TurnEngine.parseSeats(""));
        assertEquals(Set.of("A1"), TurnEngine.parseSeats(null));
        assertEquals(Set.of(), TurnEngine.parseSeatsStrict(""));
        assertEquals(Set.of(), TurnEngine.parseSeatsStrict(null));
        assertEquals(Set.of("B2"), TurnEngine.parseSeatsStrict(" b2 "));
    }

    @Test
    void 席位合法性() {
        assertTrue(TurnEngine.validSeat("A1"));
        assertTrue(TurnEngine.validSeat("b4"));
        assertFalse(TurnEngine.validSeat("A5"));
        assertFalse(TurnEngine.validSeat("C1"));
        assertFalse(TurnEngine.validSeat(null));
    }

    @Test
    void 是否我的回合() {
        Set<String> mine = TurnEngine.parseSeats("B2");
        assertTrue(TurnEngine.isMine(mine, "B2"));
        assertFalse(TurnEngine.isMine(mine, "B1"));
        // 空席位集合时任何判定都不该成立（否则会误判成"轮到我了"）
        assertFalse(TurnEngine.isMine(Set.of(), "A1"));
    }

    @Test
    void 席位拼接统一大写并排序() {
        assertEquals("A1,B2", TurnEngine.joinSeats(Set.of("b2", "a1")));
        assertEquals("A1", TurnEngine.joinSeats(Set.of()));
    }
}
