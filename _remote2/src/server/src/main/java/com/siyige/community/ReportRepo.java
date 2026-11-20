package com.siyige.community;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

/**
 * 举报的数据访问（`sy_report`，表由 schema-admin.sql 建）。
 *
 * <p>这里只放**用户侧**要用的读写：提交、查重、我的举报。
 * 管理端的聚合队列 / 详情 / 处理在 `com.siyige.admin.AdminReportRepo`——
 * 两边按用途分开，避免一个类既服务前台又服务后台。
 */
@Repository
public class ReportRepo {

    private final JdbcTemplate jdbc;

    public ReportRepo(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** 写入一条举报，返回自增 id。重复举报会抛 DuplicateKeyException（ux_report_once 兜底）。 */
    public long insert(String targetType, long targetId, String reporterId, String reason, String detail) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "insert into sy_report(target_type, target_id, reporter_id, reason, detail) " +
                    "values(?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, targetType);
            ps.setLong(2, targetId);
            ps.setString(3, reporterId);
            ps.setString(4, reason);
            ps.setString(5, detail);
            return ps;
        }, keys);
        long id = generatedKey(keys);
        if (id <= 0) throw new IllegalStateException("举报写入后没拿到自增 id");
        return id;
    }

    public boolean exists(String targetType, long targetId, String reporterId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_report " +
                "where target_type = ? and target_id = ? and reporter_id = ?",
                Long.class, targetType, targetId, reporterId);
        return n != null && n > 0;
    }

    public long countMine(String reporterId) {
        Long n = jdbc.queryForObject(
                "select count(*) from sy_report where reporter_id = ?", Long.class, reporterId);
        return n == null ? 0 : n;
    }

    /**
     * 「我的举报」列表：带上被举报目标的摘要（帖子取标题、评论取正文前 60 字）。
     *
     * <p>用 left join：目标被删掉之后，这条举报记录仍然要显示出来（状态照样能看）。
     */
    public List<Map<String, Object>> listMine(String reporterId, int offset, int limit) {
        return jdbc.queryForList(
                "select r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.action, " +
                "       r.created_at, r.handled_at, " +
                "       case when r.target_type = 'POST' then p.title else c.body end as target_summary " +
                "from sy_report r " +
                "left join sy_post p on r.target_type = 'POST' and p.id = r.target_id " +
                "left join sy_post_comment c on r.target_type = 'COMMENT' and c.id = r.target_id " +
                "where r.reporter_id = ? " +
                "order by r.created_at desc, r.id desc limit ? offset ?",
                reporterId, limit, offset);
    }

    /** H2 在 RETURN_GENERATED_KEYS 时会带出额外列，按 ID / id / GENERATED_KEY 依次找。 */
    private static long generatedKey(KeyHolder keys) {
        List<Map<String, Object>> list = keys.getKeyList();
        if (list == null || list.isEmpty()) return -1;
        Map<String, Object> row = list.get(0);
        Object v = row.get("ID");
        if (v == null) v = row.get("id");
        if (v == null) v = row.get("GENERATED_KEY");
        if (v == null && row.size() == 1) v = row.values().iterator().next();
        return v instanceof Number n ? n.longValue() : -1;
    }
}
