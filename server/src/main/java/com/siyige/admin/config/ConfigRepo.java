package com.siyige.admin.config;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * sy_config / sy_config_log 的读写（只被 {@link ConfigService} 调用）。
 *
 * <p>为什么写库用「先 update，影响 0 行再 insert」而不是 upsert：
 * H2 与 MySQL 的 upsert 语法不同（`merge into … key(…)` vs `insert … on duplicate key update`），
 * 而这两条语句两边都通用，换库不用改 SQL —— 与 {@link com.siyige.admin.analytics.ModuleViewRepo} 同一考虑。
 *
 * <p>并发兜底：两个管理员同时第一次改同一个键，后到的 insert 会撞主键，
 * 捕获后回到 update 再写一次（与 ModuleViewRepo 的处理方式一致）。
 */
@Repository
public class ConfigRepo {

    private static final String FIND_ONE = "select k, v, type, updated_by, updated_at from sy_config where k = ?";
    private static final String FIND_ALL = "select k, v, type, updated_by, updated_at from sy_config";

    private static final String UPDATE_ONE =
            "update sy_config set v = ?, type = ?, updated_by = ?, updated_at = current_timestamp where k = ?";
    private static final String INSERT_ONE =
            "insert into sy_config(k, v, type, updated_by, updated_at) values (?, ?, ?, ?, current_timestamp)";

    private static final String DELETE_ONE = "delete from sy_config where k = ?";

    private static final String FIND_LOG =
            "select id, k, old_v, new_v, operator, created_at from sy_config_log where id = ?";
    private static final String FIND_LOGS =
            "select id, k, old_v, new_v, operator, created_at from sy_config_log order by id desc limit ?";
    private static final String FIND_LOGS_OF_KEY =
            "select id, k, old_v, new_v, operator, created_at from sy_config_log where k = ? order by id desc limit ?";
    private static final String INSERT_LOG =
            "insert into sy_config_log(k, old_v, new_v, operator, created_at) values (?, ?, ?, ?, current_timestamp)";

    private final JdbcTemplate jdbc;

    public ConfigRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 库里的原始值；没有这一行返回 null（= 该用枚举默认值）。 */
    public String find(String key) {
        Map<String, Object> row = findRow(key);
        return row == null ? null : str(row.get("v"));
    }

    /** 一行（值 + 谁改的 + 什么时候改的）；没有返回 null。 */
    public Map<String, Object> findRow(String key) {
        List<Map<String, Object>> rows = jdbc.queryForList(FIND_ONE, key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 全表（键 -> 行）：参数页一次查完，避免 10 次单查。 */
    public Map<String, Map<String, Object>> findAll() {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbc.queryForList(FIND_ALL)) {
            String k = str(row.get("k"));
            if (k != null) out.put(k, row);
        }
        return out;
    }

    /** 写一个键的值：有行就 update，没行才 insert。 */
    public void upsert(String key, String value, String type, String operator) {
        int n = jdbc.update(UPDATE_ONE, value, type, operator, key);
        if (n > 0) return;
        try {
            jdbc.update(INSERT_ONE, key, value, type, operator);
        } catch (DataIntegrityViolationException e) {
            // 并发下另一个管理员刚插入了同一行：改回 update，别把这次改动丢掉
            jdbc.update(UPDATE_ONE, value, type, operator, key);
        }
    }

    /** 删掉一个键（回滚到"库里没有这一行" = 回到枚举默认值）。 */
    public int delete(String key) {
        return jdbc.update(DELETE_ONE, key);
    }

    public Map<String, Object> log(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(FIND_LOG, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 历史（倒序）。{@code key} 为空 = 全部参数的最近若干条。 */
    public List<Map<String, Object>> logs(String key, int limit) {
        int n = Math.min(200, Math.max(1, limit));
        return key == null || key.isBlank()
                ? jdbc.queryForList(FIND_LOGS, n)
                : jdbc.queryForList(FIND_LOGS_OF_KEY, key, n);
    }

    /** 记一条历史。{@code oldValue} 为 null 表示改之前库里没有这一行。 */
    public void addLog(String key, String oldValue, String newValue, String operator) {
        jdbc.update(INSERT_LOG, key, oldValue, newValue, operator);
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }

    /** 行 -> 出参用的小工具（时间统一转 epoch 毫秒，与告警/处理记录一致）。 */
    public static Long millis(Object v) {
        if (v instanceof java.sql.Timestamp t) return t.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (v instanceof Number n) return n.longValue();
        return null;
    }

    /** 供 ConfigService 出参复用：把一页历史行转成前端要的 camelCase。 */
    public static List<Map<String, Object>> logView(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.get("id") instanceof Number n ? n.longValue() : r.get("id"));
            m.put("key", str(r.get("k")));
            m.put("oldValue", str(r.get("old_v")));
            m.put("newValue", str(r.get("new_v")));
            m.put("operator", str(r.get("operator")));
            m.put("createdAt", millis(r.get("created_at")));
            out.add(m);
        }
        return out;
    }
}
