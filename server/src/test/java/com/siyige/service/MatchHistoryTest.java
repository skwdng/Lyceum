package com.siyige.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.siyige.admin.config.ConfigKey;
import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.ai.AiService;
import com.siyige.ai.AiTier;
import com.siyige.api.SseHub;
import com.siyige.billing.UserLlmService;
import com.siyige.billing.WalletService;
import com.siyige.hot.HotRank;
import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 对局板块「已结束对局」（GET /api/matches/history）。
 *
 * <p>只读列表，锁四件事：
 * ① 只出 FINISHED（进行中/放弃的不能混进来）；② 只出我打过的（owner 或房间席位成员）；
 * ③ 最多 20 条；④ 按结束时间倒序，且 turns 是这场真实的发言条数。
 */
class MatchHistoryTest {

    private static final String TOPIC = "t1";
    private static final String ME = "u1";
    private static final String OTHER = "u2";

    private JdbcTemplate jdbc;
    private Store store;
    private RoomStore rooms;
    private MatchService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:history" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
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
        store.insertTopic(TOPIC, "高校是否应当取消期末考试", "教育", "basic", "official", "h1");

        ConfigService cfg = new ConfigService(new ConfigRepo(jdbc));
        cfg.set(ConfigKey.PACE_TIME_SCALE, "1.0", "admin");

