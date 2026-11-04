package com.siyige.service;

import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * D3：房间昵称改造 + 房主判断改按席位（真实 H2，跑 schema.sql）。
 *
 * <p>核心回归：**「房主免准备」不能靠 `user_name.equals("房主")`**。
 * 昵称换成账号昵称后那句永远不成立，房主会把自己算成"未准备"，
 * 房间就永远开不了局。这里用"把 A1 的 ready 手动置 false 再开局"来钉住这个 bug。
 */
class RoomNicknameTest {

    private JdbcTemplate jdbc;
    private RoomStore roomStore;
    private RoomService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:roomnick" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            // sy_user 的 account / password_hash / status 三列在 schema-auth.sql 里（增量）
            for (String f : new String[]{"schema.sql", "schema-auth.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        roomStore = new RoomStore(jdbc);

        Store store = mock(Store.class);
        when(store.topic("t1")).thenReturn(Map.of("id", "t1", "title", "人工智能生成内容是否应享有著作权"));

        MatchService matches = mock(MatchService.class);
        when(matches.create(anyString(), anyString(), anyString(), anyString(), anyInt(),
                anyString(), anyString(), anyString())).thenReturn("m-room-1");

        service = new RoomService(roomStore, store, matches);

        user("zhang01", "张同学");
        user("li02", "李同学");
    }

    private void user(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status) values(?, ?, ?, 'x', 1)",
                id, name, id);
    }

    private Map<String, Object> seatRow(String code, String seatKey) {
        return roomStore.seat(code, seatKey);
    }

    private String createRoom(String hostId, String hostName) {
        return service.create("t1", null, "public", hostId, hostName);
    }

    // ==================== 昵称 ====================

    @Test
    void 席位显示账号昵称而不是入座时的快照() {
        String code = createRoom("zhang01", "张同学");

        assertEquals("张同学", seatRow(code, "A1").get("user_name"));
        assertEquals("zhang01", seatRow(code, "A1").get("user_id"));
    }

    @Test
    void 改了昵称席位下一个查询就变() {
        String code = createRoom("zhang01", "张同学");

        jdbc.update("update sy_user set name = '张三' where id = 'zhang01'");

        assertEquals("张三", seatRow(code, "A1").get("user_name"),
                "席位读的是 sy_user.name（join），不是入座时写死的快照");
    }

    @Test
    void AI席位靠快照兜底显示() {
        String code = createRoom("zhang01", "张同学");
        roomStore.fillEmptyWithAi(code);

        Map<String, Object> aiSeat = seatRow(code, "B4");
        assertEquals("AI", aiSeat.get("occupant"));
        assertNull(aiSeat.get("user_id"), "AI 没有 user_id，join 不到，必须靠 user_name 兜底");
        assertEquals("AI-B4", aiSeat.get("user_name"));
    }

    @Test
    void 账号被删后席位退回入座时的快照名() {
        String code = createRoom("zhang01", "张同学");
        jdbc.update("delete from sy_user where id = 'zhang01'");

        assertEquals("张同学", seatRow(code, "A1").get("user_name"), "join 不到就用快照兜底");
    }

    @Test
    void 昵称为空时快照退回userId_显示仍是账号昵称() {
        String code = createRoom("zhang01", null);

        // ① 落库的快照列：兜底是真实标识 userId，不再写「房主」这种假名字
        String snapshot = jdbc.queryForObject(
                "select user_name from sy_seat where room_code = ? and seat_key = 'A1'", String.class, code);
        assertEquals("zhang01", snapshot);

        // ② 对外的显示：join 优先取账号昵称，所以仍然是「张同学」
        assertEquals("张同学", seatRow(code, "A1").get("user_name"));
    }

    // ==================== 房主免准备（按 A1 判） ====================

    @Test
    void 房主未准备也能开局_因为免准备按座位A1判断() throws Exception {
        String code = createRoom("zhang01", "张同学");
        // 故意把房主也置为未准备：验证豁免逻辑不再依赖名字
        roomStore.setReady(code, "A1", false);

        Map<String, Object> out = service.start(code, "zhang01");

        assertNotNull(out.get("matchId"));
        assertEquals("m-room-1", out.get("matchId"));
    }

    @Test
    void 非房主没准备时开不了局_且提示里是昵称() {
        String code = createRoom("zhang01", "张同学");
        roomStore.setReady(code, "A1", false);
        service.join(code, "li02", "李同学");        // 加入但不准备

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.start(code, "zhang01"));

        assertTrue(e.getMessage().startsWith("NOT_READY:"), e.getMessage());
        assertTrue(e.getMessage().contains("李同学"), "提示应带昵称：" + e.getMessage());
        assertFalse(e.getMessage().contains("张同学"), "房主不该出现在未准备名单里：" + e.getMessage());
    }

    @Test
    void 全员准备后房主能开局() throws Exception {
        String code = createRoom("zhang01", "张同学");
        service.join(code, "li02", "李同学");
        service.ready(code, "li02", true);

        assertNotNull(service.start(code, "zhang01").get("matchId"));
    }

    @Test
    void 非房主不能开局() {
        String code = createRoom("zhang01", "张同学");
        service.join(code, "li02", "李同学");

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> service.start(code, "li02"));
        assertEquals("NOT_HOST", e.getMessage());
    }

    // ==================== detail 契约不变 ====================

    @Test
    void detail的unready仍是昵称数组_房主不在其中() {
        String code = createRoom("zhang01", "张同学");
        roomStore.setReady(code, "A1", false);
        service.join(code, "li02", "李同学");

        Map<String, Object> d = service.detail(code, "zhang01");

        assertEquals(List.of("李同学"), d.get("unready"), "对外仍是昵称数组（契约不变）");
        assertEquals(false, d.get("canStart"));
        assertEquals(true, d.get("isHost"));
        assertEquals("A1", d.get("mySeat"));
    }

    @Test
    void 都准备好后canStart为真() {
        String code = createRoom("zhang01", "张同学");
        roomStore.setReady(code, "A1", false);
        service.join(code, "li02", "李同学");
        service.ready(code, "li02", true);

        Map<String, Object> d = service.detail(code, "zhang01");

        assertEquals(List.of(), d.get("unready"));
        assertEquals(true, d.get("canStart"));
    }

    @Test
    void 席位列表里能看到两个人的昵称() {
        String code = createRoom("zhang01", "张同学");
        service.join(code, "li02", "李同学");

        List<Map<String, Object>> seats = roomStore.seats(code);
        String a1 = String.valueOf(seats.stream().filter(s -> "A1".equals(s.get("seat_key")))
                .findFirst().orElseThrow().get("user_name"));
        String a2 = String.valueOf(seats.stream().filter(s -> "A2".equals(s.get("seat_key")))
                .findFirst().orElseThrow().get("user_name"));

        assertEquals("张同学", a1);
        assertEquals("李同学", a2);
    }
}
