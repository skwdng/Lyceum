package com.siyige.audit;

import com.siyige.domain.Format;
import com.siyige.domain.Pace;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * 审计 ①：发言顺序（18 步序列 / 质询问答归属 / 自由辩轮转 / 结辩顺序 / 时间口径）。
 *
 * <p>B3 修完后，「自定义时长每步生效」与「开场事件秒数走 Pace 口径」已解禁；
 * 仍 {@code @Disabled} 的三条是**赛制规格决策**（要不要 2–4 轮质询、自由辩要不要让四辩上场），
 * 不属于 B1-B3 的后端缺陷修复。
 */
class AuditOrderTest extends AuditSupport {

    // ---------- 已经正确：锁住，不许改坏 ----------

    @Test
    @DisplayName("质询是「问→答」成对出现，正反各一轮交替")
    void 质询问答即成对_已正确() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 4);
        assertEquals(1, s.get(0).no(), "步号从 1 开始");
        assertEquals(4, s.get(3).no(), "前 4 步是立论/驳立论");
        String[][] pair1 = {{"A3", "B3"}, {"B3", "A3"}};
        for (int round = 0; round < 2; round++) {
            for (int p = 0; p < 2; p++) {
                int base = 4 + round * 4 + p * 2;
                assertEquals(pair1[p][0], s.get(base).seat(), "第 " + base + " 步应是问方");
                assertEquals("质询·问", s.get(base).duty());
                assertEquals(pair1[p][1], s.get(base + 1).seat(), "第 " + (base + 1) + " 步应是答方");
                assertEquals("质询·答", s.get(base + 1).duty());
            }
        }
    }

    @Test
    @DisplayName("结辩顺序：反方四辩先、正方四辩后（正方收尾）")
    void 结辩由反方先讲_已正确() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 4);
        Format.Step last = s.get(s.size() - 1);
        Format.Step prev = s.get(s.size() - 2);
        assertEquals("总结", last.seg());
        assertEquals("A4", last.seat(), "正方四辩必须最后收尾");
        assertEquals("B4", prev.seat(), "反方四辩先结辩");
    }

    // ---------- B3 已修：常绿 ----------

    @Test
    @DisplayName("自定义每轮时长 90s 应作用于每一步（B3：advance 传 turn_sec）")
    void 自定义每轮时长只对第一步生效() throws Exception {
        org.mockito.Mockito.when(ai.speakForSolo(anyString(), anyString(), anyString(), anyString(),
                        anyString(), anyString(), any()))
                .thenReturn(new com.siyige.ai.AiService.Speech("我方认为应当保留期末考试。", false, ""));

        String id = newMatch("B1", "room", 90);      // 第 1 步是 A1（AI），第 2 步是 B1（我）
        assertEquals(90, ((Number) row(id).get("turn_sec")).intValue(), "开局确实存了 90");

        expireDeadline(id);
        service.tick();
        assertTrue(awaitStepAtLeast(id, 1, 3000), "AI 第 1 步应推进到第 2 步");

        long left = remainingSeconds(id);
        assertTrue(left > 60 && left <= 100,
                "第 2 步必须按用户给的 90s 计时；实际剩 " + left + "s（= Pace.secondsFor(立论,normal)="
                        + Pace.secondsFor("立论", "normal") + "s 说明又被赛制表覆盖了）");
    }

    @Test
    @DisplayName("match.start 的倒计时应与 Pace 口径一致（B3：不再发 Format.Step.sec 的静态值）")
    void 时间口径三处不一致() throws Exception {
        newMatch("B1", "room");

        ArgumentCaptor<Map<String, Object>> cap = ArgumentCaptor.forClass(Map.class);
        verify(hub).emit(anyString(), eq("match.start"), cap.capture());
        Object seconds = cap.getValue().get("seconds");

        assertEquals(Pace.secondsFor("立论", "normal"), ((Number) seconds).intValue(),
                "开场事件发的是 " + seconds + " 秒，实际 deadline 用的是 Pace 口径 "
                        + Pace.secondsFor("立论", "normal") + " 秒（历史上这里发的是 Format.Step.sec=180）");
    }

    // ---------- 赛制规格决策，保留 @Disabled ----------

    @Test
    @Disabled("赛制规格决策，不在 B1-B3 范围：Format.QUERY_MIN=QUERY_MAX=2 把质询夹成固定 2 轮（注释/规格写 2–4 轮）。"
            + "改上限会改变全场步数（18 → 最多 26），需要产品与辩论顾问确认")
    @DisplayName("质询轮数应按传入值生效（4 轮 → 26 步），现在恒为 18 步")
    void 质询轮数被夹成固定2轮() {
        assertEquals(4 + 4 * 4 + 4 + 2, Format.stepsOf("FULL", 4, 4).size(),
                "每方 4 轮质询应是 4+16+4+2=26 步；实际被 QUERY_MAX=2 夹成 18 步");
    }

    @Test
    @Disabled("赛制规格决策，不在 B1-B3 范围：FREE_SEATS 轮转在奇数轮时正方总多一轮（3 轮 → A2,B2,A3）")
    @DisplayName("自由辩 3 轮时双方应均分或明确对称，现在 A 拿 2 轮、B 拿 1 轮")
    void 自由辩奇数轮导致双方不均() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 3);
        int a = 0, b = 0;
        String first = "";
        for (Format.Step st : s) {
            if (!"自由辩".equals(st.seg())) continue;
            if (first.isEmpty()) first = st.seat();
            if (st.seat().startsWith("A")) a++; else b++;
        }
        assertEquals(b, a, "自由辩轮次 3 时正方 " + a + " 轮、反方 " + b + " 轮，两边不对称");
        assertEquals("A2", first, "自由辩第一步恒为正方 A2");
    }

    @Test
    @Disabled("赛制规格决策，不在 B1-B3 范围：自由辩轮转只含 A2/B2/A3/B3，四辩（A4/B4）全场只在结辩说一句")
    @DisplayName("自由辩应让四辩也参与轮转（或明确记录这是设计选择）")
    void 自由辩不含四辩席位() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 6);
        List<String> freeSeats = new ArrayList<>();
        for (Format.Step st : s) if ("自由辩".equals(st.seg())) freeSeats.add(st.seat());
        assertTrue(freeSeats.contains("A4") || freeSeats.contains("B4"),
                "6 轮自由辩里四辩一次都没上： " + freeSeats);
    }
}
