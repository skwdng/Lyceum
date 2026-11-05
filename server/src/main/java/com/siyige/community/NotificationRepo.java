package com.siyige.community;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 通知表读写。表结构见 {@code schema-notify.sql}（新增文件，没动任何既有 schema）。
 *
 * <p>约定：所有查询把列名统一转成小写再返回，避免 H2 / MySQL 大小写差异
 * （与 {@code RoomStore} 的做法一致）。
 */
@Repository
public class NotificationRepo {

    /** 与 sy_community_like.target_type 的取值保持一致。 */
    public static final String TARGET_POST = "POST";
    public static final String TARGET_COMMENT = "COMMENT";

    private static final String COLS =
            "id, type, agg_key, agg_count, actor_id, actor_name, target_id, post_id, excerpt, note, is_read, created_at";

    private final JdbcTemplate jdbc;

    public NotificationRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ==================== 写 ====================

    /** 普通通知（不聚合）。 */
    public long insert(String userId, String type, String actorId, String actorName,
                       Long targetId, Long postId, String excerpt, String note) {
        return insert(userId, type, null, 1, actorId, actorName, targetId, postId, excerpt, note);
    }

    /** 点赞聚合行的首次创建。 */
    public long insertAgg(String userId, String type, String aggKey, int aggCount,
                          String actorId, String actorName, Long targetId, Long postId, String excerpt) {
        return insert(userId, type, aggKey, aggCount, actorId, actorName, targetId, postId, excerpt, null);
    }

