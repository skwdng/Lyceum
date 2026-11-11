package com.siyige.social;

import com.siyige.admin.analytics.Active;
import com.siyige.community.SensitiveWordMasker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 私聊的业务核心：发消息 / 历史分页 / 补拉 / 已读 / 会话列表。
 *
 * <h3>为什么传输层不写业务</h3>
 * WebSocket（V3）和 HTTP（V2，兜底通道）都调这里。传输层只负责「怎么送」，
 * 这里负责「能不能发、存哪里、通知谁、未读怎么算」——换传输方式时这层一行不用改。
 *
 * <h3>未读的两条路径（关键）</h3>
 * <ul>
 *   <li><b>读</b>：侧栏角标与会话列表都走 {@link SocialUnreadCounter}（Redis），**不查库**</li>
 *   <li><b>写</b>：发消息 +1；标已读时先用一条 SQL 算出「这次实际读掉几条」再原子递减</li>
 * </ul>
 * 缓存只在两种情况下回源：冷启动（缓存 key 不存在）和打开会话列表（顺便校准）。
 * 这两种都不是轮询，换成 MySQL 也不会给数据库压力。
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    /** 单条消息上限（与 sy_direct_message.body 的 varchar(2000) 一致）。 */
    static final int BODY_MAX = 2000;
    /** 打开会话时一次取多少条。 */
    static final int PAGE_SIZE = 20;
    /** 断线补拉一次最多多少条。 */
    static final int SYNC_MAX = 200;

    private final SocialRepo repo;
    private final SensitiveWordMasker masker;
    private final SocialUnreadCounter unread;
    private final ChatPusher pusher;
    /** INVITE 的 payload 要序列化成 JSON 存进 payload 列（不手拼字符串，避免转义踩坑）。 */
    private final com.fasterxml.jackson.databind.ObjectMapper json;

    /**
     * @param pusher 用 {@code @Lazy} 打断循环依赖：ChatWsHandler 需要 ChatService 处理收帧，
     *               ChatService 又需要 ChatPusher 推送，而 V3 的 ChatPusher 实现正是 ChatWsHandler。
     *               不加会直接启动失败（构造器成环）。
     */
    public ChatService(SocialRepo repo, SensitiveWordMasker masker,
                       SocialUnreadCounter unread,
                       @Lazy ChatPusher pusher,
                       com.fasterxml.jackson.databind.ObjectMapper json) {
        this.repo = repo;
        this.masker = masker;
        this.unread = unread;
        this.pusher = pusher;
        this.json = json;
    }

    // ==================== 发消息 ====================

    /**
     * 发一条消息（HTTP 与 WS 共用）。
     *
     * @param type    TEXT（本期只有 TEXT；V4 才有 INVITE）
     * @param payload 结构化附加信息（INVITE 用），TEXT 传 null
     * @return 落库后的消息视图（含 messageId / convId / createdAt）
     */
    @Active
    @Transactional
    public Map<String, Object> send(String fromId, String toId, String body, String type, String payload) {
        String target = toId == null ? null : toId.trim();
        if (target == null || target.isEmpty()) throw bad("INVALID_TARGET: 缺少收件人");
        if (target.equals(fromId)) throw bad("INVALID_TARGET: 不能给自己发消息");

        String raw = body == null ? "" : body;
        if (raw.isBlank()) throw bad("INVALID_BODY: 消息不能为空");
        if (raw.codePointCount(0, raw.length()) > BODY_MAX) {
            throw bad("BODY_TOO_LONG: 单条消息最多 " + BODY_MAX + " 字");
        }

        // 只有好友能发（决策 3）：删除好友后历史还在，但这里会 403
        if (!repo.isFriend(fromId, target)) throw bad("NOT_FRIEND: 你们不是好友，不能发私信");

        // 敏感词打码，规则与帖子/评论完全一致（决策 14）
        String text = masker.mask(raw).text();

        long convId = repo.findOrCreateConversation(fromId, target);
        long msgId = repo.insertMessage(convId, fromId, target, type == null ? "TEXT" : type, text, payload);

        // 会话列表按这个排序；发的人自己当然算已读（否则自己的消息在自己这边显示未读）
        repo.touchConversation(convId, msgId);
        repo.updateReadPosition(convId, fromId, msgId);

        // 收件人未读 +1（Redis，不查库）
        unread.incr(target, convId);

        Map<String, Object> message = messageView(msgId, convId, fromId, target, type, text, payload);

        // 实时推给收件人；不在线也没关系，他下次上线用 afterId 补拉（决策 2 的兜底）
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "msg");
        event.put("message", message);
        pusher.push(target, event);

        // 也推给发送方的**其它端**（手机 + 电脑同时在线时保持一致）。
        // 发送方当前这一端会同时收到 ack 和这条 msg —— 前端按 messageId 去重，不会出现两个气泡。
        pusher.push(fromId, event);

        log.info("私信 convId={} msgId={} from={} to={} 长度={}", convId, msgId, fromId, target, text.length());
        return message;
    }

    /** WS 帧 {"type":"send",...} 的入口（V3 用；V2 只有 HTTP，但形状一致便于切换）。 */
    @Active
    @Transactional
    public Map<String, Object> sendFromFrame(String fromId, Map<String, Object> in) {
        return send(fromId, str(in.get("toId")), str(in.get("body")), "TEXT", null);
    }

    // ==================== 邀请组队（V4） ====================

    /** 房间号格式：{@code SY-} 开头 + 2~10 位大写字母数字（与 RoomService.newCode 一致）。 */
    private static final java.util.regex.Pattern ROOM_CODE =
            java.util.regex.Pattern.compile("^SY-[A-Z0-9]{2,10}$");

    /** 辩题标题在邀请卡片上的长度上限（超出截断，卡片放不下）。 */
    static final int INVITE_TITLE_MAX = 60;

    /**
     * 发一张「邀请组队」卡片（决策 4：INVITE 是消息的一种 type，不是新表）。
     *
     * <p>为什么不做独立接口：邀请必须有「发给谁、谁发的、什么时候」这些语义，
     * 而这些恰好就是一条消息。做成消息，未读/推送/补拉/历史分页全部自动复用，
     * 接收方离线时上线也能在聊天记录里翻到。
     *
     * @param roomCode   房间号（后端统一转大写；格式不对直接 400，避免发出点不开的卡片）
     * @param topicTitle 辩题标题（可空，仅用于展示）
     */
    @Transactional
    public Map<String, Object> sendInvite(String fromId, String toId, String roomCode, String topicTitle) {
        String code = roomCode == null ? "" : roomCode.trim().toUpperCase();
        if (!ROOM_CODE.matcher(code).matches()) {
            throw bad("INVALID_ROOM_CODE: 房间号格式不对（应为 SY-XXXX）");
        }
        String title = topicTitle == null ? "" : topicTitle.trim();
        if (title.codePointCount(0, title.length()) > INVITE_TITLE_MAX) {
            title = title.substring(0, title.offsetByCodePoints(0, INVITE_TITLE_MAX));
        }

        String payload;
        try {
            payload = json.writeValueAsString(Map.of("roomCode", code, "topicTitle", title));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("INVITE payload 序列化失败", e);
        }

        String body = "邀请你加入辩论房间 " + code + (title.isEmpty() ? "" : "（" + title + "）");
        // 走同一条 send：好友校验、建会话、未读 +1、实时推送全部复用
        return send(fromId, toId, body, "INVITE", payload);
    }

    // ==================== 历史与补拉 ====================

    /**
     * 打开会话 / 向上翻页。
     *
     * @param beforeId 游标：只取 id 比它小的（不传 = 最近一页）。**不用 offset** ——
     *                 翻页时新消息可能正在进来，offset 会错位，游标不会。
     * @return {@code {convId, items(按时间正序), hasMore}}
     */
    public Map<String, Object> history(String me, long convId, Long beforeId) {
        Map<String, Object> conv = requireMember(me, convId);

        List<Map<String, Object>> rows;
        if (beforeId == null || beforeId <= 0) {
            rows = repo.listRecentMessages(convId, PAGE_SIZE + 1);
        } else {
            rows = repo.listMessagesBefore(convId, beforeId, PAGE_SIZE + 1);
        }
        boolean hasMore = rows.size() > PAGE_SIZE;
        if (hasMore) rows = rows.subList(0, PAGE_SIZE);

        // 查的时候是倒序（为了 limit 拿到最近 N 条），显示要正序
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(itemOf(r));
        Collections.reverse(items);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("convId", convId);
        out.put("peer", peerView(conv, me));
        out.put("items", items);
        out.put("hasMore", hasMore);
        out.put("myRead", repo.readPosition(convId, me));
        return out;
    }

    /**
     * 断线补拉 / 轮询兜底：取 id 大于 afterId 的消息（正序）。
     *
     * <p>这是「不漏消息」的唯一保证：WebSocket 断了多久都无所谓，重连后一条 SQL 补齐。
     */
    public Map<String, Object> syncAfter(String me, long convId, long afterId) {
        requireMember(me, convId);
        List<Map<String, Object>> rows = repo.listMessagesAfter(convId, afterId, SYNC_MAX);
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) items.add(itemOf(r));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("convId", convId);
        out.put("items", items);
        out.put("hasMore", rows.size() >= SYNC_MAX);
        return out;
    }

    // ==================== 已读 ====================

    /**
     * 标已读：把「我读到哪条」往后推，并推给对方显示「已读」。
     *
     * @param lastMsgId 读到哪条；不传 = 会话最新一条
     */
    @Transactional
    public Map<String, Object> markRead(String me, long convId, Long lastMsgId) {
        Map<String, Object> conv = requireMember(me, convId);
        long latest = num(conv.get("last_msg_id"));
        long target = (lastMsgId == null || lastMsgId <= 0) ? latest : Math.min(lastMsgId, Math.max(latest, 0));

        long oldPos = repo.readPosition(convId, me);
        long delta = repo.countBecameRead(convId, me, oldPos, target);
        if (target > oldPos) repo.updateReadPosition(convId, me, target);
        if (delta > 0) unread.decr(me, convId, delta);

        String peer = SocialRepo.peerOf(conv, me);
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "read");
        event.put("convId", convId);
        event.put("lastMsgId", target);
        pusher.push(peer, event);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("convId", convId);
        out.put("lastMsgId", target);
        out.put("unread", unread.of(me, convId));
        return out;
    }

    // ==================== 会话列表 / 角标 ====================

    /**
     * 会话列表（按最近消息倒序）。
     *
     * <p>这里会做一次**校准**：用一条聚合 SQL 算出各会话真实未读，整块回写 Redis。
     * 校准只发生在用户打开这个页面时，不是轮询，所以数据库不会被打。
     */
    public Map<String, Object> conversations(String me) {
        Map<Long, Integer> byConv = loadUnreadFromDb(me);
        unread.rebuild(me, byConv);

        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : repo.listConversations(me)) {
            long convId = num(row.get("conv_id"));
            Map<String, Object> it = new LinkedHashMap<>();
            it.put("convId", convId);
            it.put("peer", SocialRepo.row(
                    "id", str(row.get("peer_id")),
                    "name", row.get("peer_name"),
                    "isBot", num(row.get("peer_is_bot")) == 1));
            it.put("last", row.get("last_msg_id") == null ? null : SocialRepo.row(
                    "id", num(row.get("last_msg_id")),
                    "fromMe", me.equals(str(row.get("last_from"))),
                    "preview", preview(row.get("last_body")),
                    "type", row.get("last_type")));
            it.put("unread", byConv.getOrDefault(convId, 0));
            it.put("lastMsgAt", millis(row.get("last_created_at") != null ? row.get("last_created_at") : row.get("last_msg_at")));
            items.add(it);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size());
        out.put("unreadTotal", sum(byConv));
        return out;
    }

    /**
     * 侧栏「消息」角标总数：**只读缓存**，不查库。
     *
     * <p>只有缓存不存在时（Redis 重启 / 首次）才用一条聚合 SQL 重建一次，之后就都在缓存里。
     */
    public int unreadTotal(String me) {
        Integer cached = unread.total(me);
        if (cached != null) return cached;

        Map<Long, Integer> byConv = loadUnreadFromDb(me);
        unread.rebuild(me, byConv);
        return sum(byConv);
    }

    /** 一条聚合 SQL 拿到我所有会话的真实未读（只在冷启动 / 会话列表页调用）。 */
    private Map<Long, Integer> loadUnreadFromDb(String me) {
        Map<Long, Integer> out = new LinkedHashMap<>();
        for (Map<String, Object> row : repo.unreadByConversation(me)) {
            out.put(num(row.get("conv_id")), (int) num(row.get("cnt")));
        }
        return out;
    }

    // ==================== 内部 ====================

    /** 越权校验：会话必须属于我。 */
    private Map<String, Object> requireMember(String me, long convId) {
        Map<String, Object> conv = repo.findConversationById(convId);
        if (conv == null) throw bad("CONV_NOT_FOUND: 会话不存在");
        String a = str(conv.get("user_a"));
        String b = str(conv.get("user_b"));
        if (!me.equals(a) && !me.equals(b)) throw bad("NOT_MEMBER: 你不在这个会话里");
        return conv;
    }

    private Map<String, Object> peerView(Map<String, Object> conv, String me) {
        String peerId = SocialRepo.peerOf(conv, me);
        Map<String, Object> u = repo.findUser(peerId);
        return SocialRepo.row(
                "id", peerId,
                "name", u == null ? peerId : u.get("name"),
                "isBot", u != null && num(u.get("is_bot")) == 1);
    }

    private Map<String, Object> itemOf(Map<String, Object> r) {
        return SocialRepo.row(
                "id", num(r.get("id")),
                "convId", num(r.get("conv_id")),
                "fromId", str(r.get("from_id")),
                "type", str(r.get("type")),
                "body", str(r.get("body")),
                "payload", r.get("payload"),
                "createdAt", millis(r.get("created_at")));
    }

    private Map<String, Object> messageView(long msgId, long convId, String fromId, String toId,
                                            String type, String text, String payload) {
        // "id" 与 "messageId" 是同一个值，故意都放：
        //   · HTTP 响应与 ack 用 messageId（前端发消息时用它回填）
        //   · WS 推送帧里 message 对象按协议叫 id（见任务书 §WebSocket 协议）
        return SocialRepo.row(
                "id", msgId,
                "messageId", msgId,
                "convId", convId,
                "fromId", fromId,
                "toId", toId,
                "type", type == null ? "TEXT" : type,
                "body", text,
                "payload", payload,
                "createdAt", System.currentTimeMillis());
    }

    /** 会话列表里的最近消息摘要（一行放得下，前端不截断）。 */
    private static String preview(Object body) {
        String s = body == null ? "" : String.valueOf(body).replace("\r", "").replace("\n", " ").trim();
        if (s.codePointCount(0, s.length()) <= 40) return s;
        return s.substring(0, s.offsetByCodePoints(0, 40)) + "…";
    }

    private static int sum(Map<Long, Integer> m) {
        int s = 0;
        for (int v : m.values()) s += Math.max(0, v);
        return s;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static long num(Object o) {
        return o instanceof Number n ? n.longValue() : (o == null ? 0L : Long.parseLong(String.valueOf(o)));
    }

    private static Long millis(Object ts) {
        if (ts instanceof java.sql.Timestamp t) return t.getTime();
        if (ts instanceof java.time.LocalDateTime l) {
            return l.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        return null;
    }

    private static IllegalArgumentException bad(String codeAndMessage) {
        return new IllegalArgumentException(codeAndMessage);
    }
}
