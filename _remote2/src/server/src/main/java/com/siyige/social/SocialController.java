package com.siyige.social;

import com.siyige.auth.UserContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 社交接口（V1：好友关系与请求）。
 *
 * <p>身份一律从 {@link UserContext#require()} 取 —— 它不是请求体/查询参数里的东西，
 * 而是 {@code JwtAuthFilter} 验完令牌塞进来的。前端伪造不了。
 *
 * <p>{@code /api/social/**} 在 {@code AuthFilterConfig} 里注册了过滤器（**全部方法都要登录**），
 * 所以这里的 require() 实际只兜「过滤器被摘掉」的极端情况。
 *
 * <p>V2 会在这个类里追加会话与消息接口（同一份契约文件里编号 8~12）。
 */
@RestController
@RequestMapping("/api/social")
public class SocialController {

    private final FriendService friends;
    private final ChatService chat;

    public SocialController(FriendService friends, ChatService chat) {
        this.friends = friends;
        this.chat = chat;
    }

    // ==================== 搜人 ====================

    /** 搜人：先按 id/account 精确，再按昵称模糊；AI 账号永不出现。 */
    @GetMapping("/users")
    public Map<String, Object> users(@RequestParam(required = false) String q) {
        return friends.search(UserContext.require(), q);
    }

    // ==================== 好友请求 ====================

    /** 发好友请求 {@code {toId, note?}}。双向互发时直接返回 {@code status=ACCEPTED}。 */
    @PostMapping("/friends/requests")
    public Map<String, Object> request(@RequestBody(required = false) Map<String, Object> body) {
        String me = UserContext.require();
        return friends.request(me, str(body, "toId"), str(body, "note"));
    }

    /** 我收到的待处理请求。 */
    @GetMapping("/friends/requests")
    public Map<String, Object> pending() {
        return friends.pendingRequests(UserContext.require());
    }

    @PostMapping("/friends/requests/{id}/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void accept(@PathVariable long id) {
        friends.accept(UserContext.require(), id);
    }

    @PostMapping("/friends/requests/{id}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(@PathVariable long id) {
        friends.reject(UserContext.require(), id);
    }

    // ==================== 好友列表 / 删除 ====================

    @GetMapping("/friends")
    public Map<String, Object> list() {
        return friends.friends(UserContext.require());
    }

    /** 删除好友：双向解除，历史消息保留；之后发消息会 403 NOT_FRIEND。 */
    @DeleteMapping("/friends/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String userId) {
        friends.delete(UserContext.require(), userId);
    }

    // ==================== 会话与消息（V2） ====================

    /** 会话列表：按最近消息倒序，带每行未读与最近一条摘要（未读来自 Redis 缓存）。 */
    @GetMapping("/conversations")
    public Map<String, Object> conversations() {
        return chat.conversations(UserContext.require());
    }

    /**
     * 历史消息：{@code ?convId=&beforeId=} 向上翻，{@code ?convId=&afterId=} 补拉。
     *
     * <p>两个游标二选一：都传或都不传都按「最近一页」处理（都不传）/ 400（都传），
     * 避免前端写错时悄悄拿到不想要的数据。
     */
    @GetMapping("/messages")
    public Map<String, Object> messages(@RequestParam long convId,
                                        @RequestParam(required = false) Long beforeId,
                                        @RequestParam(required = false) Long afterId) {
        String me = UserContext.require();
        if (beforeId != null && afterId != null) {
            throw new IllegalArgumentException("INVALID_PARAM: beforeId 与 afterId 不能同时传");
        }
        if (afterId != null) return chat.syncAfter(me, convId, afterId);
        return chat.history(me, convId, beforeId);
    }

    /**
     * 发一条消息（HTTP 兜底通道）。
     *
     * <p>为什么保留 HTTP 发送：WebSocket 连不上时（比如线上还没配 Nginx 转发）
     * 轮询兜底只能"收"，发不出去整条链路就是半残。前端在 degraded 状态自动走这里。
     */
    @PostMapping("/messages")
    public Map<String, Object> send(@RequestBody(required = false) Map<String, Object> body) {
        String me = UserContext.require();
        String toId = str(body, "toId");

        // 邀请组队（V4）：同一条通道、同一种"消息"，只是 type=INVITE 并带结构化 payload。
        // 前端房间页点「邀请好友」走这里；接收方在聊天窗看到一张卡片。
        if ("INVITE".equalsIgnoreCase(str(body, "type"))) {
            return chat.sendInvite(me, toId, str(body, "roomCode"), str(body, "topicTitle"));
        }
        return chat.send(me, toId, str(body, "body"), "TEXT", null);
    }

    /** 已读回执（HTTP 版）：{@code {lastMsgId?}}，不传就推到会话最新。 */
    @PostMapping("/conversations/{id}/read")
    public Map<String, Object> read(@PathVariable long id,
                                    @RequestBody(required = false) Map<String, Object> body) {
        String me = UserContext.require();
        Long lastMsgId = body == null || body.get("lastMsgId") == null
                ? null : Long.valueOf(String.valueOf(body.get("lastMsgId")));
        return chat.markRead(me, id, lastMsgId);
    }

    /**
     * 「消息」角标总数：**只读 Redis**，不查库（MySQL 时代也不会产生查询压力）。
     *
     * <p>不是第 11 个之外的额外设计：会话列表的未读也来自同一份缓存，
     * 这里只是把求和的结果单独给角标用，省掉前端拉整张列表。
     */
    @GetMapping("/unread-count")
    public Map<String, Object> unreadCount() {
        return Map.of("unread", chat.unreadTotal(UserContext.require()));
    }

    // ==================== 内部 ====================

    private static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