    private long insert(String userId, String type, String aggKey, int aggCount, String actorId,
                        String actorName, Long targetId, Long postId, String excerpt, String note) {
        String sql = "insert into sy_notification" +
                "(user_id, module, type, agg_key, agg_count, actor_id, actor_name, target_id, post_id, excerpt, note, is_read) " +
                "values(?, 'community', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)";
        // 兜底截断：excerpt varchar(120) / note varchar(200)。不截断的话 H2 会抛 22001，
        // 而通知是在 try/catch 里发的，就等于"这条通知静默丢了"。
        String safeExcerpt = clip(excerpt, 120);
        String safeNote = clip(note, 200);
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, userId);
            ps.setString(2, type);
            ps.setString(3, aggKey);
            ps.setInt(4, aggCount);
            ps.setString(5, actorId);
            ps.setString(6, actorName);
            ps.setObject(7, targetId);
            ps.setObject(8, postId);
            ps.setString(9, safeExcerpt);
            ps.setString(10, safeNote);
            return ps;
        }, kh);
        return generatedKey(kh);
    }

    /**
     * 取自增主键。
     *
     * <p>不能直接用 {@code KeyHolder.getKey()}：H2 会把 {@code created_at default current_timestamp}
     * 这类带默认值的列也算进生成列，一次返回多列（ID + CREATED_AT）→ {@code getKey()} 抛
     * {@code InvalidDataAccessApiUsageException}；MySQL 只返回一列。这里按列名取，
     * 两种驱动都能用（与 {@code CommunityRepo#generatedKey} 同一处理）。
     */
    private static long generatedKey(KeyHolder keys) {
        java.util.List<java.util.Map<String, Object>> list = keys.getKeyList();
        if (list == null || list.isEmpty()) return -1L;
        Map<String, Object> row = list.get(0);
        Object v = row.get("ID");
        if (v == null) v = row.get("id");
        if (v == null) v = row.get("GENERATED_KEY");
        if (v == null && row.size() == 1) v = row.values().iterator().next();
        return v instanceof Number n ? n.longValue() : -1L;
    }

    /**
     * 点赞聚合「又来了一个人」：刷新人数 / 最新那个人 / 时间，并**重新置为未读**（方案 §6）。
     */
    public int updateAgg(long id, int aggCount, String actorId, String actorName) {
        return jdbc.update("update sy_notification " +
                        "set agg_count = ?, actor_id = ?, actor_name = ?, is_read = 0, created_at = current_timestamp " +
                        "where id = ?",
                aggCount, actorId, actorName, id);
    }

    /**
     * 取消点赞：**只**重算人数。
     *
     * <p>刻意不碰 {@code is_read} / {@code created_at} / {@code actor_*}（方案决策 E/§6）：
     * 人数变少不该让红点重新亮起，也不该把这行顶到列表最前面。
     */
    public int updateAggCount(long id, int aggCount) {
        return jdbc.update("update sy_notification set agg_count = ? where id = ?", aggCount, id);
    }

    /** 聚合人数降为 0：整行删掉。 */
    public int delete(long id) {
        return jdbc.update("delete from sy_notification where id = ?", id);
    }

    /**
     * 只把给定 id 里**还没读**的，标成本用户已读。
     *
     * @return 实际影响行数 —— Redis 计数必须按这个数递减（并发下可能小于入参个数）
     */
    public int markRead(String userId, List<Long> ids) {
        if (ids == null || ids.isEmpty()) return 0;
        StringBuilder in = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) in.append(i == 0 ? "?" : ",?");
        List<Object> args = new ArrayList<>(ids.size() + 1);
        args.add(userId);
        args.addAll(ids);
        return jdbc.update("update sy_notification set is_read = 1 " +
                "where user_id = ? and is_read = 0 and id in (" + in + ")", args.toArray());
    }

    // ==================== 读 ====================

    public Map<String, Object> findAgg(String userId, String aggKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select " + COLS + " from sy_notification where user_id = ? and agg_key = ?", userId, aggKey);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    /** 通过 agg_key 反查（V3 跳楼层 / 排查用）。 */
    public Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select " + COLS + " from sy_notification where id = ?", id);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    public long count(String userId) {
        Long n = jdbc.queryForObject("select count(*) from sy_notification where user_id = ?", Long.class, userId);
        return n == null ? 0L : n;
    }

    /** 列表分页：时间倒序（同秒插入的顺序由 id 兜底，保证分页稳定）。 */
    public List<Map<String, Object>> listPage(String userId, int offset, int limit) {
        return lowerAll(jdbc.queryForList(
                "select " + COLS + " from sy_notification where user_id = ? " +
                        "order by created_at desc, id desc limit ? offset ?", userId, limit, offset));
    }

    /** 数据库里真实未读条数。**不参与角标**（决策 G 禁止回源兜底），只给测试与运维排查用。 */
    public long countUnreadInDb(String userId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_notification where user_id = ? and is_read = 0", Long.class, userId);
        return n == null ? 0L : n;
    }

    // ==================== 读目标（判断收件人 / 拼文案用） ====================

    /** 帖子的作者、标题（含已删除的：status=2 也要能拿到，否则删帖通知就发不出去）。 */
    public Map<String, Object> postBrief(long postId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, author_id, title, status from sy_post where id = ?", postId);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    /** 评论的作者、所属帖子、正文（不筛 status：被删的评论也要能通知到作者）。 */
    public Map<String, Object> commentBrief(long commentId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, post_id, user_id, root_id, body, status from sy_post_comment where id = ?", commentId);
        return rows.isEmpty() ? null : lower(rows.get(0));
    }

    /** 点赞总数：取消点赞时据此**重算**，不做增减量（方案决策 8）。 */
    public long countLikes(String targetType, long targetId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_community_like where target_type = ? and target_id = ?",
                Long.class, targetType, targetId);
        return n == null ? 0L : n;
    }

    // ==================== @ 候选（V2 用，接口在 V1 就位） ====================

    /** 批量按 id 取昵称：`@` 反向校验用（正文里必须真的出现 `@昵称`）。 */
    public Map<String, String> namesByIds(Collection<String> ids) {
        Map<String, String> out = new LinkedHashMap<>();
        if (ids == null || ids.isEmpty()) return out;
        StringBuilder in = new StringBuilder();
        int i = 0;
        for (String ignored : ids) in.append(i++ == 0 ? "?" : ",?");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name from sy_user where account is not null and id in (" + in + ")",
                ids.toArray());
        for (Map<String, Object> r : rows) {
            out.put(String.valueOf(r.get("id")), r.get("name") == null ? null : String.valueOf(r.get("name")));
        }
        return out;
    }

    /**
     * 昵称前缀匹配的候选用户。
     *
     * <p>只找**真的账号**（{@code account is not null}）：历史数据里 {@code u1}/{@code gXXXXXX}
     * 那批没有 account 的行不该出现在 @ 候选里。
     */
    public List<Map<String, Object>> searchUsers(String prefix, int limit) {
        String like = prefix + "%";
        return lowerAll(jdbc.queryForList(
                "select id, name from sy_user " +
                        "where account is not null and name is not null and name like ? " +
                        "order by name limit ?", like, limit));
    }

    // ==================== 工具 ====================

    /** 按**码点**截断到列宽（不能用 substring，中文/emoji 会被切成半个字符）。 */
    static String clip(String s, int maxCodePoints) {
        if (s == null) return null;
        if (s.codePointCount(0, s.length()) <= maxCodePoints) return s;
        int end = s.offsetByCodePoints(0, maxCodePoints - 1);
        return s.substring(0, end) + "…";
    }

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
}
