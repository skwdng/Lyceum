package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 管理员数据访问（`sy_admin`，与 `sy_user` 完全独立的一套账号体系）。
 *
 * <p>只做读写，不做业务判断（校验 / 哈希 / 限流都在 {@link AdminAuthService}）。
 */
@Repository
public class AdminRepo {

    private final JdbcTemplate jdbc;

    public AdminRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * 库里的管理员行（含哈希，勿序列化）。
     *
     * <p>{@code toString()} 不含 passwordHash，防误打印。
     */
    public record AdminRecord(Long id, String account, String passwordHash, int status) {
        @Override
        public String toString() {
            return "AdminRecord[id=" + id + ",account=" + account + ",status=" + status + "]";
        }
    }

    private static final String COLUMNS = "select id, account, password_hash, status from sy_admin ";

    public AdminRecord findByAccount(String account) {
        List<AdminRecord> rows = jdbc.query(COLUMNS + "where account = ?", (rs, i) -> map(rs), account);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public AdminRecord findById(long id) {
        List<AdminRecord> rows = jdbc.query(COLUMNS + "where id = ?", (rs, i) -> map(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 改密：哈希与 pwd_changed_at **同一条 update** 写下去。
     *
     * <p>写下去那一刻起，该管理员早先签发的令牌全部失效（401 TOKEN_STALE）。
     */
    public int changePassword(long id, String passwordHash, java.sql.Timestamp changedAt) {
        return jdbc.update("update sy_admin set password_hash = ?, pwd_changed_at = ? where id = ?",
                passwordHash, changedAt, id);
    }
    /** 当前启用中的管理员数量（给 /api/admin/stats 用）。 */
    public long countActive() {
        Long n = jdbc.queryForObject("select count(*) from sy_admin where status = 1", Long.class);
        return n == null ? 0 : n;
    }

    /** 记录一次成功登录（管理员列表要显示"最后登录"）。失败不影响登录结果。 */
    public void touchLastLogin(long id) {
        jdbc.update("update sy_admin set last_login_at = current_timestamp where id = ?", id);
    }

    /** 清掉"首登必须改密"标记：改密成功之后调用。 */
    public int clearMustChangePwd(long id) {
        return jdbc.update("update sy_admin set must_change_pwd = false where id = ?", id);
    }

    private static AdminRecord map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Object status = rs.getObject("status");
        int st = status instanceof Number num ? num.intValue() : 1;
        return new AdminRecord(rs.getLong("id"), rs.getString("account"),
                rs.getString("password_hash"), st);
    }
}
