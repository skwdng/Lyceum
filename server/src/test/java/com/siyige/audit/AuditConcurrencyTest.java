package com.siyige.audit;

import com.siyige.domain.Format;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 审计 ②：并发与幂等（同 step 双发、超时推进去重、废弃对局、抢拍席位、BUZZ 死锁、结算幂等）。
 *
 * <p>B1（逐步唯一性）+ B2（席位归属）修完后，本类里对应的用例已解禁并常绿；
 * 仍然 {@code @Disabled} 的只有「多实例」类问题（写在注释里）。
 */
class AuditConcurrencyTest extends AuditSupport {

    @Test
    @DisplayName("同一轮重复提交只能留下一条发言（B1：hasTurn 幂等 + updateStep CAS）")
    void 同一步双发会写出两条发言() throws Exception {
        String id = newMatch("A1", "solo");                 // 第 1 步 = A1 = 我

        Map<String, Object> first = service.submit(id, "第一版发言：我方认为应当取消期末考试。", "kb", USER);
        assertEquals(Boolean.TRUE, first.get("ok"));
        assertEquals(1, step(id), "第一次提交后应推进到第 2 步");

        // 模拟「第二个请求读到的是同一份旧快照」：把 step 拨回 0 再提交一次
        jumpTo(id, 0, "STEP", null);
        Map<String, Object> again = service.submit(id, "第二版发言：同一轮又发了一遍。", "kb", USER);

        assertEquals(Boolean.TRUE, again.get("ok"), "重试应该幂等成功，而不是报错: " + again);
        assertEquals(Boolean.TRUE, again.get("duplicate"), "要明确告诉调用方这是重复提交: " + again);
        assertEquals(1, turnCount(id, 1),
                "第 1 步出现了 " + turnCount(id, 1) + " 条发言（客户端重试/双击就会这样），计分与复盘都会重");
    }

    @Test
    @DisplayName("已废弃的对局不该再接受发言（B1：submit 加 status 闸门）")
    void 废弃对局仍接受发言() throws Exception {
        String id = newMatch("A1", "solo");
        store.finishMatch(id, "ABANDONED", 0);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.submit(id, "对局已经被回收了还在写。", "kb", USER),
                "status=ABANDONED 时 submit 应直接拒绝");
        assertTrue(ex.getMessage().contains("MATCH_NOT_RUNNING"), "实际: " + ex.getMessage());
        assertEquals(0, turnCount(id, 1), "废弃对局不该留下发言");
    }

    @Test
    @DisplayName("超时推进不能和玩家已提交的同一轮重复（B1：超时分支也查 hasTurn）")
    void 超时推进与已提交发言重复() throws Exception {
        String id = newMatch("A1", "solo");
        store.insertTurn(id, 1, "A1", "立论", "我先交了这段。", "OK", "kb");   // 玩家已提交

        expireDeadline(id);
        service.tick();

        assertEquals(1, turnCount(id, 1),
                "同一轮现在有 " + turnCount(id, 1) + " 条（玩家发言 + TIMEOUT），复盘会出现「说了两次」");
    }

    @Test
    @DisplayName("全真人一侧的自由辩窗口过期后必须能推进（B2：aiSeat==null 且已过期 → 判超时并推进）")
    void 自由辩全真人时超时卡死() throws Exception {
        // 正方四个席位全是真人 → 该侧没有 AI 可顶
        String id = newMatch("A1,A2,A3,A4", "room");
        int free = firstFreeDebateStep(id);
        assertTrue(free > 0, "赛制里应有自由辩步");

        jumpTo(id, free, "BUZZ", System.currentTimeMillis() - 5_000);
        assertNull(row(id).get("buzz_seat"), "前置：还没人抢到");

        service.tick();

        Format.Step cur = stepList(id).get(step(id));
        boolean stuck = "BUZZ".equals(String.valueOf(row(id).get("phase"))) && step(id) == free;
        assertFalse(stuck, "抢拍窗口已过期，却什么也没做：" + cur.seg() + " 停在 " + cur.seat() + "，phase 仍 BUZZ");
        assertEquals(free + 1, step(id), "应该判一次「抢拍超时」并推进到下一步");
        assertEquals(1, turnCount(id, free + 1), "超时也要留一条 TIMEOUT 记录给复盘");
    }

    @Test
    @DisplayName("抢拍把发言权给抢拍的人，而不是 my_seats 集合的第一个元素（B2：buzz 带 userId）")
    void 抢拍席位与轮转席位脱钩() throws Exception {
        // 房间局：有人坐 A1，我坐 B2
        String id = newMatch("A1,B2", "room");
        attachRoom(id, "R1", "B2");

        List<Format.Step> ss = stepList(id);
        int b2Step = -1, aStep = -1;
        for (int i = 0; i < ss.size(); i++) {
            if (!"自由辩".equals(ss.get(i).seg())) continue;
            if ("B2".equals(ss.get(i).seat()) && b2Step < 0) b2Step = i;
            if ("A2".equals(ss.get(i).seat()) && aStep < 0) aStep = i;
        }
        assertTrue(b2Step > 0 && aStep > 0, "应有 B2 / A2 的自由辩步");

        // ① 该我这一侧接话（B2）：抢到的是 B2
        jumpTo(id, b2Step, "BUZZ", System.currentTimeMillis() + 5_000);
        Map<String, Object> r = service.buzz(id, USER);
        assertEquals(Boolean.TRUE, r.get("ok"), "抢拍应成功: " + r);
        assertEquals("B2", String.valueOf(r.get("seat")), "应按抢拍者的真实席位定，而不是集合第一个");
        assertEquals("B2", String.valueOf(row(id).get("buzz_seat")), "buzz_seat 要写回库，submit 才会认这个 speaker");

        // ② 该对方接话时，我这侧不能抢
        jumpTo(id, aStep, "BUZZ", System.currentTimeMillis() + 5_000);
        Map<String, Object> denied = service.buzz(id, USER);
        assertEquals(Boolean.FALSE, denied.get("ok"), "A 方的自由辩步，B 方不该能抢: " + denied);
        assertTrue(String.valueOf(denied.get("reason")).contains("正方"), "实际: " + denied.get("reason"));
    }

    @Test
    @DisplayName("单实例下结算只发生一次（runningMatches 过滤掉 FINISHED）")
    void 单实例结算幂等_已正确() throws Exception {
        // 最后一步是 A4，把它算成我的席位，好让超时推进直接走到 finish
        String id = newMatch("A1,A4", "solo");
        List<Format.Step> ss = stepList(id);
        jumpTo(id, ss.size() - 1, "STEP", null);

        expireDeadline(id);
        service.tick();
        service.tick();

        assertEquals("FINISHED", String.valueOf(row(id).get("status")), "应正常结算");
        long records = jdbc.queryForObject("select count(*) from sy_record where match_id=?", Long.class, id);
        assertEquals(1L, records,
                "同一场只应有一条逐场记录；注意这只证明单实例安全——"
                        + "finish() 另有 CAS（update ... where status='RUNNING'）兜住两条路径并发的情况");
    }

    @Test
    @Disabled("多实例问题，不在 B1-B3 范围：generating/attempts 是进程内状态（MatchService.generating / attempts），"
            + "两台机器各自 tick 会各生成一次；要修得靠 DB 行锁或调度锁（ShedLock），不是单机代码能解决的")
    @DisplayName("同一对局的 AI 生成只应有一个在飞（跨实例也应成立）")
    void 生成锁只在本进程内有效() {
        // 有意留空：这条只能靠多实例部署 + 调度锁验证，单机 JUnit 无法复现
    }
}
