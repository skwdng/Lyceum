package com.siyige.api;

import com.siyige.auth.UserContext;
import com.siyige.auth.UserNames;
import com.siyige.repo.RoomStore;
import com.siyige.service.RoomService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 多人房间接口。
 *
 * <p><b>身份规则</b>：`userId` **一律不认请求里传的**，全部来自令牌
 * （{@link UserContext#requireId()}）。请求体里若还带 `userId`，**直接忽略**（不报错，老前端不会 400）。
 *
 * <p>鉴权：整个 `/api/rooms/**` 由 `debateJwtFilter` 要求登录（GET 也要）。
 * 房间是公开的 —— 任何登录用户都能看别人的房间，但**席位操作只作用于自己**。
 *
 * <p><b>昵称规则</b>：`userName` 也不认请求里传的，一律查 {@code sy_user.name}
 * （账号昵称）。席位显示同样走 `left join sy_user`，所以改了昵称下一个轮询周期就变。
 * 房主免准备按**座位 A1** 判断，不再拿"房主"这个字面量比名字。
 */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService rooms;
    private final RoomStore roomStore;
    /** 昵称统一从账号表取，请求里传的 userName 一律忽略。 */
    private final UserNames userNames;

    public RoomController(RoomService rooms, RoomStore roomStore, UserNames userNames) {
        this.rooms = rooms;
        this.roomStore = roomStore;
        this.userNames = userNames;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String topicId = body.get("topicId") == null ? null : String.valueOf(body.get("topicId"));
        String title = body.get("title") == null ? null : String.valueOf(body.get("title"));
        String vis = String.valueOf(body.getOrDefault("visibility", "public"));
        String uid = UserContext.requireId();                       // 身份只认令牌
        String name = userNames.name(uid);                          // 昵称查账号表，忽略 body.userName
        String code = rooms.create(topicId, title, vis, uid, name);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("detail", rooms.detail(code, uid));
        return out;
    }

    @GetMapping
    public List<Map<String, Object>> list() { return rooms.publicRooms(); }

    /** 看别人的房间可以（公开房），但要登录。 */
    @GetMapping("/{code}")
    public Map<String, Object> detail(@PathVariable String code) {
        return rooms.detail(code, UserContext.requireId());
    }

    @PostMapping("/{code}/join")
    public Map<String, Object> join(@PathVariable String code) {
        String uid = UserContext.requireId();                       // 身份只认令牌
        return rooms.join(code, uid, userNames.name(uid));           // 昵称查账号表
    }

    @PostMapping("/{code}/leave")
    public Map<String, Object> leave(@PathVariable String code) {
        rooms.leave(code, UserContext.requireId());
        return Map.of("ok", true);
    }

    @PostMapping("/{code}/ready")
    public Map<String, Object> ready(@PathVariable String code, @RequestBody Map<String, Object> body) {
        boolean ready = Boolean.TRUE.equals(body.get("ready"));
        return rooms.ready(code, UserContext.requireId(), ready);
    }

    @PostMapping("/{code}/start")
    public Map<String, Object> start(@PathVariable String code) throws Exception {
        return rooms.start(code, UserContext.requireId());
    }

    /** 调试：直接看席位原始行。 */
    @GetMapping("/{code}/seats")
    public List<Map<String, Object>> seats(@PathVariable String code) { return roomStore.seats(code); }
}
