package com.siyige.social;

import com.siyige.community.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 好友关系：搜索 / 发请求 / 接受 / 拒绝 / 删除 / 列表。
 *
 * <h3>三条产品规则（决策，不可改）</h3>
 * <ol>
 *   <li><b>双向同时发请求 → 直接成为好友</b>：A 发请求时发现 B 已经给自己发过 PENDING，
 *       两边立刻互加好友、两条请求都置 ACCEPTED，双方各收一条 FRIEND_ACCEPTED。
 *       不这样做会出现「两边都显示已发送、谁也没法接受」的死局。</li>
 *   <li><b>AI 账号不能被加好友</b>：{@code is_bot=1} 的目标一律 400。</li>
 *   <li><b>拒绝不通知</b>：被拒绝的人收不到任何提示（避免纠缠 / 骚扰）。</li>
 * </ol>
 *
 * <h3>附言</h3>
 * 上限 100 字，**超出静默截断**（不报错）—— 这是产品决定：附言是顺手写的一句，
 * 因为多打几个字就报错会更烦；截断后前端看到的就是最终落库的内容。
 */
@Service
public class FriendService {

    private static final Logger log = LoggerFactory.getLogger(FriendService.class);

    /** 搜索最多返回几个人。 */
    static final int SEARCH_MAX = 10;
    /** 附言上限（决策 5）。超出静默截断。 */
    static final int NOTE_MAX = 100;

    private final SocialRepo repo;
    private final NotificationService notifications;
    private final ChatPusher pusher;

    public FriendService(SocialRepo repo, NotificationService notifications, ChatPusher pusher) {
        this.repo = repo;
        this.notifications = notifications;
        this.pusher = pusher;
    }

    // ==================== 搜索 ====================

    /**
     * 搜人：**先按 id/account 精确命中**，没命中再按昵称模糊（最多 10 条）。
     *
     * <p>为什么先精确：用户拿到的用户名（= 注册账号）是唯一的，直接贴进来就该命中；
     * 而昵称可以重名，模糊搜索只适合"记得大概叫什么"的场景。
     *
     * <p>AI 账号不出现在任何搜索结果里（决策 9）。
     */
    public Map<String, Object> search(String me, String q) {
        String query = q == null ? "" : q.trim();
        List<Map<String, Object>> items = new ArrayList<>();
        if (query.isEmpty()) return Map.of("items", items, "total", 0);

        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> exact = repo.findUserExact(query);
        if (exact != null) {
            rows.add(exact);
        } else {
            rows.addAll(repo.searchByNameLike(query, SEARCH_MAX));
        }
        for (Map<String, Object> row : rows) items.add(decorate(me, row));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        return out;
    }

    /** 给搜索结果补上前端画按钮需要的三个状态。 */
    private Map<String, Object> decorate(String me, Map<String, Object> user) {
        String id = str(user.get("id"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", user.get("name"));
        out.put("isFriend", repo.isFriend(me, id));
        // 我已发出、还挂着的请求 → 按钮显示「已发送」
        out.put("hasPendingRequest", !me.equals(id) && repo.findPending(me, id) != null);
        // 对方已发给我、等我处理 → 按钮显示「接受」
        out.put("pendingIn", !me.equals(id) && repo.findPending(id, me) != null);
        out.put("isSelf", me.equals(id));
        return out;
    }

    // ==================== 发请求 ====================

    /**
     * 发好友请求。
     *
     * @return {@code {status:"PENDING"|"ACCEPTED", requestId, toId}} —— 双向互发时直接是 ACCEPTED
     */
    @Transactional
    public Map<String, Object> request(String me, String toId, String note) {
        if (toId == null || toId.isBlank()) throw bad("INVALID_PARAM: 缺少 toId");
        String target = toId.trim();
        if (target.equals(me)) throw bad("CANT_ADD_SELF: 不能加自己为好友");

        Map<String, Object> user = repo.findUser(target);
        if (user == null) throw bad("USER_NOT_FOUND: 用户不存在");
        if (isBot(user)) throw bad("TARGET_IS_BOT: 不能添加 AI 账号为好友");

        if (repo.isFriend(me, target)) throw bad("ALREADY_FRIEND: 你们已经是好友");

        String safeNote = truncateNote(note);

        // ① 反向 PENDING：对方先发的 → 直接成为好友（决策 6）
        Map<String, Object> reverse = repo.findPending(target, me);
        if (reverse != null) {
            repo.insertFriend(me, target);
            repo.markAccepted(num(reverse.get("id")));
            // 本次请求也留一条 ACCEPTED 记录，历史里能看到"双向加好友"的完整过程
            long mine = repo.insertRequest(me, target, safeNote);
            if (mine > 0) repo.markAccepted(mine);

            // 双方各一条 FRIEND_ACCEPTED（决策 6）
            notifications.onFriendAccepted(me, target);
            notifications.onFriendAccepted(target, me);
            pushAccepted(me, target);
            pushAccepted(target, me);

            log.info("双向请求自动成好友 a={} b={}", me, target);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", "ACCEPTED");
            out.put("requestId", mine > 0 ? mine : num(reverse.get("id")));
            out.put("toId", target);
            return out;
        }

        // ② 我已经发过、还没被处理 → 409（避免刷屏）
        if (repo.findPending(me, target) != null) {
            throw bad("PENDING_EXISTS: 已经发过请求，等对方处理");
        }

        // ③ 正常路径：落一条 PENDING + 通知 + 实时推送
        long requestId = repo.insertRequest(me, target, safeNote);
        notifications.onFriendRequest(target, me, safeNote);
        pushRequest(target, me, requestId, safeNote);
        log.info("好友请求 id={} from={} to={}", requestId, me, target);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "PENDING");
        out.put("requestId", requestId);
        out.put("toId", target);
        return out;
    }

    // ==================== 待处理 / 接受 / 拒绝 ====================

    /** 我收到的待处理请求（带请求方昵称与附言）。 */
    public Map<String, Object> pendingRequests(String me) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : repo.listPendingTo(me)) {
            Map<String, Object> it = new LinkedHashMap<>();
            it.put("requestId", num(row.get("id")));
            it.put("fromId", str(row.get("from_id")));
            it.put("fromName", row.get("from_name"));
            it.put("note", row.get("note"));
            it.put("createdAt", millis(row.get("created_at")));
            items.add(it);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        return out;
    }

