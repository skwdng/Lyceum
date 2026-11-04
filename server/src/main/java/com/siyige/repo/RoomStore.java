package com.siyige.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 房间与席位。房间是 8 席，席位记录占位者、准备状态。 */
@Repository
public class RoomStore {

    public static final List<String[]> SEATS = List.of(
            new String[]{"A1", "A", "一辩"}, new String[]{"A2", "A", "二辩"},
            new String[]{"A3", "A", "三辩"}, new String[]{"A4", "A", "四辩"},
            new String[]{"B1", "B", "一辩"}, new String[]{"B2", "B", "二辩"},
            new String[]{"B3", "B", "三辩"}, new String[]{"B4", "B", "四辩"}
    );

    private final JdbcTemplate jdbc;

    public RoomStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Map<String, Object> lower(Map<String, Object> row) {
        Map<String, Object> out = new LinkedHashMap<>();
        row.forEach((k, v) -> out.put(k == null ? null : k.toLowerCase(), v));
        return out;
    }
    private static List<Map<String, Object>> lowerAll(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) out.add(lower(r));
        return out;
    }

    public void createRoom(String code, String topicId, String topicTitle, String visibility, String hostUser) {
        jdbc.update("insert into sy_room(code,topic_id,topic_title,visibility,host_user,status) values(?,?,?,?,?,'LOBBY')",
                code, topicId, topicTitle, visibility, hostUser);
        for (String[] s : SEATS) {
            jdbc.update("insert into sy_seat(room_code,seat_key,side,role,occupant,ready) values(?,?,?,?,'EMPTY',false)",
                    code, s[0], s[1], s[2]);
        }
    }

    public Map<String, Object> room(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_room where code=?", code);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    /**
     * 席位列表。
     *
     * <p><b>昵称取当前账号昵称</b>（`left join sy_user`），而不是 `sy_seat.user_name` 那个
     * "入座时的快照" —— 昵称可以在「我的」里随时改，读快照会显示旧名字。
     * `coalesce` 兜住三种情况：AI 席位（user_id 为 NULL）、账号已删的老数据。
     */
    public List<Map<String, Object>> seats(String code) {
        return lowerAll(jdbc.queryForList(
                "select s.seat_key, s.side, s.role, s.occupant, s.user_id, " +
                "       coalesce(u.name, s.user_name) as user_name, s.ready " +
                "  from sy_seat s left join sy_user u on u.id = s.user_id " +
                " where s.room_code = ? order by s.seat_key", code));
    }

    public Map<String, Object> seat(String code, String seatKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select s.seat_key, s.side, s.role, s.occupant, s.user_id, " +
                "       coalesce(u.name, s.user_name) as user_name, s.ready " +
                "  from sy_seat s left join sy_user u on u.id = s.user_id " +
                " where s.room_code = ? and s.seat_key = ?", code, seatKey);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public String firstEmpty(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select seat_key from sy_seat where room_code=? and occupant='EMPTY' order by seat_key limit 1", code);
        return rows.isEmpty() ? null : String.valueOf(rows.get(0).get("seat_key"));
    }

    public String seatOfUser(String code, String userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select seat_key from sy_seat where room_code=? and user_id=?", code, userId);
        return rows.isEmpty() ? null : String.valueOf(rows.get(0).get("seat_key"));
    }

    public void occupy(String code, String seatKey, String userId, String userName) {
        jdbc.update("update sy_seat set occupant='USER', user_id=?, user_name=?, ready=false where room_code=? and seat_key=?",
                userId, userName, code, seatKey);
    }

    public void setReady(String code, String seatKey, boolean ready) {
        jdbc.update("update sy_seat set ready=? where room_code=? and seat_key=?", ready, code, seatKey);
    }

    public void vacate(String code, String seatKey) {
        jdbc.update("update sy_seat set occupant='EMPTY', user_id=null, user_name=null, ready=false where room_code=? and seat_key=?",
                code, seatKey);
    }

    /** 开局：空位补 AI，真人保留。 */
    public int fillEmptyWithAi(String code) {
        return jdbc.update("update sy_seat set occupant='AI', user_name=name_placeholder where room_code=? and occupant='EMPTY'"
                .replace("name_placeholder", "concat('AI-', seat_key)"), code);
    }

    public List<String> humanSeats(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select seat_key from sy_seat where room_code=? and occupant='USER' order by seat_key", code);
        List<String> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(String.valueOf(r.get("seat_key")));
        return out;
    }

    /**
     * 没准备的真人：返回**座位号 + 昵称**。
     *
     * <p>为什么要带座位号：房主免准备必须**按座位（A1）判断**，
     * 不能像以前那样比 `user_name.equals("房主")` —— 昵称换成真账号昵称后，
     * 那句比较永远不成立，房主会把自己算成"未准备"，房间就永远开不了局。
     */
    public List<Map<String, Object>> unreadySeatRows(String code) {
        return lowerAll(jdbc.queryForList(
                "select s.seat_key, coalesce(u.name, s.user_name) as user_name, s.user_id " +
                "  from sy_seat s left join sy_user u on u.id = s.user_id " +
                " where s.room_code = ? and s.occupant = 'USER' and s.ready = false " +
                " order by s.seat_key", code));
    }

    public void setStatus(String code, String status, String matchId) {
        jdbc.update("update sy_room set status=?, match_id=? where code=?", status, matchId, code);
    }

    public List<Map<String, Object>> publicRooms() {
        return lowerAll(jdbc.queryForList(
                "select code,topic_title,status,host_user from sy_room where visibility='public' and status='LOBBY' order by created_at desc limit 20"));
    }

    public void close(String code) { setStatus(code, "CLOSED", null); }
}
