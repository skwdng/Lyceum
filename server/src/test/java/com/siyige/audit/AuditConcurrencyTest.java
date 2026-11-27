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
    @DisplayName("自由辩不再有 BUZZ 阶段：窗口过期后按轮转推进（原死锁缺陷已随「关掉抢拍」消失）")
    void 自由辩全真人时超时卡死() throws Exception {
        // 正方四个席位全是真人——以前这里是死锁现场（该侧没有 AI 可顶，tick 直接 return）。
        // 2026-11-27 起自由辩不再进 BUZZ（MatchService.advance 里 isBuzz 恒 false），
        // 所以这一步就是普通一步：过期 → 记超时 → 推进。此用例改成锁「不再有 BUZZ」。
        String id = newMatch("A1,A2,A3,A4", "room");
        int free = firstFreeDebateStep(id);
        assertTrue(free > 0, "赛制里应有自由辩步");

        jumpTo(id, free, "STEP", System.currentTimeMillis() - 5_000);
        service.tick();

        Map<String, Object> m = row(id);
        assertEquals("STEP", String.valueOf(m.get("phase")), "自由辩不该出现 BUZZ 阶段");
        assertEquals(free + 1, step(id), "窗口过期后必须能推进（不卡住）");
        assertEquals(1, turnCount(id, free + 1), "超时也要留一条 TIMEOUT 记录给复盘");
    }

    @Test
    @DisplayName("抢拍接口保留，但正常推进下已无抢拍窗口")
    void 抢拍席位与轮转席位脱钩() throws Exception {
        // 抢占式自由辩已下线（详见 AuditOrderTest/产品决策），接口留着兼容老对局：
        // 现在 phase 永远是 STEP，调用直接返回「现在不是抢拍时间」。
        String id = newMatch("A1,B2", "room");
        attachRoom(id, "R1", "B2");
        int free = firstFreeDebateStep(id);
        jumpTo(id, free, "STEP", System.currentTimeMillis() + 5_000);

        Map<String, Object> r = service.buzz(id, USER);
        assertEquals(Boolean.FALSE, r.get("ok"), "没有 BUZZ 阶段就不该抢拍成功: " + r);
        assertTrue(String.valueOf(r.get("reason")).contains("抢拍"), "实际: " + r.get("reason"));
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
