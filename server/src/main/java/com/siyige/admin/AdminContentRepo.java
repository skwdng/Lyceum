package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

/**
 * 内容管理（帖子 / 评论）的只读查询。**管理端专用**：能看到 `status = 2`（已屏蔽）的行。
 *
 * <p>为什么不复用 {@code CommunityRepo}：那边的每个查询都硬编码了 `status = 1`（用户侧只能看正常内容），
 * 而管理端恰恰要能看到被屏蔽的东西才能解除屏蔽。两边口径不同，共用一个 SQL 迟早要出问题
 * （辩题审核那边踩的是同一个坑，所以也是各自独立的 repo 方法）。
 *
 * <p>关键字搜索统一走 {@link #like(String)}：把 `% _ !` 转义后用 `escape '!'`。
 * 不转义的话，用户输入一个 `%` 就会全表命中。
 */
@Repository
public class AdminContentRepo {

    /** LIKE 的转义符。用 `!` 而不是反斜杠：反斜杠在 Java/SQL/H2 三层里都要各自转义一次，太容易写错。 */
    private static final char ESC = '!';

    private final JdbcTemplate jdbc;

    public AdminContentRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 把用户输入处理成 LIKE 模式串（转义 `%` `_` 与转义符本身）。 */
    public static String like(String q) {
        String s = q.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return "%" + s + "%";
    }

    // ==================== 帖子 ====================

