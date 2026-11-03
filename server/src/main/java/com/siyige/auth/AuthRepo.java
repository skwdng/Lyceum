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
    public record UserRecord(String id, String account, String name, String passwordHash, int status) {
        @Override
        public String toString() {
            return "UserRecord[id=" + id + ",account=" + account + ",status=" + status + "]";
        }
    }

    private static final String COLUMNS =
            "select id, account, name, password_hash, status from sy_user ";

    public UserRecord findByAccount(String account) {
        List<UserRecord> rows = jdbc.query(COLUMNS + "where account = ?", (rs, i) -> map(rs), account);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public UserRecord findById(String id) {
        List<UserRecord> rows = jdbc.query(COLUMNS + "where id = ?", (rs, i) -> map(rs), id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static UserRecord map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Object status = rs.getObject("status");
        int st = status instanceof Number n ? n.intValue() : 1;
        return new UserRecord(rs.getString("id"), rs.getString("account"),
                rs.getString("name"), rs.getString("password_hash"), st);
    }

    /**
     * 插入新账号。
     *
     * <p>id 直接等于 account（决策：id = 账号，见文档待裁决表）——{@code sy_user.id} 是
     * varchar(32)，账号规则是 3-32 位，正好放得下；也天然与历史 {@code u-demo} 这类
     * 带连字符的旧 id 隔离。
     *
     * @throws DuplicateKeyException 账号已存在（唯一索引 ux_user_account 兜底，并发安全）
     */
    public void insert(String account, String name, String passwordHash) {
        jdbc.update("insert into sy_user(id, account, name, password_hash, status) values(?, ?, ?, ?, 1)",
                account, account, name, passwordHash);
    }

    public int updateName(String id, String name) {
        return jdbc.update("update sy_user set name = ? where id = ?", name, id);
    }

    /** 登录成功且 needsUpgrade 时重算并回写（参数/算法升级的平滑迁移）。 */
    public int updatePasswordHash(String id, String passwordHash) {
        return jdbc.update("update sy_user set password_hash = ? where id = ?", passwordHash, id);
    }
}
