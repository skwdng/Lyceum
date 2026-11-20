package com.siyige.admin.analytics;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.LocalDate;

/**
 * 两张统计表的读写（只被定时任务调用；管理台报表 P3 才读）。
 *
 * <p>为什么 SQL 里不做聚合、只做「加/取大」：
 * <ul>
 *   <li>PV 是累加量 —— {@code pv = pv + ?}，增量由定时任务从 Redis 取来；</li>
 *   <li>UV 是去重量，**不能累加** —— Redis 里的 HyperLogLog 只能整体读，
 *       所以落库用 {@code greatest(旧值, 新快照)} 覆盖，保证同一天多次快照只增不减、也不会重复加；</li>
 *   <li>先 update 再 insert（而不是 merge/upsert 语法）：H2 与 MySQL 的 upsert 写法不同，
 *       而这两条语句两边都通用，换库不用改 SQL（设计文档 §5.3 的同一考虑）。</li>
 * </ul>
 *
 * <p>列名是 {@code day_key}（不是设计初稿的 {@code day}）：`DAY` 是 H2 2.x 保留字，
 * 详见 schema-analytics.sql 顶部的说明。
 */
@Repository
public class ModuleViewRepo {

    private static final String ADD_PV =
            "update sy_module_view set pv = pv + ?, updated_at = current_timestamp where day_key = ? and module = ?";
    private static final String INSERT_PV =
            "insert into sy_module_view(day_key, module, pv, uv, updated_at) values (?, ?, ?, 0, current_timestamp)";

    private static final String MERGE_UV =
            "update sy_module_view set uv = greatest(uv, ?), updated_at = current_timestamp where day_key = ? and module = ?";
    private static final String INSERT_UV =
            "insert into sy_module_view(day_key, module, pv, uv, updated_at) values (?, ?, 0, ?, current_timestamp)";

    private static final String UPDATE_ACTIVE =
            "update sy_daily_active set dau = ?, new_users = ? where day_key = ?";
    private static final String INSERT_ACTIVE =
            "insert into sy_daily_active(day_key, dau, new_users) values (?, ?, ?)";

    private static final String COUNT_NEW_USERS =
            "select count(*) from sy_user where cast(created_at as date) = ?";

    private final JdbcTemplate jdbc;

    public ModuleViewRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** PV 累加：没有当天该模块的行就插一行。 */
    public void addPv(LocalDate day, String module, long pv) {
        Date d = Date.valueOf(day);
        int rows = jdbc.update(ADD_PV, pv, d, module);
        if (rows > 0) return;
        try {
            jdbc.update(INSERT_PV, d, module, pv);
        } catch (DataIntegrityViolationException e) {
            // 并发下另一条路径刚插入了同一行：改回累加，别让这次增量丢掉
            jdbc.update(ADD_PV, pv, d, module);
        }
    }

    /** UV 覆盖：只增不减（快照可能比库里小，那就保持库里的值）。 */
    public void mergeUv(LocalDate day, String module, long uv) {
        Date d = Date.valueOf(day);
        int rows = jdbc.update(MERGE_UV, uv, d, module);
        if (rows > 0) return;
        try {
            jdbc.update(INSERT_UV, d, module, uv);
        } catch (DataIntegrityViolationException e) {
            jdbc.update(MERGE_UV, uv, d, module);
        }
    }

    /** 日活：某一天的 DAU + 新增用户数（覆盖写，DAU 由 HLL 保证只增）。 */
    public void upsertDailyActive(LocalDate day, int dau, int newUsers) {
        Date d = Date.valueOf(day);
        int rows = jdbc.update(UPDATE_ACTIVE, dau, newUsers, d);
        if (rows > 0) return;
        try {
            jdbc.update(INSERT_ACTIVE, d, dau, newUsers);
        } catch (DataIntegrityViolationException e) {
            jdbc.update(UPDATE_ACTIVE, dau, newUsers, d);
        }
    }

    /** 某天注册的新用户数（直接数库，不做埋点：注册本来就有 sy_user.created_at 这个可靠来源）。 */
    public int countNewUsers(LocalDate day) {
        Integer n = jdbc.queryForObject(COUNT_NEW_USERS, Integer.class, Date.valueOf(day));
        return n == null ? 0 : n;
    }
}