    public long countPosts(String q, String type, Integer status, String authorId, Timestamp from, Timestamp toExcl) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_post p");
        List<Object> args = new java.util.ArrayList<>();
        appendPostFilters(sql, args, q, type, status, authorId, from, toExcl);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> listPosts(String q, String type, Integer status, String authorId,
                                               Timestamp from, Timestamp toExcl, int offset, int limit) {
        StringBuilder sql = new StringBuilder(
                "select p.id, p.author_id, p.type, p.title, p.excerpt, p.status, p.comment_count, "
                        + "p.like_count, p.view_count, p.created_at, u.name as author_name "
                        + "from sy_post p left join sy_user u on u.id = p.author_id");
        List<Object> args = new java.util.ArrayList<>();
        appendPostFilters(sql, args, q, type, status, authorId, from, toExcl);
        sql.append(" order by p.created_at desc, p.id desc limit ? offset ?");
        args.add(limit);
        args.add(offset);
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    private void appendPostFilters(StringBuilder sql, List<Object> args, String q, String type,
                                   Integer status, String authorId, Timestamp from, Timestamp toExcl) {
        sql.append(" where 1 = 1");
        if (status != null) {
            sql.append(" and p.status = ?");
            args.add(status);
        }
        if (type != null && !type.isBlank()) {
            sql.append(" and p.type = ?");
            args.add(type.trim());
        }
        if (authorId != null && !authorId.isBlank()) {
            sql.append(" and p.author_id = ?");
            args.add(authorId.trim());
        }
        if (from != null) {
            sql.append(" and p.created_at >= ?");
            args.add(from);
        }
        if (toExcl != null) {
            sql.append(" and p.created_at < ?");
            args.add(toExcl);
        }
        if (q != null && !q.isBlank()) {
            sql.append(" and (p.title like ? escape '").append(ESC).append("'")
                    .append(" or p.body like ? escape '").append(ESC).append("')");
            args.add(like(q.trim()));
            args.add(like(q.trim()));
        }
    }

    /** 帖子详情（**任何状态**都能查，管理端要看得到已被屏蔽的）。 */
    public Map<String, Object> findPost(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select p.id, p.author_id, p.type, p.title, p.body, p.excerpt, p.topic_id, p.status, "
                        + "p.comment_count, p.like_count, p.view_count, p.hot_score, p.created_at, p.updated_at, "
                        + "u.name as author_name, u.status as author_status "
                        + "from sy_post p left join sy_user u on u.id = p.author_id where p.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ==================== 评论 ====================

    private void appendCommentFilters(StringBuilder sql, List<Object> args, String q, Integer status,
                                      String authorId, Long postId, Timestamp from, Timestamp toExcl) {
        sql.append(" where 1 = 1");
        if (status != null) {
            sql.append(" and c.status = ?");
            args.add(status);
        }
        if (postId != null) {
            sql.append(" and c.post_id = ?");
            args.add(postId);
        }
        if (authorId != null && !authorId.isBlank()) {
            sql.append(" and c.user_id = ?");
            args.add(authorId.trim());
        }
        // 时间范围用左闭右开（和帖子列表一致）：to 传的是"结束日期"，上层已 +1 天
        if (from != null) {
            sql.append(" and c.created_at >= ?");
            args.add(from);
        }
        if (toExcl != null) {
            sql.append(" and c.created_at < ?");
            args.add(toExcl);
        }
        if (q != null && !q.isBlank()) {
            sql.append(" and c.body like ? escape '").append(ESC).append("'");
            args.add(like(q.trim()));
        }
    }

    private static final String COMMENT_SELECT =
            "select c.id, c.post_id, c.user_id, c.root_id, c.body, c.status, c.created_at, "
                    + "c.reply_object_type, c.reply_object_comment_id, "
                    + "u.name as author_name, p.title as post_title, p.status as post_status "
                    + "from sy_post_comment c "
                    + "left join sy_user u on u.id = c.user_id "
                    + "left join sy_post p on p.id = c.post_id";

    public long countComments(String q, Integer status, String authorId, Long postId,
                              Timestamp from, Timestamp toExcl) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_post_comment c");
        List<Object> args = new java.util.ArrayList<>();
        appendCommentFilters(sql, args, q, status, authorId, postId, from, toExcl);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> listComments(String q, Integer status, String authorId, Long postId,
                                                  Timestamp from, Timestamp toExcl, int offset, int limit) {
        StringBuilder sql = new StringBuilder(COMMENT_SELECT);
        List<Object> args = new java.util.ArrayList<>();
        appendCommentFilters(sql, args, q, status, authorId, postId, from, toExcl);
        sql.append(" order by c.created_at desc, c.id desc limit ? offset ?");
        args.add(limit);
        args.add(offset);
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    /** 某帖的顶层评论（楼）分页；`root_id is null` 才是楼。 */
    public long countRootComments(long postId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_post_comment where post_id = ? and root_id is null", Long.class, postId);
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> listRootComments(long postId, int offset, int limit) {
        return jdbc.queryForList(
                COMMENT_SELECT + " where c.post_id = ? and c.root_id is null "
                        + "order by c.created_at asc, c.id asc limit ? offset ?",
                postId, limit, offset);
    }

    /** 给定楼的楼中楼（一次查完，避免 N+1）。 */
    public List<Map<String, Object>> listReplies(java.util.Collection<Long> rootIds) {
        if (rootIds == null || rootIds.isEmpty()) return List.of();
        String marks = String.join(",", java.util.Collections.nCopies(rootIds.size(), "?"));
        Object[] args = rootIds.toArray();
        return jdbc.queryForList(
                COMMENT_SELECT + " where c.root_id in (" + marks + ") order by c.created_at asc, c.id asc", args);
    }

    /** 单条评论（含已屏蔽）。 */
    public Map<String, Object> findComment(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(COMMENT_SELECT + " where c.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 统一入口：返回 {id, author_id, status, title} 供屏蔽/解除屏蔽判断用。 */
    public Map<String, Object> findContent(String type, long id) {
        if ("POST".equals(type)) {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "select id, author_id, status, title from sy_post where id = ?", id);
            return rows.isEmpty() ? null : rows.get(0);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select c.id, c.user_id as author_id, c.status, c.post_id, p.title "
                        + "from sy_post_comment c left join sy_post p on p.id = c.post_id where c.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 作者摘要（浮窗要用，先放在这里；批次 4 的 profile 接口复用）。 */
    public Map<String, Object> userBrief(String userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, status, created_at, is_bot from sy_user where id = ?", userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ==================== 用户违规浮窗（批次 4） ====================

    public long countUserPosts(String userId, Integer status) {
        Long n = status == null
                ? jdbc.queryForObject("select count(*) from sy_post where author_id = ?", Long.class, userId)
                : jdbc.queryForObject("select count(*) from sy_post where author_id = ? and status = ?",
                Long.class, userId, status);
        return n == null ? 0 : n;
    }

    public long countUserComments(String userId, Integer status) {
        Long n = status == null
                ? jdbc.queryForObject("select count(*) from sy_post_comment where user_id = ?", Long.class, userId)
                : jdbc.queryForObject("select count(*) from sy_post_comment where user_id = ? and status = ?",
                Long.class, userId, status);
        return n == null ? 0 : n;
    }

    public long countUserMatches(String userId) {
        Long n = jdbc.queryForObject("select count(*) from sy_match where user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    public long walletCents(String userId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select balance_cents from sy_wallet where user_id = ?", userId);
        return rows.isEmpty() ? 0 : ((Number) rows.get(0).get("balance_cents")).longValue();
    }

    /** 生效中的社区禁言（`until > now`）。 */
    public boolean isMuted(String userId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_community_ban where user_id = ? and until > ?",
                Long.class, userId, new Timestamp(System.currentTimeMillis()));
        return n != null && n > 0;
    }

    /** 禁言历史（新的在前）。 */
    public List<Map<String, Object>> banHistory(String userId, int limit) {
        return jdbc.queryForList(
                "select b.reason, b.banned_by, b.until, b.created_at, a.account as operator "
                        + "from sy_community_ban b left join sy_admin a on a.id = b.banned_by "
                        + "where b.user_id = ? order by b.created_at desc, b.until desc limit ?",
                userId, limit);
    }

    /** 被屏蔽的内容（来自处理记录里与该作者相关的 DELETE 类处置）。 */
    public List<Map<String, Object>> hiddenContent(String userId, int limit) {
        // post_id：前端点这条记录要能直接打开「帖子详情抽屉」并定位到那条评论，
        // 而审计表里只存了 target_type + target_id，所以在这条 SQL 里把所属帖子算出来。
        return jdbc.queryForList(
                "select a.id, a.target_type, a.target_id, a.detail, a.source, a.admin_name, "
                        + "       a.created_at, a.undo_at, "
                        + "       case when a.target_type = 'POST' then a.target_id "
                        + "            when a.target_type = 'COMMENT' then c.post_id end as post_id "
                        + "from sy_audit_log a "
                        + "left join sy_post_comment c on a.target_type = 'COMMENT' and c.id = a.target_id "
                        + "where a.target_owner = ? and a.verdict in ('DELETE', 'DELETE_AND_BAN') "
                        + "order by a.created_at desc, a.id desc limit ?",
                userId, limit);
    }
}
