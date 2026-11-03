package com.siyige.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * 账号认证状态的读取口（`sy_user.status` + `sy_user.pwd_changed_at`）。
 *
 * <p>给 {@link JwtAuthFilter} 用：**每个带 token 的请求都查一次**，
 * 所以管理员一封禁、或用户一改密，那个人的下一次请求立刻被踢（方案 §4）。
 *
 * <p>两件事**合并成一条 SQL**（用户决策 1）：
 * {@code select coalesce(status,1), pwd_changed_at from sy_user where id = ?}
 * ——没有理由为了同一个 id 查两次库。
 *
 * <p><b>故意不加缓存</b>（决策 8）：主键查询、H2 内存库微秒级；
 * 加缓存只会换来"封了/改密了还要等缓存过期才生效"。
 */
@Component
public class UserStatusSource {

    private final JdbcTemplate jdbc;

    public UserStatusSource(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 读一次认证状态。
     *
     * <p>用户不存在时返回 {@link AuthState#UNKNOWN}（不封禁、没改过密码）——
     * "查无此人"不是封禁也不是改密，交给业务层按 401/404 处理，
     * 免得 token 里有个不存在的 sub 就报「账号被封」误导人。
     */
    public AuthState authState(String userId) {
        if (userId == null || userId.isBlank()) return AuthState.UNKNOWN;

        List<Object[]> rows = jdbc.query(
                "select coalesce(status, 1) as st, pwd_changed_at from sy_user where id = ?",
                (rs, i) -> new Object[]{
                        rs.getInt("st"),
                        rs.getTimestamp("pwd_changed_at")
                },
                userId);

        if (rows.isEmpty()) return AuthState.UNKNOWN;

        Object[] row = rows.get(0);
        boolean disabled = ((Integer) row[0]) == 0;
        Timestamp changed = (Timestamp) row[1];
        Instant changedAt = changed == null ? null : changed.toInstant();
        return new AuthState(disabled, changedAt);
    }

    /** 便捷方法：是否被全站封禁。 */
    public boolean isDisabled(String userId) {
        return authState(userId).disabled();
    }
}
