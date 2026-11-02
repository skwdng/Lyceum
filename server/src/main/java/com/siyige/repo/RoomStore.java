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

    public List<Map<String, Object>> seats(String code) {
        return lowerAll(jdbc.queryForList(
                "select seat_key,side,role,occupant,user_id,user_name,ready from sy_seat where room_code=? order by seat_key", code));
    }

    public Map<String, Object> seat(String code, String seatKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select seat_key,side,role,occupant,user_id,user_name,ready from sy_seat where room_code=? and seat_key=?",
                code, seatKey);
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

    public List<String> unreadyHumans(String code) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select user_name from sy_seat where room_code=? and occupant='USER' and ready=false", code);
        List<String> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(String.valueOf(r.get("user_name")));
        return out;
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
