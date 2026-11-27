package com.siyige.audit;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 审计 ④：「催一下」（后端唯一入口是 POST /matches/{id}/skip，没有 nudge 这个路由）。
 *
 * <p>结论先说：**谁能催** = 有该对局权限的任何人，但只对 kind=solo 且当前不是自己回合生效；
 * **幂等** = 靠 skipped_step（0-based）同一轮只认一次；**冷却** = last_skip_at（bigint）3 秒；
 * **与 4 路生成线程的关系** = 完全无交互，只把 deadline 改到过去，靠 tick 去捡。
 *
 * <p>{@code @Disabled} 的用例断言期望语义，**待修复后启用**。
 */
class AuditNudgeTest extends AuditSupport {

    // ---------- 已经正确：锁住 ----------

    @Test
    @DisplayName("同一轮第二次催被幂等挡住")
    void 同轮只认一次_已正确() throws Exception {
        String id = newMatch("B2", "solo");      // 第 1 步是 A1（AI），可以催
        Map<String, Object> first = service.skip(id);
        assertEquals(Boolean.TRUE, first.get("ok"), "第一次应成功: " + first);

        Map<String, Object> second = service.skip(id);
        assertEquals(Boolean.FALSE, second.get("ok"));
        assertTrue(String.valueOf(second.get("reason")).contains("催过"), "实际: " + second);
    }

    @Test
    @Disabled("待修复后启用：冷却读的是 bigint 列 last_skip_at，但 MatchService 用 num()→intValue() 读，"
            + "epoch 毫秒被截断成 32 位，now-lastAt 变成巨大数/负数 → 冷却要么恒失效要么恒生效")
    @DisplayName("3 秒冷却应真的挡住 0.5 秒内的第二次催")
    void 冷却被int截断失效() throws Exception {
        String id = newMatch("B2", "solo");
        // 造出「上一轮刚催过 0.5 秒」的样子：skipped_step 不是当前步，只有冷却该生效
        jdbc.update("update sy_match set skipped_step=?, last_skip_at=? where id=?",
                -1, System.currentTimeMillis() - 500, id);

        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.FALSE, r.get("ok"), "0.5 秒内的第二次催应被冷却挡住，实际却放行: " + r);
    }

    @Test
    @DisplayName("轮到我自己说话时不允许催")
    void 自己回合不能催_已正确() throws Exception {
        String id = newMatch("A1", "solo");      // 第 1 步就是我的
        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.FALSE, r.get("ok"));
        assertTrue(String.valueOf(r.get("reason")).contains("轮到你说"), "实际: " + r);
    }

    // ---------- 待修复后启用 ----------

    @Test
    @Disabled("待修复后启用：skip 只放行 kind=solo，房间局的 AI 回合完全没法催（而多人局才是等得最久的）")
    @DisplayName("房间局的 AI 回合也应可以催一下")
    void 房间局无法催() throws Exception {
        String id = newMatch("A1", "room");      // 第 1 步是 A1，但 kind=room
        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.TRUE, r.get("ok"),
                "房间局第 1 步是 A1（不是我的席位），却直接返回：" + r.get("reason"));
    }

    @Test
    @Disabled("待修复后启用：skip 不看 generating/attempts，AI 正在生成时仍返回 ok=true（假成功），"
            + "生成失败重试 3 次后对局反而被判 ABANDONED")
    @DisplayName("AI 正在生成时催一下应明确告知「正在生成」而不是假装成功")
    void 生成中的假成功() throws Exception {
        String id = newMatch("B2", "solo");      // 第 1 步 A1，AI 回合
        // 让 AI 一直失败（mock 返回 null → 生成线程抛异常），skip 之后 tick 会把 attempts 打到 3
        expireDeadline(id);
        service.tick();
        Map<String, Object> r = service.skip(id);
        assertTrue(Boolean.FALSE.equals(r.get("ok")) || String.valueOf(r.get("reason")).contains("生成"),
                "AI 正在生成时不该返回「催成功」: " + r);
    }

    @Test
    @Disabled("待修复后启用：冷却读 last_skip_at 时被 num()→intValue() 截断（见上一条），"
            + "于是跳过快后立刻催下一步不会被 3 秒冷却挡住 → 可以按 250ms 的节奏连续催完一整场")
    @DisplayName("催过一轮之后，3 秒内不许再催下一步")
    void 可以连续催下一步骤() throws Exception {
        String id = newMatch("B2", "solo");
        assertEquals(Boolean.TRUE, service.skip(id).get("ok"), "第 1 步（A1）第一次催应成功");

        // 模拟 tick 已经把对局推到第 2 步（B1，仍不是我的回合）
        jdbc.update("update sy_match set step=1, deadline_at=? where id=?",
                new java.sql.Timestamp(System.currentTimeMillis() + 60_000), id);

        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.FALSE, r.get("ok"),
                "上一次催在 3 秒内，第 2 步的催应被冷却挡住；实际: " + r);
    }
}
