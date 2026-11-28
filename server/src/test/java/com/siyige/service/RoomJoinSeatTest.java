package com.siyige.service;

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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 加入房间时自己选座（一人一席）。
 *
 * <p>为什么要有它：以前加入只能被分配「人少那侧的第一个空位」，用户想跟朋友对位只能反复退出重进。
 * 现在支持 {@code {seat:"B2"}}，但必须挡住三类事故：抢已被占的座、一个人占两个座、
 * 以及连点两次「加入」把自己挪到别的座位。
 */
class RoomJoinSeatTest {

    private JdbcTemplate jdbc;
    private RoomStore rooms;
    private RoomService service;

    private static final String CODE = "SY-TEST";

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:roomseat" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-auth.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        rooms = new RoomStore(jdbc);
        Store store = mock(Store.class);
        service = new RoomService(rooms, store, mock(MatchService.class));

        // 现成的房：房主坐 A1
        rooms.createRoom(CODE, "t1", "高校是否应当取消期末考试", "public", "host01");
        rooms.occupy(CODE, "A1", "host01", "房主");
        rooms.setReady(CODE, "A1", true);
    }

    private List<Map<String, Object>> seats() {
        return rooms.seats(CODE);
    }

    private String seatOf(String userId) {
        return rooms.seatOfUser(CODE, userId);
    }

    private long seatsOf(String userId) {
        return seats().stream().filter(s -> userId.equals(String.valueOf(s.get("user_id")))).count();
    }

    @Test
    @DisplayName("指定空位加入成功，并且真的坐在那个位置")
    void 指定空位加入成功() {
        Map<String, Object> out = service.join(CODE, "u-b2", "小李", "B2");

        assertEquals("B2", seatOf("u-b2"), "必须坐在自己选的位置");
        assertEquals("B2", out.get("mySeat"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> seats = (List<Map<String, Object>>) out.get("seats");
        Map<String, Object> b2 = seats.stream().filter(s -> "B2".equals(s.get("seat_key"))).findFirst().orElseThrow();
        assertEquals("u-b2", b2.get("user_id"), "seat_key/occupant/user_id 要能支撑前端画选座图");
        assertEquals("USER", b2.get("occupant"));
        assertNotNull(b2.get("user_name"));

        // 小写也认（前端可能直接传座位的显示值）
        service.join(CODE, "u-a3", "小王", "a3");
        assertEquals("A3", seatOf("u-a3"), "座位号大小写不敏感");
    }

    @Test
    @DisplayName("座位已被占 → 409 SEAT_TAKEN，且不把原主人挤走")
    void 占座返回409() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.join(CODE, "u-x", "插队的", "A1"));
        assertTrue(ex.getMessage().startsWith("SEAT_TAKEN"), "实际: " + ex.getMessage());
        assertEquals("A1", seatOf("host01"), "原主人不能被挤走");
        assertEquals(null, seatOf("u-x"));

        // 先来后到：B2 被占了，第二个人再来也报 SEAT_TAKEN
        service.join(CODE, "u-first", "先来的", "B2");
        IllegalStateException again = assertThrows(IllegalStateException.class,
                () -> service.join(CODE, "u-second", "后来的", "B2"));
        assertTrue(again.getMessage().startsWith("SEAT_TAKEN"));
    }

    @Test
    @DisplayName("已经在房间里 → 幂等返回，不换座、不重复占位")
    void 已在房间幂等() {
        service.join(CODE, "u-b2", "小李", "B2");
        Map<String, Object> again = service.join(CODE, "u-b2", "小李", "A2");   // 想换座

        assertEquals("B2", seatOf("u-b2"), "已经在房间里就不该换座");
        assertEquals("B2", again.get("mySeat"));
        assertEquals(1L, seatsOf("u-b2"), "一个人只能占一个席位");
        assertEquals(null, seatOf("u-a2"), "原来的空位不能被顺手占掉");
    }

    @Test
    @DisplayName("一个房间一个人只有一个席位（多次不同 seat 也只会有一个）")
    void 一人一席() {
        service.join(CODE, "u-1", "小李");
        String first = seatOf("u-1");
        assertNotNull(first, "不带 seat 时按 firstEmpty 分配");

        service.join(CODE, "u-1", "小李", "B4");
        service.join(CODE, "u-1", "小李", "B3");

        assertEquals(1L, seatsOf("u-1"), "同一用户只能有一个席位");
        assertEquals(first, seatOf("u-1"), "位置不变");
        Integer occupied = jdbc.queryForObject(
                "select count(*) from sy_seat where room_code=? and user_id=?", Integer.class, CODE, "u-1");
        assertEquals(1, occupied);
    }

    @Test
    @DisplayName("非法座位号 → 400 BAD_SEAT")
    void 非法座位被拒() {
        for (String bad : new String[]{"C1", "A5", "B0", "A", "AB1", "9"}) {
            IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                    () -> service.join(CODE, "u-bad", "谁", bad), "应当拒绝: " + bad);
            assertTrue(ex.getMessage().startsWith("BAD_SEAT"), "实际: " + bad + " → " + ex.getMessage());
        }
        assertEquals(null, seatOf("u-bad"), "非法座位不能占位");

        // 首尾空白是手输的常见形态，归一后应当正常入座
        service.join(CODE, "u-trim", "谁", " B2 ");
        assertEquals("B2", seatOf("u-trim"));
    }

    @Test
    @DisplayName("房间已开局 → 不能再用选座加入")
    void 开局后不能加入() {
        rooms.setStatus(CODE, "RUNNING", "m-1");
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.join(CODE, "u-late", "迟到的", "B2"));
        assertTrue(ex.getMessage().startsWith("ROOM_STARTED"), "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("房间不存在 → ROOM_NOT_FOUND（ApiErrors 映射 404）")
    void 房间不存在() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.join("SY-NOPE", "u-1", "谁", "B2"));
        assertTrue(ex.getMessage().startsWith("ROOM_NOT_FOUND"), "实际: " + ex.getMessage());
    }
}
