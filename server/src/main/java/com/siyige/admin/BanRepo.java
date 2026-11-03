package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * 社区禁言的写入 / 查询（`sy_community_ban`）。
 *
 * <p>读取侧（社区写操作前的校验）在 `com.siyige.community.MuteGuard`——
 * 这样依赖是单向的：admin → community，反过来不依赖。
 */
@Repository
public class BanRepo {

    private final JdbcTemplate jdbc;

    public BanRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** 该用户当前生效禁言的最晚到期时间；没有则 null。 */
    public Timestamp latestActiveUntil(String userId) {
        List<Timestamp> rows = jdbc.queryForList(
                "select until from sy_community_ban " +
                "where user_id = ? and until > ? order by until desc limit 1",
                Timestamp.class, userId, Timestamp.from(Instant.now()));
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int insert(String userId, long bannedBy, String reason, Timestamp until) {
        return insert(userId, bannedBy, reason, until, null);
    }

    /**
     * 插入一条禁言记录。
     *
     * @param reportId 触发这次禁言的举报 id（可空）。
     *                 注意：它只是**归属标记 + 审计追溯**用；一键恢复**不会**据此撤销禁言
     *                 （用户确认：恢复只恢复被删内容，解禁去用户管理页手动做）。
     */
    public int insert(String userId, long bannedBy, String reason, Timestamp until, Long reportId) {
        return jdbc.update(
                "insert into sy_community_ban(user_id, banned_by, reason, until, report_id) values(?, ?, ?, ?, ?)",
                userId, bannedBy, reason, until, reportId);
    }

    /**
     * 提前解除：把 still-active 的记录的 `until` 改成「现在」。
     *
     * <p>用改时间而不是 delete——保留历史（谁封过、封了多久），
     * 而 {@code until > now} 的判定天然把这条记录视为已失效。
     *
     * <p>减 1 秒是必须的：写进去的 `until` 带微秒，而校验时的 `now` 只取到毫秒，
     * 同一毫秒内比对会出现 {@code 16:17:59.446698 > 16:17:59.446000} 这种假阳性——
     * 现象就是"点了两次解禁的人，第二次解禁后仍然被禁言"。留一秒的余量彻底避开这个边界。
     */
    public int release(String userId) {
        Timestamp now = Timestamp.from(Instant.now());
        Timestamp past = Timestamp.from(Instant.now().minusSeconds(1));
        return jdbc.update(
                "update sy_community_ban set until = ? where user_id = ? and until > ?",
                past, userId, now);
    }

    /** 当前处于禁言状态的用户数（按人去重）。 */
    public long countActiveUsers() {
        Long n = jdbc.queryForObject(
                "select count(distinct user_id) from sy_community_ban where until > ?",
                Long.class, Timestamp.from(Instant.now()));
        return n == null ? 0 : n;
    }

    /** 该用户的禁言总次数（用户管理列表用）。 */
    public long countByUser(String userId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_community_ban where user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }
}
