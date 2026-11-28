package com.siyige.auth;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 认证模块的数据访问（sy_user 表，列由 schema-auth.sql 增量补齐）。
 *
 * <p>只做读写，不做任何业务判断（校验、哈希、限流都在 AuthService）。
 * 注意：{@code sy_user.name} 是**昵称**列，社区侧通过
 * {@code left join sy_user u on u.id = p.author_id} 取它展示——所以改名会立刻全站生效。
 */
@Repository
public class AuthRepo {

    private final JdbcTemplate jdbc;

    public AuthRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * 库里的用户行（含内部字段，勿直接序列化）。
     *
     * <p>{@code toString()} 不含 passwordHash，防止误打印。
     */
    public record UserRecord(String id, String account, String name, String passwordHash, int status,
                            boolean bot, String phone) {
        @Override
        public String toString() {
            // 手机号也不进日志/异常：要打就打脱敏形态（AuthService#maskPhone）
            return "UserRecord[id=" + id + ",account=" + account + ",status=" + status + ",bot=" + bot + "]";
        }
    }

    private static final String COLUMNS =
            "select id, account, name, password_hash, status, is_bot, phone from sy_user ";

    public UserRecord findByAccount(String account) {
        List<UserRecord> rows = jdbc.query(COLUMNS + "where account = ?", (rs, i) -> map(rs), account);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 按手机号找人（注册查重用）。
     *
     * <p>老账号的 phone 是 NULL，所以这里传 null/空串一定查不到 —— 调用方别拿它当"空号校验"。
     * 真正防重复的是唯一索引 ux_user_phone（并发时这个方法只是友好提示）。
     */
    public UserRecord findByPhone(String phone) {
        if (phone == null || phone.isBlank()) return null;
        List<UserRecord> rows = jdbc.query(COLUMNS + "where phone = ?", (rs, i) -> map(rs), phone);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public UserRecord findById(String id) {
        List<UserRecord> rows = jdbc.query(COLUMNS + "where id = ?", (rs, i) -> map(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static UserRecord map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Object status = rs.getObject("status");
        int st = status instanceof Number n ? n.intValue() : 1;
        // is_bot 由 schema-ai.sql 添加（0 = 普通用户 / 1 = AI 账号）
        Object bot = rs.getObject("is_bot");
        boolean isBot = bot instanceof Number bn && bn.intValue() == 1;
        // phone 由 schema-auth.sql 添加（2026-11-28）；老行为 NULL
        return new UserRecord(rs.getString("id"), rs.getString("account"),
                rs.getString("name"), rs.getString("password_hash"), st, isBot, rs.getString("phone"));
    }

    /**
     * 插入新账号。
     *
     * <p>id 直接等于 account（决策：id = 账号，见文档待裁决表）——{@code sy_user.id} 是
     * varchar(32)，账号规则是 3-32 位，正好放得下；也天然与历史 {@code u-demo} 这类
     * 带连字符的旧 id 隔离。
     *
     * <p>可能撞两个唯一索引：{@code ux_user_account} 或 {@code ux_user_phone}。
     *
     * @throws DuplicateKeyException 账号或手机号已存在（唯一索引兜底，并发安全 ——
     *         具体是哪一个由调用方用 {@link #findByPhone} / {@link #findByAccount} 判断）
     */
    public void insert(String account, String name, String passwordHash, String phone) {
        jdbc.update("insert into sy_user(id, account, name, password_hash, status, phone) "
                        + "values(?, ?, ?, ?, 1, ?)",
                account, account, name, passwordHash, phone);
    }

    public int updateName(String id, String name) {
        return jdbc.update("update sy_user set name = ? where id = ?", name, id);
    }

    /**
     * 改密：哈希与 pwd_changed_at **同一条 update** 写下去。
     *
     * <p>写时间那一刻起，早于它签发的令牌全部失效（见 {@link AuthState#isTokenStale}）。
     */
    public int changePassword(String id, String passwordHash, java.sql.Timestamp changedAt) {
        return jdbc.update("update sy_user set password_hash = ?, pwd_changed_at = ? where id = ?",
                passwordHash, changedAt, id);
    }
    /** 登录成功且 needsUpgrade 时重算并回写（参数/算法升级的平滑迁移）。 */
    public int updatePasswordHash(String id, String passwordHash) {
        return jdbc.update("update sy_user set password_hash = ? where id = ?", passwordHash, id);
    }
}
