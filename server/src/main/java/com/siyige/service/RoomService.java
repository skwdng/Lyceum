package com.siyige.service;

import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import com.siyige.service.MatchService;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 多人房间：建房 → 加入 → 准备 → 房主开局。
 * 本期用 REST + 轮询（前端 1s 拉一次）；WebSocket 广播是同一份状态，换通道不改状态机（规格 R-TECH-05）。
 */
@Service
public class RoomService {

    private final RoomStore rooms;
    private final Store store;
    private final MatchService matches;
    private final Random random = new Random();
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public RoomService(RoomStore rooms, Store store, MatchService matches) {
        this.rooms = rooms; this.store = store; this.matches = matches;
    }

    public String create(String topicId, String title, String visibility, String hostId, String hostName) {
        String tid = topicId;
        String ttitle = title;
        if (tid == null || tid.isBlank()) {
            Map<String, Object> t = store.topics(null, null).stream().findFirst().orElse(null);
            tid = t == null ? "t1" : String.valueOf(t.get("id"));
            ttitle = t == null ? "人工智能生成内容是否应当享有著作权" : String.valueOf(t.get("title"));
        } else {
            Map<String, Object> t = store.topic(tid);
            if (t != null) ttitle = String.valueOf(t.get("title"));
        }
        String code = newCode();
        rooms.createRoom(code, tid, ttitle, visibility == null ? "public" : visibility, hostId);
        // 房主自动坐 A1
        rooms.occupy(code, "A1", hostId, hostName == null ? "房主" : hostName);
        rooms.setReady(code, "A1", true);
        return code;
    }

    public Map<String, Object> join(String code, String userId, String userName) {
        Map<String, Object> room = require(code);
        if (!"LOBBY".equals(room.get("status"))) throw new IllegalStateException("ROOM_STARTED");
        String already = rooms.seatOfUser(code, userId);
        if (already != null) return detail(code, userId);
        String seat = rooms.firstEmpty(code);
        if (seat == null) throw new IllegalStateException("ROOM_FULL");
        rooms.occupy(code, seat, userId, userName == null ? "玩家" : userName);
        return detail(code, userId);
    }

    public void leave(String code, String userId) {
        String seat = rooms.seatOfUser(code, userId);
        if (seat != null) rooms.vacate(code, seat);
        List<String> humans = rooms.humanSeats(code);
        if (humans.isEmpty()) rooms.close(code);
    }

    public Map<String, Object> ready(String code, String userId, boolean ready) {
        String seat = rooms.seatOfUser(code, userId);
        if (seat == null) throw new IllegalStateException("NOT_IN_ROOM");
        rooms.setReady(code, seat, ready);
        return detail(code, userId);
    }

    public Map<String, Object> start(String code, String userId) throws Exception {
        Map<String, Object> room = require(code);
        if (!String.valueOf(room.get("host_user")).equals(userId)) throw new IllegalStateException("NOT_HOST");
        if (!"LOBBY".equals(room.get("status"))) throw new IllegalStateException("ROOM_STARTED");

        List<String> unready = rooms.unreadyHumans(code);
        // 房主自己免准备（R-READY-01）
        unready.removeIf(n -> n.equals("房主"));
        if (!unready.isEmpty()) throw new IllegalStateException("NOT_READY:" + String.join(",", unready));

        rooms.fillEmptyWithAi(code);
        List<String> humanSeats = rooms.humanSeats(code);
        String seats = String.join(",", humanSeats.isEmpty() ? List.of("A1") : humanSeats);
        String matchId = matches.create(userId, String.valueOf(room.get("topic_id")), seats, "FULL", 0, "normal", "pro", "room");
        rooms.setStatus(code, "RUNNING", matchId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("matchId", matchId);
        out.put("seats", seats);
        out.put("aiFilled", 8 - humanSeats.size());
        return out;
    }

    public Map<String, Object> detail(String code, String myUserId) {
        require(code);
        Map<String, Object> room = rooms.room(code);
        List<Map<String, Object>> seats = rooms.seats(code);
        List<String> unready = rooms.unreadyHumans(code);
        unready.removeIf(n -> n.equals("房主"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("room", room);
        out.put("seats", seats);
        out.put("host", room.get("host_user"));
        out.put("isHost", String.valueOf(room.get("host_user")).equals(myUserId));
        out.put("mySeat", rooms.seatOfUser(code, myUserId));
        out.put("unready", unready);
        out.put("canStart", unready.isEmpty() && "LOBBY".equals(room.get("status")));
        out.put("humans", rooms.humanSeats(code).size());
        return out;
    }

    public List<Map<String, Object>> publicRooms() { return rooms.publicRooms(); }

    private Map<String, Object> require(String code) {
        Map<String, Object> room = rooms.room(code);
        if (room == null) throw new IllegalArgumentException("ROOM_NOT_FOUND");
        return room;
    }

    private String newCode() {
        for (int attempt = 0; attempt < 50; attempt++) {
            StringBuilder sb = new StringBuilder("SY-");
            for (int i = 0; i < 4; i++) sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            String code = sb.toString();
            if (rooms.room(code) == null) return code;
        }
        return "SY-" + System.currentTimeMillis() % 10000;
    }
}
