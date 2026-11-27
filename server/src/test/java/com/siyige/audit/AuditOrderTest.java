package com.siyige.audit;

import com.siyige.domain.Format;
import com.siyige.domain.Pace;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 审计 ①：发言顺序（18 步序列 / 质询问答归属 / 自由辩轮转 / 结辩顺序 / 时间口径）。
 *
 * <p>本类里的 {@code @Disabled} 用例断言的是**期望语义**，现在跑必然失败——它们就是
 * {@code docs/audit/01-backend-order.md} 里的复现证据。**待修复后启用**（去掉 @Disabled）。
 *
 * <p>没加 @Disabled 的两条是「当前已经正确」的顺序契约，用来防止修复时把顺序改坏。
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

    // ---------- 待修复后启用 ----------

    @Test
    @Disabled("待修复后启用：Format.QUERY_MIN=QUERY_MAX=2，质询轮数被夹成固定 2 轮（注释/规格写的是 2–4 轮）")
    @DisplayName("质询轮数应按传入值生效（4 轮 → 26 步），现在恒为 18 步")
    void 质询轮数被夹成固定2轮() {
        assertEquals(4 + 4 * 4 + 4 + 2, Format.stepsOf("FULL", 4, 4).size(),
                "每方 4 轮质询应是 4+16+4+2=26 步；实际被 QUERY_MAX=2 夹成 18 步");
    }

    @Test
    @Disabled("待修复后启用：FREE_SEATS 轮转在奇数轮时两边不均，正方（A）总是多一轮且拿到第一步")
    @DisplayName("自由辩 3 轮时双方应各 2/1 均分或明确对称，现在 A 拿 2 轮、B 拿 1 轮")
    void 自由辩奇数轮导致双方不均() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 3);
        int a = 0, b = 0;
        for (Format.Step st : s) if ("自由辩".equals(st.seg())) {
            if (st.seat().startsWith("A")) a++; else b++;
        }
        assertEquals(b, a, "自由辩轮次 3 时正方 " + a + " 轮、反方 " + b + " 轮，两边不对称");
        assertEquals("A2", firstFreeSeat(s), "自由辩第一步恒为正方 A2");
    }

    private static String firstFreeSeat(List<Format.Step> s) {
        for (Format.Step st : s) if ("自由辩".equals(st.seg())) return st.seat();
        return "";
    }

    @Test
    @Disabled("待修复后启用：advance 里 stepSeconds(ns, 0, …) 恒传 overrideSec=0，开局传入的 turnSeconds 只在第 1 步生效")
    @DisplayName("自定义每轮时长 90s 应作用于第 2 步，现在被 Pace.secondsFor(立论)=300s 覆盖")
    void 自定义每轮时长只对第一步生效() throws Exception {
        String id = newMatch("B1", "room", 90);      // 第 1 步是 A1（AI），第 2 步是 B1（我）
        assertEquals(90, ((Number) row(id).get("turn_sec")).intValue(), "开局确实存了 90");

        // 让 AI 把第 1 步说完，推进到第 2 步
        org.mockito.Mockito.when(ai.speakForSolo(org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(new com.siyige.ai.AiService.Speech("我方认为应当保留期末考试。", false, ""));
        expireDeadline(id);
        service.tick();
        assertTrue(awaitStepAtLeast(id, 1, 3000), "AI 第 1 步应推进到第 2 步");

        long left = remainingSeconds(id);
        assertTrue(left > 60 && left <= 100,
                "第 2 步按用户给的 90s 计时；实际剩 " + left + "s（= Pace.secondsFor(立论,normal)="
                        + Pace.secondsFor("立论", "normal") + "s）");
    }

    @Test
    @Disabled("待修复后启用：时间口径三处不一致——Format.Step.sec(180) / Pace.secondsFor(300) / 事件里写死的 2")
    @DisplayName("同一个立论步，Format/Pace/SSE 三处给出的秒数应一致")
    void 时间口径三处不一致() {
        Format.Step s0 = Format.stepsOf("FULL", 2, 4).get(0);
        assertEquals(s0.sec(), Pace.secondsFor(s0.seg(), "normal"),
                "Format.Step.sec=" + s0.sec() + " 而 Pace.secondsFor=" + Pace.secondsFor(s0.seg(), "normal")
                        + "；advance 用的是后者，match.start 事件推的是前者");
    }

    @Test
    @Disabled("待修复后启用：自由辩轮转席位只有 A2/B2/A3/B3，四辩（A4/B4）全天只在结辩说一句")
    @DisplayName("自由辩应让四辩也参与轮转（或明确记录这是设计选择）")
    void 自由辩不含四辩席位() {
        List<Format.Step> s = Format.stepsOf("FULL", 2, 6);
        List<String> freeSeats = new ArrayList<>();
        for (Format.Step st : s) if ("自由辩".equals(st.seg())) freeSeats.add(st.seat());
        assertTrue(freeSeats.contains("A4") || freeSeats.contains("B4"),
                "6 轮自由辩里四辩一次都没上： " + freeSeats);
    }
}
