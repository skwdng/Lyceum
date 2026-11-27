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
 * <p>B3 修完后：冷却按 bigint 读（numLong）、记账走 CAS（setSkipIfNotSkipped）。
 * 仍 {@code @Disabled} 的两条是产品语义 / 生成队列问题，不在 B1-B3 范围。
 */
class AuditNudgeTest extends AuditSupport {

    // ---------- 已修：常绿 ----------

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
    @DisplayName("3 秒冷却真的挡住 0.5 秒内的第二次催（B3：last_skip_at 用 numLong 读）")
    void 冷却被int截断失效() throws Exception {
        String id = newMatch("B2", "solo");
        // 造出「上一轮刚催过 0.5 秒」的样子：skipped_step 不是当前步，只有冷却该生效
        jdbc.update("update sy_match set skipped_step=?, last_skip_at=? where id=?",
                -1, System.currentTimeMillis() - 500, id);

        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.FALSE, r.get("ok"), "0.5 秒内的第二次催应被冷却挡住，实际: " + r);
        assertTrue(String.valueOf(r.get("reason")).contains("别急"), "实际: " + r.get("reason"));
    }

    @Test
    @DisplayName("催过一轮之后，3 秒内不许再催下一步（B3：冷却 + CAS 记账）")
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

    @Test
    @DisplayName("轮到我自己说话时不允许催")
    void 自己回合不能催_已正确() throws Exception {
        String id = newMatch("A1", "solo");      // 第 1 步就是我的
        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.FALSE, r.get("ok"));
        assertTrue(String.valueOf(r.get("reason")).contains("轮到你说"), "实际: " + r);
    }

    // ---------- 不在 B1-B3 范围，保留 @Disabled ----------

    @Test
    @Disabled("产品语义待定，不在 B1-B3 范围：skip 只放行 kind=solo，房间局 AI 回合没法催。"
            + "放开要先定「多人局谁有权推进 AI 回合」，否则一个人催会改所有人的节奏")
    @DisplayName("房间局的 AI 回合也应可以催一下")
    void 房间局无法催() throws Exception {
        String id = newMatch("A1", "room");      // 第 1 步是 A1，但 kind=room
        Map<String, Object> r = service.skip(id);
        assertEquals(Boolean.TRUE, r.get("ok"),
                "房间局第 1 步是 A1（不是我的席位），却直接返回：" + r.get("reason"));
    }

    @Test
    @Disabled("不在 B1-B3 范围：skip 与生成线程池（generating/attempts）完全无交互，"
            + "AI 正在生成时催仍返回 ok=true；要做对得让 skip 感知 in-flight 生成（或改成取消+重启生成）")
    @DisplayName("AI 正在生成时催一下应明确告知「正在生成」而不是假装成功")
    void 生成中的假成功() throws Exception {
        String id = newMatch("B2", "solo");      // 第 1 步 A1，AI 回合
        expireDeadline(id);
        service.tick();
        Map<String, Object> r = service.skip(id);
        assertTrue(Boolean.FALSE.equals(r.get("ok")) || String.valueOf(r.get("reason")).contains("生成"),
                "AI 正在生成时不该返回「催成功」: " + r);
    }
}
