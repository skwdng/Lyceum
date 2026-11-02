package com.siyige.api;

import com.siyige.repo.RoomStore;
import com.siyige.service.RoomService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService rooms;
    private final RoomStore roomStore;

    public RoomController(RoomService rooms, RoomStore roomStore) {
        this.rooms = rooms; this.roomStore = roomStore;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String topicId = body.get("topicId") == null ? null : String.valueOf(body.get("topicId"));
        String title = body.get("title") == null ? null : String.valueOf(body.get("title"));
        String vis = String.valueOf(body.getOrDefault("visibility", "public"));
        String uid = String.valueOf(body.getOrDefault("userId", "u1"));
        String name = String.valueOf(body.getOrDefault("userName", "房主"));
        String code = rooms.create(topicId, title, vis, uid, name);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("detail", rooms.detail(code, uid));
        return out;
    }

    @GetMapping
    public List<Map<String, Object>> list() { return rooms.publicRooms(); }

    @GetMapping("/{code}")
    public Map<String, Object> detail(@PathVariable String code,
                                      @RequestParam(defaultValue = "u1") String userId) {
        return rooms.detail(code, userId);
    }

    @PostMapping("/{code}/join")
    public Map<String, Object> join(@PathVariable String code, @RequestBody(required = false) Map<String, Object> body) {
        String uid = body == null ? "u1" : String.valueOf(body.getOrDefault("userId", "u1"));
        String name = body == null ? "玩家" : String.valueOf(body.getOrDefault("userName", "玩家"));
        return rooms.join(code, uid, name);
    }

    @PostMapping("/{code}/leave")
    public Map<String, Object> leave(@PathVariable String code, @RequestBody(required = false) Map<String, Object> body) {
        String uid = body == null ? "u1" : String.valueOf(body.getOrDefault("userId", "u1"));
        rooms.leave(code, uid);
        return Map.of("ok", true);
    }

    @PostMapping("/{code}/ready")
    public Map<String, Object> ready(@PathVariable String code, @RequestBody Map<String, Object> body) {
        String uid = String.valueOf(body.getOrDefault("userId", "u1"));
        boolean ready = Boolean.TRUE.equals(body.get("ready"));
        return rooms.ready(code, uid, ready);
    }

    @PostMapping("/{code}/start")
    public Map<String, Object> start(@PathVariable String code, @RequestBody(required = false) Map<String, Object> body) throws Exception {
        String uid = body == null ? "u1" : String.valueOf(body.getOrDefault("userId", "u1"));
        return rooms.start(code, uid);
    }

    /** 调试：直接看席位原始行。 */
    @GetMapping("/{code}/seats")
    public List<Map<String, Object>> seats(@PathVariable String code) { return roomStore.seats(code); }
}
