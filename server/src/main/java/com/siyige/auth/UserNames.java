package com.siyige.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 用户昵称查询（`sy_user.name`）。
 *
 * <p>为什么单独一个类：房间席位要把"人"显示成**账号昵称**，而昵称只能从账号表拿。
 * 辩论侧的 Controller / Service 不应该自己拼这条 SQL（它们不该知道账号表长什么样），
 * 所以收在这一个地方。
 *
 * <p>取名规则：查不到（老数据 / 账号已删）就**退回 userId 本身** ——
 * 至少显示 `u1` 而不是空白或"玩家"这种假名字，出问题时一眼能看出是数据缺失。
 */
@Component
public class UserNames {

    private final JdbcTemplate jdbc;

    public UserNames(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 账号昵称；查不到则退回 userId。 */
    public String name(String userId) {
        if (userId == null || userId.isBlank()) return null;
        List<String> rows = jdbc.query("select name from sy_user where id = ?",
                (rs, i) -> rs.getString(1), userId);
        if (rows.isEmpty()) return userId;
        String n = rows.get(0);
        return (n == null || n.isBlank()) ? userId : n;
    }
}
