package com.siyige.admin.words;

import com.siyige.admin.AuditLog;
import com.siyige.community.SensitiveWordMasker;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 屏蔽词的读写（W1）：校验 / 归一化 / 幂等 / 启停 / 空表保护 / 立即生效。
 *
 * <p>真 H2（只建词表）+ 真 Masker + mock 掉的 AuditLog：这里要验的是「库里的词怎么变成
 * 内存里那张表」，不是 Spring 装配。
 */
class WordServiceTest {

    private JdbcTemplate jdbc;
    private SensitiveWordMasker masker;
    private WordService words;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:words" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema-word.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        masker = new SensitiveWordMasker(List.of("加微信"));
        words = new WordService(new WordRepo(jdbc), masker, mock(AuditLog.class));
    }

    private Map<String, Object> add(WordScope scope, String... ws) {
        return words.add(scope, Arrays.asList(ws), 1L, "admin", "127.0.0.1");
    }

    // ==================== 归一化 / 幂等 ====================

    @Test
    void 英文大小写视为同一个词_只留一条() {
        Map<String, Object> r = add(WordScope.COMMUNITY, "AI", "ai");
        assertEquals(1, r.get("added"));
        assertEquals(1, r.get("skipped"), "同一批里的 ai 应该被跳过");
        assertEquals(List.of("AI"), words.words(WordScope.COMMUNITY), "保留第一次的展示形态");

        // 再单独加一次小写：幂等跳过
        assertEquals(0, add(WordScope.COMMUNITY, "ai").get("added"));
        assertEquals(1, add(WordScope.COMMUNITY, "ai").get("skipped"));
    }

    @Test
    void 不同scope可以有同一个词() {
        add(WordScope.COMMUNITY, "赌博");
        add(WordScope.VIDEO_REJECT, "赌博");
        assertTrue(words.words(WordScope.COMMUNITY).contains("赌博"));
        assertTrue(words.words(WordScope.VIDEO_REJECT).contains("赌博"));
    }

    @Test
    void 前后空格会被去掉() {
        add(WordScope.COMMUNITY, "  代写  ");
        assertEquals(List.of("代写"), words.words(WordScope.COMMUNITY));
    }

    // ==================== 限额 ====================

    @Test
    void 超过32个码点被拒() {
        String longWord = "字".repeat(33);
        Map<String, Object> r = add(WordScope.COMMUNITY, longWord, "正常词");
        assertEquals(1, r.get("added"), "长词被拒不影响同批的其它词");
        List<Map<String, String>> invalid = (List<Map<String, String>>) r.get("invalid");
        assertEquals(1, invalid.size());
        assertTrue(invalid.get(0).get("reason").contains("32"), invalid.get(0).get("reason"));
        // 正好 32 个可以
        assertEquals(1, add(WordScope.COMMUNITY, "字".repeat(32)).get("added"));
    }

    @Test
    void 纯符号被拒_顿号逗号空白都不算词() {
        Map<String, Object> r = add(WordScope.COMMUNITY, "、", "，", "  ", "正常词");
        assertEquals(1, r.get("added"));
        assertEquals(3, ((List<?>) r.get("invalid")).size(), "纯符号与空白都应被拒：" + r.get("invalid"));
    }

    @Test
    void 单批超过500条被拒() {
        List<String> many = new ArrayList<>();
        for (int i = 0; i < WordService.MAX_BATCH + 1; i++) many.add("词" + i);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> words.add(WordScope.COMMUNITY, many, 1L, "admin", "127.0.0.1"));
        assertTrue(e.getMessage().contains("500"), e.getMessage());
    }

    // ==================== 立即生效 / 启停 / 删除 ====================

    @Test
    void 加词后Masker立刻打过码_删词后立刻不打() {
        // 再留一个词在表里，免得「删到空表」触发空表保护（那条另有用例覆盖）
        add(WordScope.COMMUNITY, "加微信");
        assertEquals("db", masker.source(), "bootstrap 之后来源就是 db（库里的词）");
        assertEquals("代写", masker.mask("代写").text(), "一开始没这个词");

        add(WordScope.COMMUNITY, "代写");
        assertEquals("＊＊", masker.mask("代写").text(), "加词后立刻生效（重建 Trie）");
        assertEquals("db", masker.source(), "来源标记改成 db");

        long id = idOf("代写");
        words.delete(id, 1L, "admin", "127.0.0.1");
        assertEquals("代写", masker.mask("代写").text(), "删词后立刻不再命中");
    }

    @Test
    void 停用后不再命中_启用后回来() {
        // 表里留一个启用的词：停用「代考」后 COMMUNITY 仍非空，才不会触发空表保护
        add(WordScope.COMMUNITY, "加微信");
        add(WordScope.COMMUNITY, "代考");
        long id = idOf("代考");

        words.setEnabled(id, false, 1L, "admin", "127.0.0.1");
        assertFalse(words.words(WordScope.COMMUNITY).contains("代考"), "停用后缓存里就没有了");
        assertEquals("代考", masker.mask("代考").text(), "停用后不再打码");
        assertEquals(2, words.countAll(WordScope.COMMUNITY), "停用不等于删除：记录还在");

        words.setEnabled(id, true, 1L, "admin", "127.0.0.1");
        assertTrue(words.words(WordScope.COMMUNITY).contains("代考"), "重新启用后回来");
        assertEquals("＊＊", masker.mask("代考").text());
    }

    // ==================== 空表保护 ====================

    @Test
    void 把社区词表删光_回落到文件种子继续打码_并报红() {
        add(WordScope.COMMUNITY, "代写");
        assertEquals("＊＊", masker.mask("代写").text());

        words.delete(idOf("代写"), 1L, "admin", "127.0.0.1");
        assertTrue(words.communityEmpty(), "库里已经空了（页面要报红条）");

        // 空表保护（设计方案 §3）：库空了不等于不屏蔽 —— 回落到文件里的种子词表继续打码。
        // 注意这里**不能**只断言「旧表还在」：逐条删光时旧表最后只剩一条，兜不住任何东西。
        assertEquals("file-fallback", masker.source(), "来源标记必须能看出是文件兜底");
        assertTrue(masker.wordCount() > 1, "兜底表应整份文件，而不是最后一条：" + masker.wordCount());
        assertEquals("＊＊", masker.mask("代写").text(), "文件里的词仍然被打码（宁可多遮，不能全裸）");
        assertEquals("＊＊", masker.mask("赌博").text(), "文件里的其它词同样生效");

        Map<String, Object> s = words.summary();
        assertEquals(Boolean.TRUE, s.get("communityEmpty"));
        assertEquals("file-fallback", s.get("maskedBy"));
    }

    // ==================== 列表 / 汇总 / 导出 ====================

    @Test
    void 列表能按scope与关键词筛_含停用词() {
        add(WordScope.COMMUNITY, "赌博", "色情");
        add(WordScope.VIDEO_REJECT, "赌博");
        words.setEnabled(idOf("色情"), false, 1L, "admin", "127.0.0.1");

        Map<String, Object> all = words.list(null, null, 1, 50);
        assertEquals(3L, all.get("total"));

        Map<String, Object> onlyCommunity = words.list("COMMUNITY", null, 1, 50);
        assertEquals(2L, onlyCommunity.get("total"), "后台列表要含停用词（要能重新启用）");

        Map<String, Object> search = words.list(null, "赌", 1, 50);
        assertEquals(2L, search.get("total"), "两个 scope 里都有「赌博」");

        Map<String, Object> unknownScope = words.list("NOPE", null, 1, 50);
        assertEquals(3L, unknownScope.get("total"), "脏 scope 当「全部」处理，不报错");
    }

    @Test
    void 汇总给出每个scope的词数() {
        add(WordScope.COMMUNITY, "赌博", "色情");
        add(WordScope.VIDEO_REVIEW, "争议");
        Map<String, Object> s = words.summary();
        List<Map<String, Object>> scopes = (List<Map<String, Object>>) s.get("scopes");
        assertEquals(3, scopes.size(), "三个 scope 都要有（哪怕是 0 条）");
        Map<String, Object> community = scopes.stream()
                .filter(m -> "COMMUNITY".equals(m.get("scope"))).findFirst().orElseThrow();
        assertEquals(2L, community.get("enabled"));
        assertEquals("社区", community.get("label"));
        assertEquals("打码", community.get("effect"));
    }

    @Test
    void 导出带注释头_一行一个_只导启用的() {
        add(WordScope.VIDEO_REJECT, "赌博", "色情", "代考");
        words.setEnabled(idOf("色情"), false, 1L, "admin", "127.0.0.1");

        String txt = words.export(WordScope.VIDEO_REJECT);
        List<String> lines = txt.lines().toList();
        assertTrue(lines.get(0).startsWith("# "), "第一行是注释头：" + lines.get(0));
        assertTrue(lines.get(0).contains("VIDEO_REJECT"));
        List<String> body = lines.stream().filter(l -> !l.startsWith("#")).filter(l -> !l.isBlank()).toList();
        assertEquals(List.of("代考", "赌博"), body, "只导启用中的词，按词排序");
    }

    @Test
    void 导出的文件原样导入_不新增任何词_注释头不会被当成词() {
        // 准备两条真实词（导出只导启用的）
        add(WordScope.VIDEO_REJECT, "代写", "赌博");
        String exported = words.export(WordScope.VIDEO_REJECT);
        long before = words.countAll(WordScope.VIDEO_REJECT);

        // 把导出的文件原样粘回导入框：应当 0 新增、全部跳过
        Map<String, Object> r = words.importText(WordScope.VIDEO_REJECT, exported, 1L, "admin", "127.0.0.1");
        assertEquals(0, ((Number) r.get("added")).intValue(), "导出再导入不该新增，实际：" + r);
        assertEquals(2, ((Number) r.get("skipped")).intValue(), "两条都算重复跳过，实际：" + r);
        assertEquals(before, words.countAll(WordScope.VIDEO_REJECT), "词数不能变");

        // 注释头里的碎片一个都不能入库（曾经会变成「命中后果：打码）」这种词）
        List<String> all = words.words(WordScope.VIDEO_REJECT);
        assertTrue(all.stream().noneMatch(w -> w.startsWith("#")), "注释行不能变成词：" + all);
        assertTrue(all.stream().noneMatch(w -> w.contains("命中后果")), "注释被逗号拆开的碎片不能入库：" + all);
        assertTrue(all.stream().noneMatch(w -> w.startsWith("共 ")), "导出头的「共 N 条」不能入库：" + all);
    }

    // ==================== 工具 ====================

    private long idOf(String word) {
        Map<String, Object> r = words.list(null, word, 1, 50);
        List<Map<String, Object>> items = (List<Map<String, Object>>) r.get("items");
        for (Map<String, Object> m : items) {
            if (word.equals(m.get("word"))) return (Long) m.get("id");
        }
        throw new AssertionError("找不到词：" + word);
    }
}
