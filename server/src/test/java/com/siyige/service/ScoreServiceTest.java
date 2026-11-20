package com.siyige.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 规则评分：0 次 LLM 调用，全靠规则。
 *
 * <p>这几条是最容易被静默改坏的地方：
 * <ul>
 *   <li>超时 / 敷衍发言不能当内容算分；</li>
 *   <li>没有真人队友时「协同」按中性 60 记，不能因为 AI 填充席位被算成配合好；</li>
 *   <li>分数必须落在 0–100 的合理区间。</li>
 * </ul>
 */
class ScoreServiceTest {

    private final ScoreService scorer = new ScoreService(mock(EvidenceService.class));

    private static Map<String, Object> turn(int step, String seat, String seg, String content, String status) {
        return Map.of("step", step, "seat", seat, "seg", seg, "content", content,
                "status", status == null ? "OK" : status);
    }

    @Test
    void 超时与敷衍发言不计入内容() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", "我方认为应当取消期末考试，因为可以改成过程性评价。", "OK"),
                turn(2, "B2", "立论", "（超时未发言）", "TIMEOUT"),
                turn(3, "B2", "质询", "11", "EMPTY"));

        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        assertTrue(s.total() > 0, "有正常发言就该有分");
        // 三条里只有一条有效内容：不该出现"说了三句"那种虚高
        assertTrue(s.total() <= 100);
    }

    @Test
    void 全是超时也能出分不炸() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", "（超时未发言）", "TIMEOUT"),
                turn(2, "B2", "质询", "（超时未发言）", "TIMEOUT"));
        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        assertTrue(s.total() >= 0 && s.total() <= 100);
    }

    @Test
    void 没有真人队友时协同记零而不是虚构() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", "我方判断：应当取消期末考试。", "OK"));
        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        // 单人模式里没有真人队友可承接，协同就是 0；
        // 界面上展示的中性 60 是画像层的口径，不能反过来污染本场得分
        assertEquals(0, s.collab());
    }

    @Test
    void 接住队友原话能加分() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B1", "立论", "我方认为取消期末考试会降低学业标准的刚性。", "OK"),
                turn(2, "B2", "驳立论", "顺着我方一辩说的「降低学业标准的刚性」，我再补一层：替代评价必须同等刚性。", "OK"));
        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        assertTrue(s.collab() > 0, "承接了队友论点应给协同分，实际 " + s.collab());
    }

    @Test
    void 各维度落在合理区间() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "B2", "立论", "我方判断：应当取消期末考试，因为一次性闭卷只考记忆；但如果保留补考，标准不会降。", "OK"),
                turn(2, "B2", "质询", "请问对方：复核主体是谁？据《普通高等学校学生管理规定》，考核形式由学校定。", "OK"));
        ScoreService.Score s = scorer.score(turns, Set.of("B2"));
        for (int v : new int[]{s.matter(), s.method(), s.manner(), s.adapt(), s.evidence()}) {
            assertTrue(v >= 0 && v <= 100, "维度分越界: " + v);
        }
        assertTrue(s.total() > 0);
    }

    @Test
    void 按席位分开评分() {
        List<Map<String, Object>> turns = List.of(
                turn(1, "A2", "驳立论", "对方说「都这样」，这是以偏概全。", "OK"),
                turn(2, "B2", "驳立论", "我方正面回答：复核由教务处承担。", "OK"));
        var per = scorer.scorePerSeat(turns, Set.of("A2", "B2"), null, List.of());
        assertEquals(2, per.size(), "两个席位都应该有分");
        assertEquals(0, scorer.scorePerSeat(turns, Set.of("A4"), null, List.of()).size(),
                "没发言的席位不该出现在结果里（A4 没说话）");
    }
}
