package com.siyige.admin;

import com.siyige.auth.AuthState;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * 管理员认证状态的读取口（`sy_admin.status` + `sy_admin.pwd_changed_at`）。
 *
 * <p>给 {@link AdminAuthFilter} 用：**每个带管理员令牌的请求都查一次**。
 * 改造前这个过滤器**完全不查库**（只验签名），意味着管理员改完密码、旧令牌照样能用 ——
 * 这个类是 B3 补上的那一环。
 *
 * <p>与用户端 {@link com.siyige.auth.UserStatusSource} 一样，两件事**合并成一条 SQL**：
 * {@code select coalesce(status,1), pwd_changed_at from sy_admin where id = ?}。
 *
 * <p>返回类型直接复用 {@link AuthState}：语义一模一样（是否停用 + 改密时间 + 秒级比较），
 * 没必要为管理员再造一个同形状的类。
 */
@Component
public class AdminStatusSource {

    private final JdbcTemplate jdbc;

    public AdminStatusSource(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 读一次管理员认证状态。
     *
     * <p>管理员不存在时返回 {@link AuthState#UNKNOWN}——"查无此人"由后续业务按 401 处理，
     * 不要误报成"账号被停用"。
     */
    public AuthState authState(long adminId) {
        List<Object[]> rows = jdbc.query(
                "select coalesce(status, 1) as st, pwd_changed_at from sy_admin where id = ?",
                (rs, i) -> new Object[]{rs.getInt("st"), rs.getTimestamp("pwd_changed_at")},
                adminId);

        if (rows.isEmpty()) return AuthState.UNKNOWN;

        Object[] row = rows.get(0);
        boolean disabled = ((Integer) row[0]) == 0;
        Timestamp changed = (Timestamp) row[1];
        Instant changedAt = changed == null ? null : changed.toInstant();
        return new AuthState(disabled, changedAt);
    }
}
