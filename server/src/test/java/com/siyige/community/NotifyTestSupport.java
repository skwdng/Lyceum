package com.siyige.community;

import com.siyige.auth.UserNames;
import org.h2.jdbcx.JdbcDataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.UUID;

/**
 * 通知相关单测的公共夹具：真实 H2（跑 schema.sql + community + auth + notify）+ 内存计数器。
 *
 * <p>为什么用真实 H2 而不是 mock：聚合/翻页/已读这些行为**全在 SQL 里**
 * （`is_read` 过滤、`in` 批量更新、唯一索引、`countLikes` 重算），
 * mock 掉 repo 就等于把要测的东西全绕过去了。
 *
 * <p>计数器用 {@link InMemoryUnreadCounter}：语义与 Redis 实现逐条对齐，
 * 单测不起 Redis 也能验证「减到 0 删 field」「field 不在时返回 -1」。
 */
final class NotifyTestSupport {

    final JdbcTemplate jdbc;
    final NotificationRepo repo;
    final InMemoryUnreadCounter counter;
    final NotificationService service;

    private NotifyTestSupport(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.repo = new NotificationRepo(jdbc);
        this.counter = new InMemoryUnreadCounter();
        this.service = new NotificationService(repo, counter, new UserNames(jdbc));
    }

    static NotifyTestSupport fresh() {
        try {
            JdbcDataSource ds = new JdbcDataSource();
            ds.setURL("jdbc:h2:mem:notify" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
            ds.setUser("sa");
            ds.setPassword("");
            JdbcTemplate jdbc = new JdbcTemplate(ds);
            try (Connection c = ds.getConnection()) {
                for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-auth.sql",
                    "schema-admin.sql", "schema-security.sql", "schema-notify.sql"}) {
                    ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
                }
            }
            return new NotifyTestSupport(jdbc);
        } catch (Exception e) {
            throw new IllegalStateException("初始化测试库失败", e);
        }
    }

    // ==================== 造数据 ====================

    void user(String id, String name) {
        jdbc.update("insert into sy_user(id, name, account, password_hash, status) values(?, ?, ?, 'x', 1)",
                id, name, id);
    }

    long post(String authorId, String title) {
        jdbc.update("insert into sy_post(author_id, type, title, body, excerpt) values(?, 'CHAT', ?, '正文', ?)",
                authorId, title, title);
        return jdbc.queryForObject("select max(id) from sy_post", Long.class);
    }

    long comment(long postId, String userId, String body) {
        jdbc.update("insert into sy_post_comment(post_id, user_id, body) values(?, ?, ?)", postId, userId, body);
        return jdbc.queryForObject("select max(id) from sy_post_comment", Long.class);
    }

    void addLike(String userId, String targetType, long targetId) {
        jdbc.update("insert into sy_community_like(user_id, target_type, target_id) values(?, ?, ?)",
                userId, targetType, targetId);
    }

    void removeLike(String userId, String targetType, long targetId) {
        jdbc.update("delete from sy_community_like where user_id = ? and target_type = ? and target_id = ?",
                userId, targetType, targetId);
    }

    /** 直接把一条通知写进库并 +1 计数（模拟"历史上产生过 n 条未读"）。 */
    long notify(String userId, String type, String actorId, String actorName,
                Long targetId, Long postId, String excerpt, String note) {
        long id = repo.insert(userId, type, actorId, actorName, targetId, postId, excerpt, note);
        counter.incr(userId);
        return id;
    }

    // ==================== 断言辅助 ====================

    Object field(String table, String column, String where, Object... args) {
        return jdbc.queryForObject("select " + column + " from " + table + " where " + where, Object.class, args);
    }

    void setCreatedAt(long notificationId, String literal) {
        jdbc.update("update sy_notification set created_at = timestamp '" + literal + "' where id = ?", notificationId);
    }
}
