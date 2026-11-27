package com.siyige;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 两份 schema 的一致性守卫：H2 的 16 个 schema-*.sql 与 MySQL 的 schema-mysql-full.sql。
 *
 * <p><b>为什么要有这个测试</b>：加了 mysql profile 之后，项目同时维护两套建表语句 ——
 * 加一张表/一列要改两遍。忘了改一边，H2 测试全绿、切到 MySQL 就报 Unknown column。
 * 这个测试用**真的 H2** 跑一遍那 16 个文件，再解析 MySQL 那份 DDL，逐表逐列比对。
 *
 * <p>不一致时的处理原则：以 H2（默认 profile、所有单测跑的那套）为准，
 * 去同步 docs/migration-mysql/schema-mysql-full.sql 与 resources/schema-mysql-full.sql（两份内容必须一致）。
 */
class SchemaParityTest {

    /** application.yml 里 schema-locations 的顺序（顺序有意义：alter 依赖前面建的表）。 */
    private static final String[] H2_FILES = {
            "schema.sql", "schema-community.sql", "schema-tag.sql", "schema-video.sql",
            "schema-auth.sql", "schema-admin.sql", "schema-security.sql", "schema-pay.sql",
            "schema-userllm.sql", "schema-notify.sql", "schema-ai.sql", "schema-social.sql",
            "schema-analytics.sql", "schema-alert.sql", "schema-config.sql", "schema-word.sql"
    };

    private static final String MYSQL_FILE = "schema-mysql-full.sql";
    private static final char TICK = '\u0060';

    @Test
    void H2与MySQL的表和列必须完全一致() throws Exception {
        Map<String, Set<String>> h2 = h2Schema();
        Map<String, Set<String>> mysql = mysqlSchema();

        assertTrue(h2.size() > 20, "H2 建出来的表太少，schema 文件可能没跑起来：" + h2.size());
        assertEquals(new TreeSet<>(h2.keySet()), new TreeSet<>(mysql.keySet()),
                "两边表集合不一致，只在 H2：" + minus(h2.keySet(), mysql.keySet())
                        + "；只在 MySQL：" + minus(mysql.keySet(), h2.keySet()));

        List<String> problems = new ArrayList<>();
        for (String table : new TreeSet<>(h2.keySet())) {
            Set<String> onlyH2 = minus(h2.get(table), mysql.get(table));
            Set<String> onlyMy = minus(mysql.get(table), h2.get(table));
            if (!onlyH2.isEmpty()) problems.add(table + " 缺列（H2 有、MySQL 没有）: " + onlyH2);
            if (!onlyMy.isEmpty()) problems.add(table + " 多列（MySQL 有、H2 没有）: " + onlyMy);
        }
        assertTrue(problems.isEmpty(), "两套 schema 漂移了，按下面清单同步：\n" + String.join("\n", problems));
    }

    @Test
    void MySQL里声明的索引列都必须真实存在() throws Exception {
        Map<String, Set<String>> cols = mysqlSchema();
        List<String> problems = new ArrayList<>();
        for (TableBlock block : tableBlocks(read(MYSQL_FILE))) {
            Set<String> have = cols.getOrDefault(block.table().toLowerCase(Locale.ROOT), Set.of());
            for (String[] idx : block.indexes()) {
                for (String col : idx[1].split(",")) {
                    // 索引项可能是「列 方向」或「列(前缀长度)」：只取第一段
                    String c = col.trim().split("\\s+")[0].replace(String.valueOf(TICK), "").toLowerCase(Locale.ROOT);
                    int brace = c.indexOf('(');
                    if (brace > 0) c = c.substring(0, brace);
                    if (c.isEmpty()) continue;
                    if (!have.contains(c)) {
                        problems.add(block.table() + " 的索引 " + idx[0] + " 引用了不存在的列 " + c);
                    }
                }
            }
        }
        assertTrue(problems.isEmpty(), String.join("\n", problems));
    }

    // ==================== H2：真跑一遍那 16 个文件 ====================

    private Map<String, Set<String>> h2Schema() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:parity" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : H2_FILES) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        Map<String, Set<String>> out = new LinkedHashMap<>();
        jdbc.query("select table_name, column_name from information_schema.columns where table_schema = 'PUBLIC'",
                rs -> {
                    String t = rs.getString(1).toLowerCase(Locale.ROOT);
                    out.computeIfAbsent(t, k -> new LinkedHashSet<>()).add(rs.getString(2).toLowerCase(Locale.ROOT));
                });
        return out;
    }

    // ==================== MySQL：解析 DDL 文本 ====================

    private Map<String, Set<String>> mysqlSchema() throws Exception {
        String sql = read(MYSQL_FILE);
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (TableBlock block : tableBlocks(sql)) {
            Set<String> cols = out.computeIfAbsent(block.table().toLowerCase(Locale.ROOT), k -> new LinkedHashSet<>());
            for (String line : block.body().split("\n")) {
                String col = columnName(line);
                if (col != null) cols.add(col.toLowerCase(Locale.ROOT));
            }
        }
        return out;
    }

    /**
     * 从一行 DDL 里取列名；不是列行（约束、索引、注释、空行）返回 null。
     *
     * <p>两种形态都要认：MySQL 的 SHOW CREATE 输出带反引号，本仓生成的 DDL 不带。
     */
    private static String columnName(String rawLine) {
        String s = rawLine == null ? "" : rawLine.trim();
        if (s.isEmpty() || s.startsWith("--") || s.startsWith(")")) return null;
        String lower = s.toLowerCase(Locale.ROOT);
        for (String kw : new String[]{"primary key", "unique key", "key ", "constraint", "index ", "fulltext", "foreign key"}) {
            if (lower.startsWith(kw)) return null;
        }
        if (s.charAt(0) == TICK) {
            int end = s.indexOf(TICK, 1);
            return end > 1 ? s.substring(1, end) : null;
        }
        int i = 0;
        while (i < s.length() && (Character.isLetterOrDigit(s.charAt(i)) || s.charAt(i) == '_')) i++;
        return i == 0 ? null : s.substring(0, i);
    }

    private record TableBlock(String table, String body, List<String[]> indexes) { }

    private List<TableBlock> tableBlocks(String sql) {
        List<TableBlock> out = new ArrayList<>();
        Matcher m = Pattern.compile("create table if not exists (\\w+) \\((.*?)\\)\\s*engine=",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(sql);
        while (m.find()) {
            String body = m.group(2);
            List<String[]> idx = new ArrayList<>();
            for (String line : body.split("\n")) {
                String s = line.trim();
                String lower = s.toLowerCase(Locale.ROOT);
                boolean uniq = lower.startsWith("unique key ");
                boolean plain = lower.startsWith("key ");
                if (!uniq && !plain) continue;
                int lp = s.indexOf('(');
                int rp = s.lastIndexOf(')');
                if (lp < 0 || rp < lp) continue;
                String name = s.substring(uniq ? "unique key ".length() : "key ".length(), lp).trim();
                idx.add(new String[]{name, s.substring(lp + 1, rp)});
            }
            out.add(new TableBlock(m.group(1), body, idx));
        }
        return out;
    }

    // ==================== 工具 ====================

    private String read(String classpath) throws Exception {
        try (InputStream in = new ClassPathResource(classpath).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Set<String> minus(Set<String> a, Set<String> b) {
        Set<String> out = new TreeSet<>(a == null ? Set.of() : a);
        if (b != null) out.removeAll(b);
        return out;
    }
}
