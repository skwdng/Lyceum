package com.siyige.community;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.sql.Statement;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 社区三表（SPEC-v4.2 §8：post / sy_post_comment / sy_community_like）的 SQL 集中在这里。
 * 只负责读写，不做业务判断（权限、审核、摘要、热度都在 Service）。
 */
@Repository
public class CommunityRepo {

    private static final String POST_COLUMNS =
            "p.id, p.author_id, u.name as author_name, p.type, p.title, p.excerpt, p.topic_id, " +
            "t.title as topic_title, p.comment_count, p.like_count, p.view_count, " +
            "p.last_comment_at, p.created_at, p.updated_at";

    private static final String POST_FROM =
            " from sy_post p left join sy_user u on u.id = p.author_id left join sy_topic t on t.id = p.topic_id";

    private final JdbcTemplate jdbc;

    public CommunityRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ---------- 用户 ----------
    // 用户行由 auth 模块（com.siyige.auth）负责创建与改名；社区只读不写。
    // 作者昵称一律走 POST_FROM 里的 left join sy_user u on u.id = p.author_id 取，
    // 所以「我的」里改名会立刻在列表/详情/评论上生效，社区三表无需改动。

    // ---------- 帖子读 ----------

    public long countPosts(String type, String title, String topicId, String range) {
        List<Object> args = new ArrayList<>();
        String sql = "select count(*) from sy_post p" + where(type, title, topicId, range, args);
        Long n = jdbc.queryForObject(sql, Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** R-COM-05：列表不读 body，只读 excerpt。 */
    public List<Map<String, Object>> listPosts(String type, String title, String topicId, String range,
                                               String sort, int offset, int limit) {
        List<Object> args = new ArrayList<>();
        String sql = "select " + POST_COLUMNS + POST_FROM + where(type, title, topicId, range, args)
                + orderBy(sort) + " limit ? offset ?";
        args.add(limit);
        args.add(offset);
        return jdbc.queryForList(sql, args.toArray());
    }

    public Map<String, Object> findPost(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select " + POST_COLUMNS + ", p.body" + POST_FROM + " where p.id = ? and p.status = 1", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** R-COM-29：liked 必须一次批量 IN 查询，不许逐条查。 */
    public Set<Long> likedPostIds(String userId, Collection<Long> postIds) {
        if (userId == null || postIds == null || postIds.isEmpty()) return Collections.emptySet();
        String placeholders = String.join(",", Collections.nCopies(postIds.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.addAll(postIds);
        return new HashSet<>(jdbc.queryForList(
                "select target_id from sy_community_like where user_id = ? and target_type = 'POST' and target_id in (" + placeholders + ")",
                Long.class, args.toArray()));
    }

    // ---------- 帖子写 ----------

    public long insertPost(String authorId, String type, String title, String body,
                           String excerpt, String topicId, double hotScore) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into sy_post(author_id, type, title, body, excerpt, topic_id, hot_score, status) " +
                    "values(?, ?, ?, ?, ?, ?, ?, 1)", Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, authorId);
            ps.setString(2, type);
            ps.setString(3, title);
            ps.setString(4, body);
            ps.setString(5, excerpt);
            ps.setString(6, topicId);
            ps.setDouble(7, hotScore);
            return ps;
        }, keys);
        return generatedKey(keys);
    }

    /** 局部更新：只改传入的列（PATCH 语义），topicId 传 null 表示解绑。 */
    public int updatePost(long id, Map<String, Object> fields) {
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        if (fields.containsKey("type")) { sets.add("type = ?"); args.add(fields.get("type")); }
        if (fields.containsKey("title")) { sets.add("title = ?"); args.add(fields.get("title")); }
        if (fields.containsKey("body")) { sets.add("body = ?"); args.add(fields.get("body")); }
        if (fields.containsKey("excerpt")) { sets.add("excerpt = ?"); args.add(fields.get("excerpt")); }
        if (fields.containsKey("topicId")) { sets.add("topic_id = ?"); args.add(fields.get("topicId")); }
        if (fields.containsKey("hotScore")) { sets.add("hot_score = ?"); args.add(fields.get("hotScore")); }
        sets.add("updated_at = now()");
        args.add(id);
        return jdbc.update("update sy_post set " + String.join(", ", sets) + " where id = ? and status = 1", args.toArray());
    }

    /** R-COM-07：软删除，status = 2。 */
    public int softDeletePost(long id) {
        return jdbc.update("update sy_post set status = 2, updated_at = now() where id = ? and status = 1", id);
    }

    /**
     * 撤销软删（管理员「一键恢复」用）：status 2 -> 1。
     *
     * <p>只对**已删**的行生效（`and status = 2`），返回 0 表示"没东西可恢复"
     * ——目标不存在、本来就是可见的、或已被其它途径改过，调用方据此返回 409。
     *
     * <p>放在 community 包里而不是 admin 包：`sy_post` 的 SQL 只由社区模块写，
     * 管理员恢复动作也走同一个出口（和 softDeletePost 对称）。
     */
    public int restorePost(long id) {
        return jdbc.update("update sy_post set status = 1, updated_at = now() where id = ? and status = 2", id);
    }

    /** 撤销软删（评论），语义同 {@link #restorePost(long)}。 */
    public int restoreComment(long id) {
        return jdbc.update("update sy_post_comment set status = 1 where id = ? and status = 2", id);
    }

    // ---------- 评论读 ----------

    /** 单条评论（含已删除行，状态由 Service 判断）。 */
    public Map<String, Object> findComment(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select c.*, u.name as author_name from sy_post_comment c left join sy_user u on u.id = c.user_id where c.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** R-COM-21：只分页“楼”（root_id IS NULL）。 */
    public long countRootComments(long postId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_post_comment where post_id = ? and status = 1 and root_id is null", Long.class, postId);
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> listRootComments(long postId, int offset, int limit) {
        return jdbc.queryForList(
                "select c.id, c.post_id, c.user_id, c.user_id as author_id, u.name as author_name, c.body, " +
                "c.like_count, c.created_at, c.root_id " +
                "from sy_post_comment c left join sy_user u on u.id = c.user_id " +
                "where c.post_id = ? and c.status = 1 and c.root_id is null " +
                "order by c.created_at desc, c.id desc limit ? offset ?",
                postId, limit, offset);
    }

    /** R-COM-21：每楼前 3 条楼中楼预览（窗口函数一次取完，避免 N+1）。 */
    public List<Map<String, Object>> previewReplies(long postId, Collection<Long> rootIds) {
        if (rootIds == null || rootIds.isEmpty()) return List.of();
        String placeholders = String.join(",", Collections.nCopies(rootIds.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(postId);
        args.addAll(rootIds);
        return jdbc.queryForList(
                "select * from (" +
                "  select c.id, c.post_id, c.root_id, c.user_id, c.user_id as author_id, u.name as author_name, " +
                "         c.body, c.like_count, c.reply_object_type, c.reply_object_comment_id, c.reply_object_user_id, " +
                "         ru.name as reply_object_user_name, c.created_at, " +
                "         row_number() over (partition by c.root_id order by c.created_at asc, c.id asc) as rn " +
                "  from sy_post_comment c " +
                "  left join sy_user u on u.id = c.user_id " +
                "  left join sy_user ru on ru.id = c.reply_object_user_id " +
                "  where c.post_id = ? and c.status = 1 and c.root_id in (" + placeholders + ")" +
                ") t where t.rn <= 3 order by t.root_id asc, t.created_at asc, t.id asc",
                args.toArray());
    }

    /** 每个楼下的有效楼中楼总数。 */
    public Map<Long, Long> countRepliesByRoot(long postId, Collection<Long> rootIds) {
        Map<Long, Long> out = new LinkedHashMap<>();
        if (rootIds == null || rootIds.isEmpty()) return out;
        String placeholders = String.join(",", Collections.nCopies(rootIds.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(postId);
        args.addAll(rootIds);
        jdbc.queryForList(
                "select root_id, count(*) as cnt from sy_post_comment " +
                "where post_id = ? and status = 1 and root_id in (" + placeholders + ") group by root_id",
                args.toArray()).forEach(r -> out.put(((Number) r.get("root_id")).longValue(),
                ((Number) r.get("cnt")).longValue()));
        return out;
    }

    /** 展开某一楼的楼中楼：created_at ASC, id ASC。 */
    public List<Map<String, Object>> listReplies(long rootId, int offset, int limit) {
        return jdbc.queryForList(
                "select c.id, c.post_id, c.root_id, c.user_id, c.user_id as author_id, u.name as author_name, " +
                "c.body, c.like_count, c.reply_object_type, c.reply_object_comment_id, c.reply_object_user_id, " +
                "ru.name as reply_object_user_name, c.created_at " +
                "from sy_post_comment c left join sy_user u on u.id = c.user_id " +
                "left join sy_user ru on ru.id = c.reply_object_user_id " +
                "where c.root_id = ? and c.status = 1 order by c.created_at asc, c.id asc limit ? offset ?",
                rootId, limit, offset);
    }

    public long countReplies(long rootId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_post_comment where root_id = ? and status = 1", Long.class, rootId);
        return n == null ? 0 : n;
    }

    /** R-COM-29：评论 liked 同样一次批量 IN。 */
    public Set<Long> likedCommentIds(String userId, Collection<Long> commentIds) {
        if (userId == null || commentIds == null || commentIds.isEmpty()) return Collections.emptySet();
        String placeholders = String.join(",", Collections.nCopies(commentIds.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.addAll(commentIds);
        return new HashSet<>(jdbc.queryForList(
                "select target_id from sy_community_like where user_id = ? and target_type = 'COMMENT' and target_id in (" + placeholders + ")",
                Long.class, args.toArray()));
    }

    // ---------- 评论写 ----------

    public long insertComment(long postId, String userId, Long rootId, String replyObjectType,
                              Long replyObjectCommentId, String replyObjectUserId, String body) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into sy_post_comment(post_id, user_id, root_id, reply_object_type, reply_object_comment_id, " +
                    "reply_object_user_id, body, status) values(?, ?, ?, ?, ?, ?, ?, 1)", Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, postId);
            ps.setString(2, userId);
            if (rootId == null) ps.setNull(3, java.sql.Types.BIGINT); else ps.setLong(3, rootId);
            ps.setString(4, replyObjectType);
            if (replyObjectCommentId == null) ps.setNull(5, java.sql.Types.BIGINT); else ps.setLong(5, replyObjectCommentId);
            ps.setString(6, replyObjectUserId);
            ps.setString(7, body);
            return ps;
        }, keys);
        return generatedKey(keys);
    }

    public int softDeleteComment(long id) {
        return jdbc.update("update sy_post_comment set status = 2 where id = ? and status = 1", id);
    }

    /** 删楼时连带软删除其下所有楼中楼，避免留下无主回复。 */
    public int softDeleteReplies(long rootId) {
        return jdbc.update("update sy_post_comment set status = 2 where root_id = ? and status = 1", rootId);
    }

    // ---------- 帖子统计（事务内重算） ----------

    /** 锁住 post 行，避免并发评论时 count 结果互相覆盖。 */
    public Map<String, Object> lockPost(long id) {
        return lockPostRow(id);
    }

    /** 点赞用：同样锁行，额外带上 comment_count 供热度公式。 */
    public Map<String, Object> lockPostForLike(long id) {
        return lockPostRow(id);
    }

    private Map<String, Object> lockPostRow(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, comment_count, like_count, view_count, created_at " +
                "from sy_post where id = ? and status = 1 for update", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** R-COM-22：comment_count 含楼与楼中楼。 */
    public long countComments(long postId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_post_comment where post_id = ? and status = 1", Long.class, postId);
        return n == null ? 0 : n;
    }

    public Object maxCommentAt(long postId) {
        return jdbc.queryForObject(
                "select max(created_at) from sy_post_comment where post_id = ? and status = 1", Object.class, postId);
    }

    /** 只更新统计三列，不动 updated_at（评论不等于编辑帖子）。 */
    public int updatePostStats(long postId, long commentCount, Object lastCommentAt, double hotScore) {
        if (lastCommentAt == null) {
            // 没有有效评论时 last_comment_at 必须为 NULL，显式写 null 避免驱动对无类型参数报错
            return jdbc.update(
                    "update sy_post set comment_count = ?, last_comment_at = null, hot_score = ? where id = ?",
                    commentCount, hotScore, postId);
        }
        return jdbc.update(
                "update sy_post set comment_count = ?, last_comment_at = ?, hot_score = ? where id = ?",
                commentCount, lastCommentAt, hotScore, postId);
    }

    // ---------- 点赞（R-COM-25~27：共用一张表，target_type 区分，主键保证不重复） ----------

    /**
     * 幂等点赞：返回 1 表示新增，0 表示已点过赞。
     * <p>H2 没有 insert ignore，改为「先查后插」，并用主键冲突兜底并发；
     * 调用方（LikeService）已在事务内对目标行 for update，因此先查后插不会出现双计。
     */
    public int insertLike(String userId, String targetType, long targetId) {
        Integer exists = jdbc.queryForObject(
                "select count(*) from sy_community_like where user_id = ? and target_type = ? and target_id = ?",
                Integer.class, userId, targetType, targetId);
        if (exists != null && exists > 0) return 0;
        try {
            return jdbc.update("insert into sy_community_like(user_id, target_type, target_id) values(?, ?, ?)",
                    userId, targetType, targetId);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            return 0;
        }
    }

    /** 返回 1 表示确实删掉了一条，0 表示本来就没点赞。 */
    public int deleteLike(String userId, String targetType, long targetId) {
        return jdbc.update("delete from sy_community_like where user_id = ? and target_type = ? and target_id = ?",
                userId, targetType, targetId);
    }

    /** 只改 like_count 与 hot_score，不动 updated_at（点赞不等于编辑帖子）。 */
    public int updatePostLikeStats(long postId, long likeCount, double hotScore) {
        return jdbc.update("update sy_post set like_count = ?, hot_score = ? where id = ? and status = 1",
                likeCount, hotScore, postId);
    }

    public Map<String, Object> lockCommentForLike(long commentId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, post_id, like_count, status from sy_post_comment where id = ? and status = 1 for update", commentId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int updateCommentLikeCount(long commentId, long likeCount) {
        return jdbc.update("update sy_post_comment set like_count = ? where id = ? and status = 1", likeCount, commentId);
    }

    // ---------- 浏览数（R-COM-36） ----------

    /** 浏览接口用的轻量存在性检查：不读 body、不关联 user/topic。 */
    public boolean existsActive(long postId) {
        List<Integer> rows = jdbc.queryForList(
                "select 1 from sy_post where id = ? and status = 1 limit 1", Integer.class, postId);
        return !rows.isEmpty();
    }

    /** 原子累加浏览数；帖子已删除时影响行数为 0。 */
    public int addViewCount(long postId, long delta) {
        return jdbc.update("update sy_post set view_count = view_count + ? where id = ? and status = 1", delta, postId);
    }

    // ---------- 热度（R-COM-13） ----------

    /**
     * 批量重算最近 7 天有效帖子的 hot_score，公式与 CommunityService.hotScore 一致：
     * (评论*4 + 点赞*2 + 浏览*0.05) / POW(小时数 + 2, 1.5)。
     * 只覆盖 7 天窗口，避免每次全表更新；不改 updated_at（热度不是编辑）。
     */
    public int recalculateRecentHotScores() {
        return jdbc.update(
                "update sy_post set hot_score = (" +
                "  comment_count * 4 + like_count * 2 + view_count * 0.05" +
                ") / power(datediff('SECOND', created_at, now()) / 3600.0 + 2, 1.5) " +
                "where status = 1 and created_at >= dateadd('DAY', -7, now())");
    }

    /**
     * 取自增主键。
     * <p>不能直接用 {@code KeyHolder.getKey()}：H2 会把 {@code created_at default current_timestamp}
     * 这类带默认值的列也算进生成列，一次返回多列（ID + CREATED_AT）→ getKey() 抛
     * InvalidDataAccessApiUsageException；MySQL 只返回一列（GENERATED_KEY）。
     * 这里统一从 keyList 里按列名取 ID，两种驱动都能用。
     */
    private static long generatedKey(KeyHolder keys) {
        java.util.List<java.util.Map<String, Object>> list = keys.getKeyList();
        if (list == null || list.isEmpty()) return -1;
        Map<String, Object> row = list.get(0);
        Object v = row.get("ID");
        if (v == null) v = row.get("id");
        if (v == null) v = row.get("GENERATED_KEY");
        if (v == null && row.size() == 1) v = row.values().iterator().next();
        return v instanceof Number n ? n.longValue() : -1;
    }

    // ---------- 拼 SQL 的小工具 ----------

    /** 最近 n 天前的时间点（替代 H2 不支持的 date_sub(now(), interval n day)）。 */
    private static Timestamp daysAgo(int days) {
        return Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS));
    }

    private String where(String type, String title, String topicId, String range, List<Object> args) {
        StringBuilder w = new StringBuilder(" where p.status = 1");
        if (type != null) { w.append(" and p.type = ?"); args.add(type); }
        // R-COM-10：只搜标题，title like '%kw%'
        if (title != null) { w.append(" and p.title like ?"); args.add("%" + title + "%"); }
        if (topicId != null) { w.append(" and p.topic_id = ?"); args.add(topicId); }
        // R-COM-11：ALL / 3D / 7D / OLDER（早于 7 天）
        // 用参数传时间点而不是数据库函数，H2 与 MySQL 都能跑（语义与 A 的 date_sub 完全一致）
        if ("3D".equals(range)) { w.append(" and p.created_at >= ?"); args.add(daysAgo(3)); }
        else if ("7D".equals(range)) { w.append(" and p.created_at >= ?"); args.add(daysAgo(7)); }
        else if ("OLDER".equals(range)) { w.append(" and p.created_at < ?"); args.add(daysAgo(7)); }
        return w.toString();
    }

    /** R-COM-12：四种排序各走对应索引，排序交给数据库。 */
    private String orderBy(String sort) {
        return switch (sort == null ? "NEW" : sort) {
            case "COMMENTS" -> " order by p.comment_count desc, p.created_at desc, p.id desc";
            case "LIKES" -> " order by p.like_count desc, p.created_at desc, p.id desc";
            case "HOT" -> " order by p.hot_score desc, p.created_at desc, p.id desc";
            default -> " order by p.created_at desc, p.id desc";
        };
    }

    /**
     * 原始行（含已软删）。
     * <p>注意：不能 new LinkedHashMap&lt;&gt;(rows.get(0)) 拷贝——那会丢掉 Spring 的
     * 大小写不敏感列名 Map（H2 返回大写列名 STATUS，MySQL 返回小写 status），
     * 拷贝后 get("status") 在 H2 上拿到 null，会被误判成"帖子不存在"。
     */
    public Map<String, Object> row(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from sy_post where id = ?", id);
        if (rows.isEmpty()) return null;
        return rows.get(0);
    }
}
