package com.siyige.admin;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 辩题审核的管理端查询。
 *
 * <p><b>刻意不复用 `Store.topics()`</b>：那个方法是给前台题库用的，会过滤掉被驳回/下架的题；
 * 管理端恰恰要能看到被驳回的题才能改判。两边口径不同，共用一条 SQL 迟早出事，
 * 所以这里单独写一条**不过滤 `mod_status`** 的查询。
 */
@Repository
public class AdminTopicRepo {

    private final JdbcTemplate jdbc;

    public AdminTopicRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private void where(StringBuilder sql, List<Object> args, String modStatus, String source, String q,
                       String id, Timestamp from, Timestamp toExcl) {
        sql.append(" where 1 = 1");
        if (modStatus != null && !modStatus.isBlank() && !"ALL".equalsIgnoreCase(modStatus)) {
            sql.append(" and coalesce(mod_status, 'PASS') = ?");
            args.add(modStatus.trim().toUpperCase());
        }
        if (source != null && !source.isBlank()) {
            sql.append(" and source = ?");
            args.add(source.trim());
        }
        if (id != null && !id.isBlank()) {
            sql.append(" and id = ?");           // 题目 id 是 varchar，精确匹配
            args.add(id.trim());
        }
        // 日期筛的是**审核时间**（mod_at）。sy_topic 没有 created_at，未审核的题 mod_at 为空，
        // 所以一旦按日期筛，结果里不会出现"还没审过"的题 —— 这是符合直觉的口径。
        if (from != null) {
            sql.append(" and mod_at >= ?");
            args.add(from);
        }
        if (toExcl != null) {
            sql.append(" and mod_at < ?");
            args.add(toExcl);
        }
        if (q != null && !q.isBlank()) {
            // 与内容管理一致的转义写法：用 ! 做转义符，避免 % / _ 变成通配
            String like = "%" + q.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            sql.append(" and title like ? escape '!'");
            args.add(like);
        }
    }

    public long count(String modStatus, String source, String q, String id, Timestamp from, Timestamp toExcl) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_topic");
        List<Object> args = new ArrayList<>();
        where(sql, args, modStatus, source, q, id, from, toExcl);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<Map<String, Object>> list(String modStatus, String source, String q, String id,
                                          Timestamp from, Timestamp toExcl, int offset, int limit) {
        StringBuilder sql = new StringBuilder(
                "select id, title, cat, diff, source, plays, mod_status, mod_reason, mod_at from sy_topic");
        List<Object> args = new ArrayList<>();
        where(sql, args, modStatus, source, q, id, from, toExcl);
        // sy_topic 没有 created_at，所以按"有审核时间的排前面"再按热度排（避免 NULL 排到两头不统一）
        sql.append(" order by case when mod_at is null then 1 else 0 end, mod_at desc, plays desc limit ? offset ?");
        args.add(limit);
        args.add(offset);
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    /** 单题（任何审核状态都能查）。 */
    public Map<String, Object> find(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, title, cat, diff, source, plays, mod_status, mod_reason, mod_at "
                        + "from sy_topic where id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
