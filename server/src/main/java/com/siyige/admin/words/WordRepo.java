package com.siyige.admin.words;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * `sy_sensitive_word` 的读写（只被 {@link WordService} 调用）。
 *
 * <p>三条约定：
 * <ol>
 *   <li>列表/筛选都按 `scope + enabled` 走 `ix_word_scope`，百级词量下无所谓，万级也不慢；</li>
 *   <li>新增用「先查已有 key，再只插新的」+ 唯一索引兜底（重复导入幂等跳过，不让一条重复整批失败）；</li>
 *   <li>返回值全部转成 camelCase（`queryForList` 返回的是忽略大小写的 map，这里统一抄一份，
 *       免得调用方一会儿 `word_key` 一会儿 `wordKey`）。</li>
 * </ol>
 */
@Repository
public class WordRepo {

    private static final String COLS = "id, word, word_key, scope, enabled, created_by, created_at, updated_at";

    private final JdbcTemplate jdbc;

    public WordRepo(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 某个 scope 下**启用中**的词（缓存重建用，一次查全）。 */
    public List<String> enabledWords(WordScope scope) {
        return jdbc.queryForList(
                "select word from sy_sensitive_word where scope = ? and enabled = 1 order by id",
                String.class, scope.name());
    }

    /** 某个 scope 下的词数（含停用的）。启动时用它判断要不要从文件/yml 导入种子。 */
    public long count(WordScope scope) {
        Long n = jdbc.queryForObject("select count(*) from sy_sensitive_word where scope = ?",
                Long.class, scope.name());
        return n == null ? 0 : n;
    }

    /** 每个 scope 的「启用 / 停用 / 合计」计数（页面头部与汇总接口用）。 */
    public Map<WordScope, long[]> counts() {
        Map<WordScope, long[]> out = new LinkedHashMap<>();
        for (WordScope s : WordScope.values()) out.put(s, new long[]{0, 0});
        for (Map<String, Object> row : jdbc.queryForList(
                "select scope, enabled, count(*) as n from sy_sensitive_word group by scope, enabled")) {
            WordScope s = WordScope.ofOrNull(str(row.get("scope")));
            if (s == null) continue;
            long n = num(row.get("n"));
            boolean on = num(row.get("enabled")) == 1;
            long[] c = out.get(s);
            if (on) { c[0] += n; } else { c[1] += n; }
        }
        return out;
    }

    /** 某个 scope 下最近一次变更时间（epoch 毫秒；没有记录返回 null）。 */
    public Long lastChangedAt(WordScope scope) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select max(updated_at) as t from sy_sensitive_word where scope = ?", scope.name());
        if (rows.isEmpty()) return null;
        Object v = rows.get(0).get("t");
        if (v instanceof java.sql.Timestamp ts) return ts.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        return null;
    }

    /** 某个 scope 下最近一次是谁改的（`updated_at` 最大的那条）。 */
    public String lastChangedBy(WordScope scope) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select created_by from sy_sensitive_word where scope = ? order by updated_at desc, id desc limit 1",
                scope.name());
        return rows.isEmpty() ? null : str(rows.get(0).get("created_by"));
    }

    /** 某个 scope 下已存在的归一化键（批量导入前一次查完，避免 N 次单查）。 */
    public Set<String> existingKeys(WordScope scope) {
        return new LinkedHashSet<>(jdbc.queryForList(
                "select word_key from sy_sensitive_word where scope = ?", String.class, scope.name()));
    }

    /** 插一条；返回新行 id。唯一索引冲突时抛 DataIntegrityViolationException（调用方兜）。 */
    public long insert(WordScope scope, String word, String wordKey, String createdBy) {
        jdbc.update("insert into sy_sensitive_word(word, word_key, scope, enabled, created_by, created_at, updated_at) "
                        + "values (?, ?, ?, 1, ?, current_timestamp, current_timestamp)",
                word, wordKey, scope.name(), createdBy);
        Long id = jdbc.queryForObject("select max(id) from sy_sensitive_word where scope = ?",
                Long.class, scope.name());
        return id == null ? 0 : id;
    }

    public Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select " + COLS + " from sy_sensitive_word where id = ?", id);
        return rows.isEmpty() ? null : view(rows.get(0));
    }

    /** 启停：同时刷新 updated_at（页面「最近变更」靠它）。 */
    public int setEnabled(long id, boolean enabled) {
        return jdbc.update("update sy_sensitive_word set enabled = ?, updated_at = current_timestamp where id = ?",
                enabled ? 1 : 0, id);
    }

    public int delete(long id) {
        return jdbc.update("delete from sy_sensitive_word where id = ?", id);
    }

    /**
     * 后台列表（含停用词）。
     *
     * @param scope 可空 = 全部 scope
     * @param q     可空 = 不筛；按 `word` / `word_key` 模糊（不区分大小写靠 LOWER）
     */
    public List<Map<String, Object>> list(WordScope scope, String q, int offset, int size) {
        StringBuilder sql = new StringBuilder("select " + COLS + " from sy_sensitive_word where 1 = 1");
        List<Object> args = new ArrayList<>();
        if (scope != null) {
            sql.append(" and scope = ?");
            args.add(scope.name());
        }
        if (q != null && !q.isBlank()) {
            sql.append(" and (lower(word) like ? escape '!' or lower(word_key) like ? escape '!')");
            String like = "%" + q.trim().toLowerCase(java.util.Locale.ROOT)
                    .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            args.add(like);
            args.add(like);
        }
        sql.append(" order by scope, word_key limit ? offset ?");
        args.add(size);
        args.add(offset);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(sql.toString(), args.toArray())) out.add(view(row));
        return out;
    }

    public long countList(WordScope scope, String q) {
        StringBuilder sql = new StringBuilder("select count(*) from sy_sensitive_word where 1 = 1");
        List<Object> args = new ArrayList<>();
        if (scope != null) {
            sql.append(" and scope = ?");
            args.add(scope.name());
        }
        if (q != null && !q.isBlank()) {
            sql.append(" and (lower(word) like ? escape '!' or lower(word_key) like ? escape '!')");
            String like = "%" + q.trim().toLowerCase(java.util.Locale.ROOT)
                    .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            args.add(like);
            args.add(like);
        }
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    /** 导出用：某个 scope 的全部词（启用 + 停用分开取，导出只导启用的）。 */
    public List<String> wordsForExport(WordScope scope) {
        return jdbc.queryForList("select word from sy_sensitive_word where scope = ? and enabled = 1 order by word",
                String.class, scope.name());
    }

    /** 行 -> 出参（camelCase + epoch 毫秒，与告警/处理记录的口径一致）。 */
    private static Map<String, Object> view(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", num(row.get("id")));
        m.put("word", str(row.get("word")));
        m.put("wordKey", str(row.get("word_key")));
        m.put("scope", str(row.get("scope")));
        m.put("enabled", num(row.get("enabled")) == 1);
        m.put("createdBy", str(row.get("created_by")));
        m.put("createdAt", millis(row.get("created_at")));
        m.put("updatedAt", millis(row.get("updated_at")));
        return m;
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }

    private static long num(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v == null) return 0L;
        try { return Long.parseLong(String.valueOf(v)); } catch (NumberFormatException e) { return 0L; }
    }

    private static Long millis(Object v) {
        if (v instanceof java.sql.Timestamp ts) return ts.getTime();
        if (v instanceof java.time.LocalDateTime ldt) {
            return ldt.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
        }
        if (v instanceof Number n) return n.longValue();
        return null;
    }
}
