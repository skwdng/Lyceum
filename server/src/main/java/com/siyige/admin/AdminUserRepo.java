package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 管理端「用户管理」的数据访问（**只读 sy_user + 只写 status**）。
 *
 * <p>不动 `sy_user` 的表结构、不动账号/密码列；只把 `status` 当全站封禁开关用（决策 D3b）。
 */
@Repository
public class AdminUserRepo {

    private final JdbcTemplate jdbc;

    public AdminUserRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static final String BASE_FROM =
            " from sy_user u where u.account is not null ";

    /** 只列出「有账号的真实用户」：历史 u-demo / u-tester 的 account 为 NULL，不算可管理用户。 */
    private static String whereClause(String q, List<Object> args) {
        StringBuilder w = new StringBuilder(BASE_FROM);
        if (q != null && !q.isBlank()) {
            w.append(" and (lower(u.account) like ? or lower(u.name) like ?) ");
            String like = "%" + q.trim().toLowerCase() + "%";
            args.add(like);
            args.add(like);
        }
        return w.toString();
    }

    public long count(String q) {
        List<Object> args = new ArrayList<>();
        String sql = "select count(*)" + whereClause(q, args);
        Long n = jdbc.queryForObject(sql, Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /**
     * 用户列表：账号 / 昵称 / 全站状态 / 是否禁言中 / 禁言到期 / 待处理举报数。
     *
     * <p>待处理举报数 = 该用户作为作者、且举报还在 PENDING 的条数——管理端一眼看出该先看谁。
     */
    public List<Map<String, Object>> list(String q, int offset, int limit) {
        List<Object> args = new ArrayList<>();
        String where = whereClause(q, args);
        Timestamp now = Timestamp.from(Instant.now());

        String sql = "select u.id, u.account, u.name, coalesce(u.status, 1) as status, " +
                "  (select count(*) from sy_community_ban b where b.user_id = u.id and b.until > ?) as ban_active, " +
                "  (select max(b.until) from sy_community_ban b where b.user_id = u.id and b.until > ?) as ban_until, " +
                "  (select count(*) from sy_report r " +
                "     left join sy_post p on r.target_type = 'POST' and p.id = r.target_id " +
                "     left join sy_post_comment c on r.target_type = 'COMMENT' and c.id = r.target_id " +
                "    where r.status = 'PENDING' and (p.author_id = u.id or c.user_id = u.id)) as pending_reports " +
                where +
                " order by pending_reports desc, u.id limit ? offset ?";

        List<Object> all = new ArrayList<>();
        all.add(now);
        all.add(now);
        all.addAll(args);
        all.add(limit);
        all.add(offset);
        return jdbc.queryForList(sql, all.toArray());
    }

    public Map<String, Object> findById(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select u.id, u.account, u.name, coalesce(u.status, 1) as status " +
                "from sy_user u where u.id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 全站封禁开关：0 封禁 / 1 正常。返回影响行数。 */
    public int setStatus(String id, int status) {
        return jdbc.update("update sy_user set status = ? where id = ?", status, id);
    }

    /** 当前被封禁（status = 0）的用户数。 */
    public long countDisabled() {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_user where coalesce(status, 1) = 0 and account is not null",
                Long.class);
        return n == null ? 0 : n;
    }
}
