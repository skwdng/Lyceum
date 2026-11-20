package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理员账号表（`sy_admin`）的读写 —— R2 账号管理专用。
 *
 * <p>与 {@link AdminRepo} 的分工：{@code AdminRepo} 是登录/改密那条老路径（只按 account/id 取单行），
 * 这里是**管理台**要用的批量读写（列表、建号、改角色、停用、重置密码、最后登录）。
 * 两边都只碰 `sy_admin`，都不做业务判断（规则在 {@link AdminAccountService}）。
 *
 * <p>**任何方法都不返回密码哈希给上层视图**：除了 {@link #findHashForLogin} 这类内部用途，
 * 列表查询刻意不 select password_hash。
 */
@Repository
public class AdminAccountRepo {

    private final JdbcTemplate jdbc;

    public AdminAccountRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 管理员列表（**不含** password_hash）。 */
    public List<Map<String, Object>> list() {
        return jdbc.query(
                "select id, account, role, status, must_change_pwd, created_at, created_by, "
                        + "last_login_at, role_changed_at from sy_admin order by id",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("account", rs.getString("account"));
                    m.put("role", rs.getString("role"));
                    m.put("status", rs.getInt("status"));
                    m.put("must_change_pwd", rs.getBoolean("must_change_pwd"));
                    m.put("created_at", rs.getTimestamp("created_at"));
                    m.put("created_by", rs.getString("created_by"));
                    m.put("last_login_at", rs.getTimestamp("last_login_at"));
                    m.put("role_changed_at", rs.getTimestamp("role_changed_at"));
                    return m;
                });
    }

    public Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, account, role, status, must_change_pwd, created_at, created_by, "
                        + "last_login_at, role_changed_at from sy_admin where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public boolean existsByAccount(String account) {
        Long n = jdbc.queryForObject("select count(*) from sy_admin where account = ?", Long.class, account);
        return n != null && n > 0;
    }

    /** 建号，返回新 id。 */
    public long insert(String account, String passwordHash, String role, String createdBy) {
        jdbc.update("insert into sy_admin(account, password_hash, role, status, must_change_pwd, created_by) "
                        + "values (?, ?, ?, 1, true, ?)",
                account, passwordHash, role, createdBy);
        Long id = jdbc.queryForObject("select id from sy_admin where account = ?", Long.class, account);
        return id == null ? 0L : id;
    }

    public int updateRole(long id, String role) {
        return jdbc.update("update sy_admin set role = ?, role_changed_at = ? where id = ?",
                role, Timestamp.from(Instant.now()), id);
    }

    public int updateStatus(long id, boolean enabled) {
        return jdbc.update("update sy_admin set status = ? where id = ?", enabled ? 1 : 0, id);
    }

    /**
     * 重置密码：新哈希 + `must_change_pwd = true` + **`pwd_changed_at = now`**。
     *
     * <p>最后这一项很关键：它让该管理员**手上还在用的旧令牌立刻失效**（401 TOKEN_STALE），
     * 否则重置密码等于没重置（对方旧会话照旧能用）。
     */
    public int resetPassword(long id, String passwordHash) {
        return jdbc.update(
                "update sy_admin set password_hash = ?, must_change_pwd = true, pwd_changed_at = ? where id = ?",
                passwordHash, Timestamp.from(Instant.now()), id);
    }

    /** 首登改密完成后清标记（由 AdminAuthService.changePassword 调）。 */
    public int clearMustChangePwd(long id) {
        return jdbc.update("update sy_admin set must_change_pwd = false where id = ?", id);
    }

    public int touchLastLogin(long id) {
        return jdbc.update("update sy_admin set last_login_at = ? where id = ?",
                Timestamp.from(Instant.now()), id);
    }

    /** 启用中的超管数量；`excludeId` 用来算"把某个人降级/停用之后还剩几个超管"。 */
    public long countEnabledSupers(long excludeId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_admin where role = 'SUPER' and status = 1 and id <> ?",
                Long.class, excludeId);
        return n == null ? 0 : n;
    }
}