        service = new MatchService(store, mock(AiService.class), new ScoreService(null),
                mock(HotRank.class), mock(SseHub.class), new FlawService(), new ObjectMapper(),
                cfg, new UtteranceCheck(),
                mock(WalletService.class), mock(UserLlmService.class), mock(AiTier.class),
                rooms);
    }

    private String newMatch(String userId, String kind, String seats) throws Exception {
        return service.create(userId, TOPIC, seats, "FULL", 0, "normal", "novice", kind, "PRO", null);
    }

    /** 造一场已结束的对局：指定结束时间与发言条数。 */
    private String finished(String userId, String kind, String seats, long finishedAtMs, int turns, int score)
            throws Exception {
        String id = newMatch(userId, kind, seats);
        for (int i = 0; i < turns; i++) {
            store.insertTurn(id, i + 1, seats.split(",")[0], "立论", "第 " + i + " 句发言。", "OK", "kb");
        }
        store.finishMatch(id, "FINISHED", score);
        jdbc.update("update sy_match set finished_at=?, started_at=? where id=?",
                new Timestamp(finishedAtMs), new Timestamp(finishedAtMs - 60_000), id);
        return id;
    }

    @Test
    @DisplayName("只出 FINISHED，且只出我打过的（房间局我是成员也能看到）")
    void 只出已结束的我的对局() throws Exception {
        String mine1 = finished(ME, "solo", "B2", System.currentTimeMillis() - 3_000, 2, 66);
        String others = finished(OTHER, "solo", "B2", System.currentTimeMillis() - 2_000, 1, 50);
        String running = newMatch(ME, "solo", "B2");                       // 还在打
        String abandoned = newMatch(ME, "solo", "B2");
        store.finishMatch(abandoned, "ABANDONED", 0);                       // 放弃的

        // 房间局：房主是别人，我是席位成员
        String code = "RH1";
        rooms.createRoom(code, TOPIC, "高校是否应当取消期末考试", "public", OTHER);
        rooms.occupy(code, "A1", OTHER, "Host");
        rooms.occupy(code, "B2", ME, "Me");
        String roomMatch = finished(OTHER, "room", "A1,B2", System.currentTimeMillis() - 1_000, 3, 71);
        rooms.setStatus(code, "RUNNING", roomMatch);

        List<Map<String, Object>> list = service.history(ME);
        List<String> ids = list.stream().map(m -> String.valueOf(m.get("matchId"))).toList();

        assertTrue(ids.contains(mine1), "自己 owner 的已结束对局必须在: " + ids);
        assertTrue(ids.contains(roomMatch), "我是席位成员的房间局必须能看到: " + ids);
        assertFalse(ids.contains(others), "别人的对局不能出现: " + ids);
        assertFalse(ids.contains(running), "进行中的不能出现: " + ids);
        assertFalse(ids.contains(abandoned), "放弃的不能出现: " + ids);
        assertEquals(2, ids.size(), "应当正好 2 条: " + ids);
    }

    @Test
    @DisplayName("按结束时间倒序，字段齐全（turns 是该场真实发言条数）")
    void 倒序与字段正确() throws Exception {
        long base = System.currentTimeMillis();
        String old = finished(ME, "solo", "B2", base - 5 * 60_000, 2, 55);
        String mid = finished(ME, "solo", "B2", base - 3 * 60_000, 0, 40);
        String fresh = finished(ME, "solo", "B2", base - 60_000, 7, 88);

        List<Map<String, Object>> list = service.history(ME);
        assertEquals(fresh, list.get(0).get("matchId"), "最近的排最前");
        assertEquals(mid, list.get(1).get("matchId"));
        assertEquals(old, list.get(2).get("matchId"));

        Map<String, Object> first = list.get(0);
        assertEquals("高校是否应当取消期末考试", first.get("topicTitle"));
        assertEquals("FULL", first.get("mode"));
        assertEquals("B2", first.get("mySeats"));
        assertEquals(88, first.get("totalScore"));
        assertEquals(7, first.get("turns"), "turns 必须是这场 sy_turn 的条数");
        assertTrue(first.get("finishedAt") instanceof Number, "finishedAt 用 epoch 毫秒");
        assertEquals(base - 60_000, ((Number) first.get("finishedAt")).longValue(), 5_000L,
                "finishedAt 应当就是库里的结束时间");

        assertEquals(0, list.get(1).get("turns"), "一句没说的对局 turns=0");
    }

    @Test
    @DisplayName("最多 20 条（超出部分不返回，且留下的是最近 20 场）")
    void 最多二十条() throws Exception {
        long base = System.currentTimeMillis();
        for (int i = 0; i < 25; i++) {
            finished(ME, "solo", "B2", base - i * 60_000L, 1, 60);   // i 越大越早
        }

        List<Map<String, Object>> list = service.history(ME);
        assertEquals(20, list.size(), "最多 20 条，实际 " + list.size());

        // 留下的是最近 20 场：第一条是刚造的（i=0），最后一条是 i=19
        long newest = ((Number) list.get(0).get("finishedAt")).longValue();
        long oldest = ((Number) list.get(list.size() - 1).get("finishedAt")).longValue();
        assertEquals(base, newest, 5_000L);
        assertTrue(oldest >= base - 19 * 60_000L - 5_000L, "第 20 条应当是 i=19 那场，实际 finishedAt=" + oldest);
    }

    @Test
    @DisplayName("老数据没有 finished_at：用 started_at 兜底排序，不会全挤在 1970")
    void 老数据按startedAt兜底() throws Exception {
        String legacy = newMatch(ME, "solo", "B2");
        store.finishMatch(legacy, "FINISHED", 30);
        jdbc.update("update sy_match set finished_at=null, started_at=? where id=?",
                new Timestamp(System.currentTimeMillis() - 10 * 60_000L), legacy);

        String fresh = finished(ME, "solo", "B2", System.currentTimeMillis() - 60_000, 1, 70);

        List<Map<String, Object>> list = service.history(ME);
        assertEquals(fresh, list.get(0).get("matchId"), "有 finished_at 的排在前面");
        assertEquals(legacy, list.get(1).get("matchId"));

        Map<String, Object> legacyRow = list.get(1);
        long finishedAt = ((Number) legacyRow.get("finishedAt")).longValue();
        assertTrue(finishedAt > 0, "老数据的 finishedAt 不能是 0（前端会显示 1970）");
        assertNotNull(legacyRow.get("turns"));
    }

    @Test
    @DisplayName("没打过任何对局 → 空数组，不报错")
    void 空历史() {
        List<Map<String, Object>> list = service.history("nobody");
        assertNotNull(list);
        assertTrue(list.isEmpty(), "没有对局就是空数组");
    }
}
