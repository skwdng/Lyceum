package com.siyige.social;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 社交四张表的 SQL 集中在这里（schema-social.sql）。
 *
 * <p>只负责读写，不做业务判断（能不能加、是不是好友、要不要通知，都在
 * {@link FriendService} / {@link ChatService} 里）。和 {@code CommunityRepo} 的分工一致。
 *
 * <h3>两个必须遵守的约定</h3>
 * <ol>
 *   <li><b>好友对一律字典序</b>：写库前先 {@link #pair} 排序，查询时也用同一套，
 *       否则 (A,B) 与 (B,A) 会被当成两行，删除时只删掉一边。</li>
 *   <li><b>会话 id 有则取、无则建</b>：{@link #findOrCreateConversation} 靠
 *       {@code unique(user_a,user_b)} 兜并发，撞键不抛错、回查即可。</li>
 * </ol>
 */
@Repository
public class SocialRepo {

    private final JdbcTemplate jdbc;

    public SocialRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ==================== 用户（搜人 / 校验目标） ====================

    /** 单个用户行；不存在返回 null。 */
    public Map<String, Object> findUser(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, account, name, is_bot from sy_user where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 按 id 或 account **精确**命中（两者在注册时相等，但历史数据可能只对上其中一个）。 */
    public Map<String, Object> findUserExact(String q) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, account, name, is_bot from sy_user " +
                        "where (id = ? or account = ?) and is_bot = 0 order by id limit 1",
                q, q);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 昵称前缀 / 模糊命中；排除 bot（AI 账号不能被加好友，决策 9）。 */
    public List<Map<String, Object>> searchByNameLike(String q, int limit) {
        return jdbc.queryForList(
                "select id, account, name, is_bot from sy_user " +
                        "where is_bot = 0 and name like ? order by name, id limit ?",
                q + "%", limit);
    }

    // ==================== 好友关系 ====================

    /** 字典序取一对。所有好友读写都必须先过这个方法。 */
    static String[] pair(String x, String y) {
        return x.compareTo(y) <= 0 ? new String[]{x, y} : new String[]{y, x};
    }

    public boolean isFriend(String x, String y) {
        if (x == null || y == null) return false;
        String[] p = pair(x, y);
        Long n = jdbc.queryForObject(
                "select count(*) from sy_friend where user_a = ? and user_b = ?", Long.class, p[0], p[1]);
        return n != null && n > 0;
    }

    /**
     * 建立好友关系（幂等）。
     *
     * <p>并发下两边同时接受请求会各插一次，撞主键是正常的 —— 捕获后当成功处理，
     * 不要在这里抛错（否则一边接受成功、另一边 500）。
     *
     * @return true = 本次真的插入了新行
     */
    public boolean insertFriend(String x, String y) {
        String[] p = pair(x, y);
        try {
            jdbc.update("insert into sy_friend(user_a, user_b) values (?, ?)", p[0], p[1]);
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    /** 删除好友关系（一行），返回受影响行数。 */
    public int deleteFriend(String x, String y) {
        String[] p = pair(x, y);
        return jdbc.update("delete from sy_friend where user_a = ? and user_b = ?", p[0], p[1]);
    }

    /** 我的好友列表（带昵称）。会话摘要与未读数由 V2 的 ChatService 补上。 */
    public List<Map<String, Object>> listFriends(String me) {
        return jdbc.queryForList(
                "select u.id as id, u.name as name, u.is_bot as is_bot, f.created_at as created_at " +
                        "from sy_friend f " +
                        "join sy_user u on u.id = case when f.user_a = ? then f.user_b else f.user_a end " +
                        "where f.user_a = ? or f.user_b = ? " +
                        "order by f.created_at desc, u.id",
                me, me, me);
    }

    // ==================== 好友请求 ====================

    public long insertRequest(String fromId, String toId, String note) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into sy_friend_request(from_id, to_id, note, status) values (?, ?, ?, 'PENDING')",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, fromId);
            ps.setString(2, toId);
            ps.setString(3, note);
            return ps;
        }, keys);
        return generatedKey(keys);
    }

    /** from → to 方向是否已有待处理请求（决定 409 PENDING_EXISTS / 反向自动成好友）。 */
    public Map<String, Object> findPending(String fromId, String toId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_friend_request " +
                        "where from_id = ? and to_id = ? and status = 'PENDING' order by id desc limit 1",
                fromId, toId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Map<String, Object> findRequestById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_friend_request where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 我收到的待处理请求（带请求方昵称）。 */
    public List<Map<String, Object>> listPendingTo(String me) {
        return jdbc.queryForList(
                "select r.id as id, r.from_id as from_id, r.note as note, r.created_at as created_at, " +
                        "       u.name as from_name, u.is_bot as from_is_bot " +
                        "from sy_friend_request r left join sy_user u on u.id = r.from_id " +
                        "where r.to_id = ? and r.status = 'PENDING' " +
                        "order by r.created_at desc, r.id desc",
                me);
    }

    public int markAccepted(long id) {
        return jdbc.update(
                "update sy_friend_request set status = 'ACCEPTED', handled_at = ? " +
                        "where id = ? and status = 'PENDING'",
                new Timestamp(System.currentTimeMillis()), id);
    }

    public int markRejected(long id) {
        return jdbc.update(
                "update sy_friend_request set status = 'REJECTED', handled_at = ? " +
                        "where id = ? and status = 'PENDING'",
                new Timestamp(System.currentTimeMillis()), id);
    }

    // ==================== 会话与消息（V2 起使用） ====================

    public Map<String, Object> findConversation(String x, String y) {
        String[] p = pair(x, y);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_conversation where user_a = ? and user_b = ?", p[0], p[1]);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Map<String, Object> findConversationById(long convId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_conversation where id = ?", convId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 会话「有则取、无则建」。
     *
     * <p>两个人同时第一次发消息时都会查不到、都会插，于是其中一方撞
     * {@code unique(user_a,user_b)} —— 这里吞掉异常再回查，保证只返回同一个 id。
     */
    public long findOrCreateConversation(String x, String y) {
        String[] p = pair(x, y);
        Long id = queryLong("select id from sy_conversation where user_a = ? and user_b = ?", p[0], p[1]);
        if (id != null) return id;

        try {
            jdbc.update("insert into sy_conversation(user_a, user_b) values (?, ?)", p[0], p[1]);
        } catch (DuplicateKeyException ignore) {
            // 并发下别人先建了：回查即可，不要在这里抛
        }
        Long again = queryLong("select id from sy_conversation where user_a = ? and user_b = ?", p[0], p[1]);
        if (again == null) throw new IllegalStateException("CONV_CREATE_FAILED: 会话创建失败");
        return again;
    }

    public long insertMessage(long convId, String fromId, String toId, String type, String body, String payload) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into sy_direct_message(conv_id, from_id, to_id, type, body, payload) " +
                            "values (?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, convId);
            ps.setString(2, fromId);
            ps.setString(3, toId);
            ps.setString(4, type);
            ps.setString(5, body);
            ps.setString(6, payload);
            return ps;
        }, keys);
        return generatedKey(keys);
    }

    public Map<String, Object> findMessage(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from sy_direct_message where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 更新会话的「最近一条」，用于会话列表排序。 */
    public void touchConversation(long convId, long msgId) {
        jdbc.update("update sy_conversation set last_msg_id = ?, last_msg_at = ? where id = ?",
                msgId, new Timestamp(System.currentTimeMillis()), convId);
    }

    /**
     * 更新我的已读位置：**只前进、不后退**。
     *
     * <p>用 {@code greatest} 是必须的：多端同时标已读时，乱序到达的旧回执
     * 不能把已经读到 100 的位置打回 80。
     */
    public void updateReadPosition(long convId, String userId, long msgId) {
        Map<String, Object> conv = findConversationById(convId);
        if (conv == null) return;
        String col = isUserA(conv, userId) ? "read_a" : "read_b";
        jdbc.update("update sy_conversation set " + col + " = greatest(coalesce(" + col + ", 0), ?) where id = ?",
                msgId, convId);
    }

    public long readPosition(long convId, String userId) {
        Map<String, Object> conv = findConversationById(convId);
        if (conv == null) return 0;
        Object v = conv.get(isUserA(conv, userId) ? "read_a" : "read_b");
        return v instanceof Number n ? n.longValue() : 0;
    }

    /** 这个会话是不是这个人的（越权校验的地基）。 */
    static boolean isUserA(Map<String, Object> conv, String userId) {
        return String.valueOf(conv.get("user_a")).equals(userId);
    }

    static String peerOf(Map<String, Object> conv, String userId) {
        return isUserA(conv, userId) ? String.valueOf(conv.get("user_b"))
                : String.valueOf(conv.get("user_a"));
    }

    // ==================== 读消息 ====================

    /**
     * 会话列表：一对人一行 + 对端昵称 + 最近一条消息摘要，按 last_msg_id 倒序。
     *
     * <p>用 left join 而不是 inner join：会话刚建好、还没发消息时 last_msg_id 为空，
     * 也得出现在列表里（否则「新建会话」这个动作在界面上没有任何反馈）。
     */
    public List<Map<String, Object>> listConversations(String me) {
        return jdbc.queryForList(
                "select c.id as conv_id, c.last_msg_id as last_msg_id, c.last_msg_at as last_msg_at, " +
                        "       u.id as peer_id, u.name as peer_name, u.is_bot as peer_is_bot, " +
                        "       m.from_id as last_from, m.body as last_body, m.type as last_type, " +
                        "       m.created_at as last_created_at " +
                        "from sy_conversation c " +
                        "join sy_user u on u.id = case when c.user_a = ? then c.user_b else c.user_a end " +
                        "left join sy_direct_message m on m.id = c.last_msg_id " +
                        "where c.user_a = ? or c.user_b = ? " +
                        "order by coalesce(c.last_msg_id, 0) desc, c.id desc",
                me, me, me);
    }

    /** 向上翻历史：id 小于游标，倒序取（前端再反转成正序显示）。 */
    public List<Map<String, Object>> listMessagesBefore(long convId, long beforeId, int limit) {
        return jdbc.queryForList(
                "select * from sy_direct_message where conv_id = ? and id < ? order by id desc limit ?",
                convId, beforeId, limit);
    }

    /** 打开会话时的最近 N 条（倒序取）。 */
    public List<Map<String, Object>> listRecentMessages(long convId, int limit) {
        return jdbc.queryForList(
                "select * from sy_direct_message where conv_id = ? order by id desc limit ?",
                convId, limit);
    }

    /** 断线/轮询补拉：id 大于游标，正序取。 */
    public List<Map<String, Object>> listMessagesAfter(long convId, long afterId, int limit) {
        return jdbc.queryForList(
                "select * from sy_direct_message where conv_id = ? and id > ? order by id asc limit ?",
                convId, afterId, limit);
    }

    // ==================== 未读（数据库侧口径） ====================

    /**
     * 每个会话的未读数（一次聚合，别按会话循环查）。
     *
     * <p>口径：不是我发的，且 id 大于我的已读位置 —— 全在 SQL 里算，天然多端一致。
     * 只在「Redis 冷启动重建」和「进会话列表校准」时调用，**轮询路径不碰它**。
     */
    public List<Map<String, Object>> unreadByConversation(String me) {
        return jdbc.queryForList(
                "select m.conv_id as conv_id, count(*) as cnt " +
                        "from sy_direct_message m join sy_conversation c on c.id = m.conv_id " +
                        "where (c.user_a = ? or c.user_b = ?) and m.from_id <> ? " +
                        "  and m.id > case when c.user_a = ? then c.read_a else c.read_b end " +
                        "group by m.conv_id",
                me, me, me, me);
    }

    /**
     * 这次「标已读」实际读掉了多少条。
     *
     * <p>更新已读位置前先算：区间 (旧位置, 新位置] 内、不是我自己发的消息条数。
     * Redis 里的未读数就按这个数递减 —— 不能一律 -1（用户可能一次滚过 20 条）。
     */
    public long countBecameRead(long convId, String me, long oldPos, long newPos) {
        if (newPos <= oldPos) return 0;
        Long n = jdbc.queryForObject(
                "select count(*) from sy_direct_message " +
                        "where conv_id = ? and from_id <> ? and id > ? and id <= ?",
                Long.class, convId, me, oldPos, newPos);
        return n == null ? 0 : n;
    }

    // ==================== 内部工具 ====================

    private Long queryLong(String sql, Object... args) {
        List<Long> rows = jdbc.query(sql, (rs, i) -> rs.getLong(1), args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 取自增主键。
     *
     * <p>不能直接用 {@code keys.getKey()}：H2 在表上还有别的生成列
     * （比如 {@code created_at default current_timestamp}）时会返回多列，
     * 那时候 {@code getKey()} 抛 InvalidDataAccessApiUsageException。按列名取最稳。
     */
    private static long generatedKey(KeyHolder keys) {
        var list = keys.getKeyList();
        if (list == null || list.isEmpty()) return -1;
        Map<String, Object> row = list.get(0);
        Object v = row.get("ID");
        if (v == null) v = row.get("id");
        if (v == null) v = row.get("GENERATED_KEY");
        if (v == null && row.size() == 1) v = row.values().iterator().next();
        return v instanceof Number n ? n.longValue() : -1;
    }

    /** 便于 Service 拼返回体时保持字段顺序（前端按字段名读，顺序不影响，但调试好看）。 */
    static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }
}