    /** 接受：建好友关系 + 请求置 ACCEPTED + 通知请求方 + 实时推送。 */
    @Transactional
    public void accept(String me, long requestId) {
        Map<String, Object> req = requireMyPending(me, requestId);
        String from = str(req.get("from_id"));

        repo.insertFriend(me, from);
        repo.markAccepted(requestId);

        notifications.onFriendAccepted(from, me);
        pushAccepted(from, me);
        log.info("接受好友请求 id={} from={} to={}", requestId, from, me);
    }

    /** 拒绝：只改状态，**不通知**（决策：拒绝不打扰对方）。 */
    @Transactional
    public void reject(String me, long requestId) {
        requireMyPending(me, requestId);
        repo.markRejected(requestId);
        log.info("拒绝好友请求 id={} by={}", requestId, me);
    }

    /** 校验：请求存在、是发给我的、仍然 PENDING。 */
    private Map<String, Object> requireMyPending(String me, long requestId) {
        Map<String, Object> req = repo.findRequestById(requestId);
        if (req == null) throw bad("REQUEST_NOT_FOUND: 请求不存在");
        if (!me.equals(str(req.get("to_id")))) throw bad("NOT_REQUEST_TARGET: 这条请求不是发给你的");
        if (!"PENDING".equals(str(req.get("status")))) throw bad("REQUEST_NOT_PENDING: 该请求已处理");
        return req;
    }

    // ==================== 列表 / 删除 ====================

    /**
     * 好友列表。
     *
     * <p>V1 只有 id / name；V2 会在这里补上「会话 id、未读数、最近一条消息摘要」，
     * 未读数来自 Redis 缓存（不查库）。
     */
    public Map<String, Object> friends(String me) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : repo.listFriends(me)) {
            Map<String, Object> it = new LinkedHashMap<>();
            it.put("id", str(row.get("id")));
            it.put("name", row.get("name"));
            it.put("isBot", num(row.get("is_bot")) == 1);
            it.put("createdAt", millis(row.get("created_at")));
            items.add(it);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        return out;
    }

    /**
     * 删除好友：双向解除（关系只有一行，删一次两边都没了）。
     *
     * <p>历史消息**保留**（会话与消息表都不动），但之后发消息会被 NOT_FRIEND 拦住。
     * 不通知对方：删除是单方面动作，没必要提醒（对方下次打开列表自然消失）。
     */
    @Transactional
    public void delete(String me, String otherId) {
        if (otherId == null || otherId.isBlank()) throw bad("INVALID_PARAM: 缺少 userId");
        int n = repo.deleteFriend(me, otherId.trim());
        if (n == 0) throw bad("NOT_FRIEND: 你们不是好友");
        log.info("解除好友 a={} b={}", me, otherId);
    }

    // ==================== 实时推送 ====================

    private void pushRequest(String toId, String fromId, long requestId, String note) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "friend_request");
        event.put("requestId", requestId);
        event.put("from", Map.of("id", fromId, "name", nameOf(fromId)));
        event.put("note", note);
        event.put("createdAt", System.currentTimeMillis());
        pusher.push(toId, event);
    }

    private void pushAccepted(String toId, String byId) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "friend_accepted");
        event.put("by", Map.of("id", byId, "name", nameOf(byId)));
        event.put("createdAt", System.currentTimeMillis());
        pusher.push(toId, event);
    }

    private String nameOf(String userId) {
        Map<String, Object> u = repo.findUser(userId);
        return u == null ? userId : String.valueOf(u.get("name"));
    }

    // ==================== 小工具 ====================

    /** 附言按**码点**截断（不能用 substring，中文/emoji 会被切成半个字符）。 */
    static String truncateNote(String note) {
        if (note == null) return null;
        String s = note.trim();
        if (s.isEmpty()) return null;
        if (s.codePointCount(0, s.length()) <= NOTE_MAX) return s;
        int end = s.offsetByCodePoints(0, NOTE_MAX);
        return s.substring(0, end);
    }

    private static boolean isBot(Map<String, Object> user) {
        return num(user.get("is_bot")) == 1;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static long num(Object o) {
        return o instanceof Number n ? n.longValue() : (o == null ? 0L : Long.parseLong(String.valueOf(o)));
    }

    /** 数据库 timestamp → 毫秒时间戳（前端统一按毫秒处理）。 */
    private static Long millis(Object ts) {
        if (ts instanceof java.sql.Timestamp t) return t.getTime();
        if (ts instanceof java.time.LocalDateTime l) return l.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        return null;
    }

    private static IllegalArgumentException bad(String codeAndMessage) {
        return new IllegalArgumentException(codeAndMessage);
    }
}
