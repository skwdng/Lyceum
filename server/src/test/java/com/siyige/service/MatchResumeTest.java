package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.AiTier;
import com.siyige.api.SseHub;
import com.siyige.auth.AuthException;
import com.siyige.auth.MatchAccess;
import com.siyige.billing.UserLlmService;
import com.siyige.billing.WalletService;
import com.siyige.domain.Format;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 单人页「进行中的对局」+ 房间局「重新加入继续打」。
 *
 * <p>锁三件事：
 * <ul>
 *   <li>列表只出 RUNNING、只出跟我有关的（owner 或房间席位），并按活跃时间倒序；</li>
 *   <li>删除是幂等的收尾：删完不能再提交，列表里也不再出现；</li>
 *   <li>continue-solo 只动 kind/my_seats，**步数不倒退**，历史发言保留，之后能接着打（其余席位由 AI 说）。</li>
 * </ul>
 */
class MatchResumeTest {

    private static final String TOPIC = "t1";
    private static final String ME = "u1";
    private static final String OTHER = "u2";

    private JdbcTemplate jdbc;
    private Store store;
    private RoomStore rooms;
    private MatchService service;
    private MatchAccess access;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:resume" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        store = new Store(jdbc);
        rooms = new RoomStore(jdbc);
        access = new MatchAccess(jdbc);
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        service = new MatchService(store, mock(AiService.class), new ScoreService(null),
                mock(HotRank.class), mock(SseHub.class), new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                rooms);
    }

    /** 单人局：我坐 B2 → 第 1 步是 A1（AI），第 4 步是 B2（我）。 */
    private String solo(String userId) throws Exception {
        return service.create(userId, TOPIC, "B2", "FULL", 0, "normal", "novice", "solo", "PRO", null);
    }

    /** 房间局：房主坐 A1，我坐 B2。 */
    private String room(String host, String mySeat) throws Exception {
        String code = "R" + UUID.randomUUID().toString().substring(0, 5);
        rooms.createRoom(code, TOPIC, "高校是否应当取消期末考试", "public", host);
        rooms.occupy(code, "A1", host, "Host");
        rooms.occupy(code, mySeat, ME, "Me");
        String id = service.create(host, TOPIC, "A1,B2", "FULL", 0, "normal", "novice", "room", "PRO", null);
        rooms.setStatus(code, "RUNNING", id);
        return id;
    }

    private Map<String, Object> row(String id) {
        return store.match(id);
    }

    // ---------- ① 列表 ----------

    @Test
    @DisplayName("列表只出 RUNNING，且只出我的（owner 的 + 我在席位上的房间局）")
    void 列表只出进行中的我的对局() throws Exception {
        String mine1 = solo(ME);
        String mine2 = solo(ME);
        String others = solo(OTHER);
        String roomMine = room(OTHER, "B2");        // 房主是别人，但我是席位成员
        String closed = solo(ME);
        store.finishMatch(closed, "FINISHED", 80);

        List<Map<String, Object>> list = service.mine(ME);
        List<String> ids = list.stream().map(m -> String.valueOf(m.get("matchId"))).toList();

        assertTrue(ids.contains(mine1) && ids.contains(mine2), "我自己的进行中对局必须在: " + ids);
        assertTrue(ids.contains(roomMine), "我在席位上的房间局必须在: " + ids);
        assertFalse(ids.contains(others), "别人的对局不能出现: " + ids);
        assertFalse(ids.contains(closed), "已结束时不该出现: " + ids);
        assertEquals(3, ids.size(), "应当正好 3 条: " + ids);

        Map<String, Object> roomRow = list.stream()
                .filter(m -> roomMine.equals(m.get("matchId"))).findFirst().orElseThrow();
        assertNotNull(roomRow.get("roomCode"), "房间局要带 roomCode，前端据此显示房间");
        assertEquals("room", roomRow.get("kind"));
        // 轮数是开局随机的，期望值要按这一场自己的 query_rounds/free_rounds 算
        Map<String, Object> roomMatch = row(roomMine);
        int q = ((Number) roomMatch.get("query_rounds")).intValue();
        int f = ((Number) roomMatch.get("free_rounds")).intValue();
        assertEquals(Format.stepsOf("FULL", q, f).size(), roomRow.get("totalSteps"),
                "totalSteps 必须等于这一场的真实步数");

        Map<String, Object> soloRow = list.stream()
                .filter(m -> mine1.equals(m.get("matchId"))).findFirst().orElseThrow();
        assertEquals(null, soloRow.get("roomCode"), "单人局 roomCode 为 null");
        assertEquals(1, soloRow.get("step"), "step 是 1-based 的当前步号");
        assertEquals(0, soloRow.get("stepIndex"), "stepIndex 是库里的 0-based");
        assertEquals("RUNNING", soloRow.get("status"));
        assertTrue(soloRow.get("updatedAt") instanceof Number, "updatedAt 用 epoch 毫秒");
    }

    @Test
    @DisplayName("列表按活跃时间倒序")
    void 列表按活跃时间倒序() throws Exception {
        String old = solo(ME);
        String fresh = solo(ME);
        jdbc.update("update sy_match set last_active_at=? where id=?", 1_000L, old);
        jdbc.update("update sy_match set last_active_at=? where id=?", 2_000L, fresh);

        List<Map<String, Object>> list = service.mine(ME);
        assertEquals(fresh, list.get(0).get("matchId"), "最后活跃的排前面");
        assertEquals(old, list.get(1).get("matchId"));
    }

    // ---------- ② 删除 ----------

    @Test
    @DisplayName("删除后不可再提交，列表里也不再出现；重复删除幂等")
    void 删除后不可再提交() throws Exception {
        String id = solo(ME);

        Map<String, Object> r = service.abandon(id);
        assertEquals(Boolean.TRUE, r.get("ok"));
        assertEquals("ABANDONED", r.get("status"));
        assertEquals("ABANDONED", String.valueOf(row(id).get("status")));

        // 已废弃：不能再写发言
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.submit(id, "删了还能说话？", "kb", ME));
        assertTrue(ex.getMessage().contains("MATCH_NOT_RUNNING"), "实际: " + ex.getMessage());

        // 列表里不再出现
        assertTrue(service.mine(ME).stream().noneMatch(m -> id.equals(m.get("matchId"))));

        // 幂等：再删一次返回原状态，不报错
        Map<String, Object> again = service.abandon(id);
        assertEquals(Boolean.TRUE, again.get("ok"));
        assertEquals("ABANDONED", again.get("status"));
    }

    @Test
    @DisplayName("删除不存在的对局 → IllegalArgumentException（映射 404）；非成员 → 403")
    void 删除的权限与不存在() {
        assertThrows(IllegalArgumentException.class, () -> service.abandon("no-such-match"),
                "不存在的对局要抛 IllegalArgumentException（ApiErrors 会映射成 404）");

        String id;
        try {
            id = solo(ME);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        AuthException ex = assertThrows(AuthException.class, () -> access.requireAccess(id, OTHER));
        assertEquals(HttpStatus.FORBIDDEN, ex.status(), "非 owner 且不在房间席位 → 403");
    }

    // ---------- ③ 重新加入继续打 ----------

    @Test
    @DisplayName("continue-solo：kind=solo、my_seats=我的席位、步数不变，之后能继续打并推进")
    void 房间局重新加入后继续打() throws Exception {
        String id = room(OTHER, "B2");
        // 打到第 4 步（B2 是我的回合）再走人
        jdbc.update("update sy_match set step=3 where id=?", id);
        store.insertTurn(id, 1, "A1", "立论", "房主的立论。", "OK", "ai");
        store.insertTurn(id, 2, "B1", "立论", "别人的立论。", "OK", "kb");

        Map<String, Object> r = service.continueSolo(id, ME);
        assertEquals(Boolean.TRUE, r.get("ok"), "实际: " + r);
        assertEquals("solo", r.get("kind"));
        assertEquals("B2", r.get("mySeats"));
        assertEquals(4, r.get("step"), "步数必须停在原地，不能倒退也不能跳");

        Map<String, Object> m = row(id);
        assertEquals("solo", String.valueOf(m.get("kind")));
        assertEquals("B2", String.valueOf(m.get("my_seats")), "只留我的席位 → 其余席位以后都由 AI 说");
        assertEquals("STEP", String.valueOf(m.get("phase")));
        assertEquals(null, m.get("buzz_seat"), "抢拍状态要清干净");
        assertEquals(3, ((Number) m.get("step")).intValue(), "库里的 step 不变");
        assertEquals(null, m.get("deadline_at"), "我的回合 = 单人规则 = 不限时");

        // 历史发言还在（不是重开一场）
        assertEquals(2, store.turns(id).size(), "之前的发言不能丢");

        // 能接着打：第 4 步我发言 → 推进到第 5 步
        service.submit(id, "我方继续：取消期末考试的前提是替代评价同样刚性。", "kb", ME);
        assertEquals(4, ((Number) row(id).get("step")).intValue(), "提交后推进到下一步");
        assertEquals(3, store.turns(id).size(), "我的发言也落库了");
    }

    @Test
    @DisplayName("continue-solo 对单人局是幂等的")
    void 单人局重复续打幂等() throws Exception {
        String id = solo(ME);
        Map<String, Object> r = service.continueSolo(id, ME);
        assertEquals(Boolean.TRUE, r.get("ok"));
        assertEquals("solo", r.get("kind"));
        assertEquals("B2", r.get("mySeats"));
        assertEquals(1, r.get("step"));
    }

    @Test
    @DisplayName("已结束的对局不能再 continue-solo")
    void 已结束不能续打() throws Exception {
        String id = solo(ME);
        service.abandon(id);
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.continueSolo(id, ME));
        assertTrue(ex.getMessage().contains("MATCH_NOT_RUNNING"), "实际: " + ex.getMessage());
    }

    // ---------- ④ 房间局交接间隔 ----------

    @Test
    @DisplayName("房间局两个真人之间至少隔 1.5 秒（上一位落库 → 下一位可开口）")
    void 房间局交接至少隔一秒半() throws Exception {
        // 我占 B2、B3 两个席位；不带 userId 走老客户端路径（跳过席位反查，只验交接闸门）
        String id = service.create(OTHER, TOPIC, "B2,B3", "FULL", 0, "normal", "novice", "room", "PRO", null);
        jdbc.update("update sy_match set step=3 where id=?", id);          // 第 4 步 = B2
        assertEquals(Boolean.TRUE, service.submit(id, "我方先答这一轮。", "kb", null).get("ok"));

        jdbc.update("update sy_match set step=5 where id=?", id);          // 第 6 步 = B3，仍是我的席位
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.submit(id, "马上又接一句。", "kb", null),
                "上一句刚落库不到 1.5 秒，这一句应当被挡住");
        assertTrue(ex.getMessage().contains("HANDOFF_WAIT"), "实际: " + ex.getMessage());

        Thread.sleep(1_700);
        Map<String, Object> ok = service.submit(id, "等够了再说。", "kb", null);
        assertEquals(Boolean.TRUE, ok.get("ok"), "过 1.5 秒就该放行: " + ok);
    }
}
