package com.siyige.admin;

import com.siyige.admin.rbac.AdminRole;
import com.siyige.auth.AuthState;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * 管理员认证状态的读取口（`sy_admin.status` + `pwd_changed_at` + `role` + `must_change_pwd`）。
 *
 * <p>给 {@link AdminAuthFilter} 用：**每个带管理员令牌的请求都查一次**。
 * 改造前这个过滤器**完全不查库**（只验签名），意味着管理员改完密码、旧令牌照样能用 ——
 * 这个类是 B3 补上的那一环。
 *
 * <p>R1 起**一条 SQL 同时取四样东西**（设计方案 §3「加 role 不增加查询次数」）：
 * <pre>
 *   select coalesce(status,1), pwd_changed_at, role, must_change_pwd from sy_admin where id = ?
 * </pre>
 * 角色必须每请求现查：写进 JWT 的话，改角色要等令牌过期（2 小时）才生效。
 */
@Component
public class AdminStatusSource {

    private final JdbcTemplate jdbc;

    public AdminStatusSource(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 一次请求所需的全部认证信息。
     *
     * @param state      停用标记 + 改密时间（沿用用户侧同款 {@link AuthState}，秒级比较）
     * @param role       数据库里的角色；无法识别或为空 → null（调用方按 403 处理，**不默认超管**）
     * @param mustChangePwd 首登 / 重置密码后为 true：除改密和 /me 之外一律 403
     */
    public record AdminAuthInfo(AuthState state, AdminRole role, boolean mustChangePwd) {

        /** 账号不存在时的兜底（后续业务按 401 处理）。 */
        public static final AdminAuthInfo UNKNOWN =
                new AdminAuthInfo(AuthState.UNKNOWN, null, false);
    }

    /**
     * 读一次管理员的认证信息。
     *
     * <p>管理员不存在时返回 {@link AdminAuthInfo#UNKNOWN} —— "查无此人"由后续业务按 401 处理，
     * 不要误报成"账号被停用"。
     */
    public AdminAuthInfo authInfo(long adminId) {
        List<AdminAuthInfo> rows = jdbc.query(
                "select coalesce(status, 1) as st, pwd_changed_at, role, must_change_pwd "
                        + "from sy_admin where id = ?",
                (rs, i) -> {
                    boolean disabled = rs.getInt("st") == 0;
                    Timestamp changed = rs.getTimestamp("pwd_changed_at");
                    Instant changedAt = changed == null ? null : changed.toInstant();
                    AdminRole role = AdminRole.parse(rs.getString("role"));
                    boolean must = rs.getBoolean("must_change_pwd");
                    return new AdminAuthInfo(new AuthState(disabled, changedAt), role, must);
                },
                adminId);

        return rows.isEmpty() ? AdminAuthInfo.UNKNOWN : rows.get(0);
    }

    /**
     * 老接口：只要停用 + 改密时间（保留给既有调用方/单测，内部走同一条 SQL）。
     */
    public AuthState authState(long adminId) {
        return authInfo(adminId).state();
    }
}
