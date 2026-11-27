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
 * 审计 ②：并发与幂等（同 step 双发、超时推进去重、废弃对局、抢拍席位、BUZZ 死锁）。
 *
 * <p>{@code @Disabled} = 现在的实现确实会踩，断言的是期望语义。**待修复后启用**。
 */
class AuditConcurrencyTest extends AuditSupport {

    @Test
    @Disabled("待修复后启用：submit 不查 hasTurn、updateStep 无 CAS（where step=?），同一快照的两次提交会写两条发言")
    @DisplayName("同一轮重复提交只能留下一条发言")
    void 同一步双发会写出两条发言() throws Exception {
        String id = newMatch("A1", "solo");                 // 第 1 步 = A1 = 我

        service.submit(id, "第一版发言：我方认为应当取消期末考试。", "kb", USER);
        assertEquals(1, step(id), "第一次提交后应推进到第 2 步");

        // 模拟「第二个请求读到的是同一份旧快照」：把 step 拨回 0 再提交一次
        jumpTo(id, 0, "STEP", null);
        service.submit(id, "第二版发言：同一轮又发了一遍。", "kb", USER);

        assertEquals(1, turnCount(id, 1),
                "第 1 步出现了 " + turnCount(id, 1) + " 条发言（客户端重试/双击就会这样），计分与复盘都会重");
    }

    @Test
    @Disabled("待修复后启用：submit 不校验 status，ABANDONED/FINISHED 的对局仍能写入发言并继续推进")
    @DisplayName("已废弃的对局不该再接受发言")
    void 废弃对局仍接受发言() throws Exception {
        String id = newMatch("A1", "solo");
        store.finishMatch(id, "ABANDONED", 0);

        assertThrows(IllegalStateException.class,
                () -> service.submit(id, "对局已经被回收了还在写。", "kb", USER),
                "status=ABANDONED 时 submit 应直接拒绝；实际会 insertTurn 并 emit step");
        assertEquals(0, turnCount(id, 1), "废弃对局不该留下发言");
    }

    @Test
    @Disabled("待修复后启用：tickOne 的超时分支直接 insertTurn，没有 hasTurn 去重（submitAi 那条路径有）")
    @DisplayName("超时推进不能和玩家已提交的同一轮重复")
    void 超时推进与已提交发言重复() throws Exception {
        String id = newMatch("A1", "solo");
        store.insertTurn(id, 1, "A1", "立论", "我先交了这段。", "OK", "kb");   // 玩家已提交

        expireDeadline(id);
        service.tick();

        assertEquals(1, turnCount(id, 1),
                "同一轮现在有 " + turnCount(id, 1) + " 条（玩家发言 + TIMEOUT），复盘会出现「说了两次」");
    }

    @Test
    @Disabled("待修复后启用：自有席位的自由辩超时后 pickAiSeat 返回 null，tickOne 直接 return，对局永久停在 BUZZ")
    @DisplayName("全真人一侧的自由辩窗口过期后必须能推进（现在会卡死到 15 分钟僵尸回收）")
    void 自由辩全真人时超时卡死() throws Exception {
        // 正方四个席位全是真人 → 该侧没有 AI 可顶
        String id = newMatch("A1,A2,A3,A4", "room");
        int free = firstFreeDebateStep(id);
        assertTrue(free > 0, "赛制里应有自由辩步");

        jumpTo(id, free, "BUZZ", System.currentTimeMillis() - 5_000);
        assertNull(row(id).get("buzz_seat"), "前置：还没人抢到");

        service.tick();
        service.tick();

        Format.Step cur = stepList(id).get(step(id));
        boolean stuck = "BUZZ".equals(String.valueOf(row(id).get("phase"))) && step(id) == free;
        assertFalse(stuck, "抢拍窗口已过期，tick 却什么也没做：" + cur.seg() + " 停在 " + cur.seat()
                + "，phase 仍 BUZZ —— 只能等 reapAbandoned 15 分钟后判 ABANDONED");
    }

    @Test
    @Disabled("待修复后启用：buzz() 没有 userId 参数，席位取 my_seats 集合的第一个元素，与本步轮转席位/抢拍者无关")
    @DisplayName("抢拍应把发言权给抢拍的人（或至少给本步轮转席位）")
    void 抢拍席位与轮转席位脱钩() throws Exception {
        // 房间局：两个真人分别坐 A1、B2
        String id = newMatch("A1,B2", "room");
        List<Format.Step> ss = stepList(id);
        int b2Step = -1;
        for (int i = 0; i < ss.size(); i++) {
            if ("自由辩".equals(ss.get(i).seg()) && "B2".equals(ss.get(i).seat())) { b2Step = i; break; }
        }
        assertTrue(b2Step > 0, "应有 B2 的自由辩步");

        jumpTo(id, b2Step, "BUZZ", System.currentTimeMillis() + 5_000);
        Map<String, Object> r = service.buzz(id);

        assertEquals(Boolean.TRUE, r.get("ok"), "抢拍应成功: " + r);
        assertEquals("B2", String.valueOf(r.get("seat")),
                "本步轮转席位是 B2，抢到的却是 " + r.get("seat")
                        + "（= my_seats 集合的第一个元素）；真人 B2 随后 submit 会被 NOT_YOUR_TURN 拒掉");
        assertEquals("B2", String.valueOf(row(id).get("buzz_seat")));
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
                "同一场只应有一条逐场记录；注意这只证明单实例安全——finish() 本身没有 status 守卫，"
                        + "两条推进路径（提交 / tick 超时）并发到最后一步时会各结算一次");
    }
}
