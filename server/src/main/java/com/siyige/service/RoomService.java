package com.siyige.service;

import com.siyige.repo.RoomStore;
import com.siyige.repo.Store;
import com.siyige.service.MatchService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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

    /** 房主固定坐这个座位，因此**免准备**也按座位判断（R-READY-01）。 */
    private static final String HOST_SEAT = "A1";

    private final RoomStore rooms;
    private final Store store;
    private final MatchService matches;
    private final Random random = new Random();
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public RoomService(RoomStore rooms, Store store, MatchService matches) {
        this.rooms = rooms; this.store = store; this.matches = matches;
    }

    public String create(String topicId, String title, String visibility, String hostId, String hostName) {
        return create(topicId, title, visibility, hostId, hostName, HOST_SEAT);
    }

    /**
     * 建房并指定房主座位（用户反馈：建房时没法选辩论位置，只能被固定在 A1）。
     * 座位必须是 RoomStore.SEATS 里的 8 个之一，非法值回落到 A1。
     */
    public String create(String topicId, String title, String visibility, String hostId, String hostName,
                         String hostSeat) {
        String seat = hostSeat == null ? "" : hostSeat.trim().toUpperCase();
        boolean valid = false;
        for (String[] x : com.siyige.repo.RoomStore.SEATS) {
            if (x[0].equals(seat)) { valid = true; break; }
        }
        if (!valid) seat = HOST_SEAT;
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
        // 房主坐自己选的位置（默认 A1）
        rooms.occupy(code, seat, hostId, nameOr(hostName, hostId));
        rooms.setReady(code, seat, true);
        return code;
    }

    public Map<String, Object> join(String code, String userId, String userName) {
        return join(code, userId, userName, null);
    }

    /**
     * 加入房间，可选自己挑座位。
     *
     * <p>四条规则（都是用户反馈打出来的）：
     * <ol>
     *   <li><b>已经在房间里就幂等</b>：直接返回 detail，**不换座、不重复占位**——
     *       否则连点两次「加入」会把自己挪到另一个空位，队友看到的座位图会跳；</li>
     *   <li>不带 seat → 沿用 {@link RoomStore#firstEmpty}（兼容旧前端：优先补人少的一侧）；</li>
     *   <li>带 seat → 必须是 A1–B4 之一（否则 400 BAD_SEAT），且该座为空（否则 409 SEAT_TAKEN）；</li>
     *   <li>一个人一间房只能有一个席位：靠 user_id 反查兜住，不依赖前端自觉。</li>
     * </ol>
     */
    public Map<String, Object> join(String code, String userId, String userName, String seatRaw) {
        Map<String, Object> room = require(code);
        if (!"LOBBY".equals(room.get("status"))) throw new IllegalStateException("ROOM_STARTED");

        // ① 已在房间：幂等返回（不换座）
        String already = rooms.seatOfUser(code, userId);
        if (already != null) return detail(code, userId);

        String want = seatRaw == null ? "" : seatRaw.trim().toUpperCase();

        // ② 没指定座位：老逻辑，挑人少那一侧的第一个空位
        if (want.isEmpty()) {
            String seat = rooms.firstEmpty(code);
            if (seat == null) throw new IllegalStateException("ROOM_FULL");
            rooms.occupy(code, seat, userId, nameOr(userName, userId));
            return detail(code, userId);
        }

        // ③ 指定座位：先校验座位号，再看有没有人
        if (!validSeat(want)) throw new IllegalArgumentException("BAD_SEAT: 座位只能是 A1–B4");
        Map<String, Object> row = rooms.seat(code, want);
        if (row == null) throw new IllegalArgumentException("BAD_SEAT: 座位只能是 A1–B4");
        if (!"EMPTY".equals(String.valueOf(row.get("occupant"))))
            throw new IllegalStateException("SEAT_TAKEN: " + want + " 已经有人了");

        rooms.occupy(code, want, userId, nameOr(userName, userId));
        return detail(code, userId);
    }

    /** A1–B4 之外的都算非法座位。 */
    private static boolean validSeat(String seat) {
        for (String[] x : com.siyige.repo.RoomStore.SEATS) {
            if (x[0].equals(seat)) return true;
        }
        return false;
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

        List<String> unready = unreadyNames(code, room.get("host_user"));
        if (!unready.isEmpty()) throw new IllegalStateException("NOT_READY:" + String.join(",", unready));

        rooms.fillEmptyWithAi(code);
        List<String> humanSeats = rooms.humanSeats(code);
        String seats = String.join(",", humanSeats.isEmpty() ? List.of("A1") : humanSeats);
        // 多人房：整场费用由房主承担（payer 传房主），档位取房间设置（没设就 PRO）
        String tier = String.valueOf(room.getOrDefault("tier", "PRO"));
        String hostId = String.valueOf(room.get("host_user"));
        String matchId = matches.create(
                hostId, String.valueOf(room.get("topic_id")), seats, "FULL", 0, "normal", "pro", "room",
                tier, hostId);
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
        List<String> unready = unreadyNames(code, room.get("host_user"));

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

    /**
     * 未准备的人（昵称列表），**房主本人免准备**（房主可能坐任意一个位置）。
     *
     * <p>以前按「座位 A1」判断房主；房主可选座之后，必须按 host_user 比对，
     * 否则房主坐 B2 时会被算成未准备、房间永远开不了局。
     */
    private List<String> unreadyNames(String code, Object hostUser) {
        List<String> out = new ArrayList<>();
        String host = hostUser == null ? "" : String.valueOf(hostUser);
        for (Map<String, Object> row : rooms.unreadySeatRows(code)) {
            if (!host.isBlank() && host.equals(String.valueOf(row.get("user_id")))) continue;
            out.add(String.valueOf(row.get("user_name")));
        }
        return out;
    }

    /** 昵称为空时退回 userId，绝不再写「房主」/「玩家」这种假名字。 */
    private static String nameOr(String name, String userId) {
        return (name == null || name.isBlank()) ? userId : name;
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
