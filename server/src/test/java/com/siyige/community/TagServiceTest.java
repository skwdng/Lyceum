package com.siyige.community;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * T1：标签规则的单元测试（真 H2 + mock 掉 Redis）。
 *
 * <p>为什么连真 H2：`use_count` 重算、改名合并、唯一索引这些都在 SQL 上，
 * mock 掉 repo 就等于什么都没测。
 * 为什么 mock Redis：配额与热门缓存都走 Redis，本机跑测试不一定有 Redis；
 * 这里要验的是"计数到 10 之后第 11 个被拒"这条规则，用桩把 Redis 值摆到位最稳。
 */
class TagServiceTest {

    private JdbcTemplate jdbc;
    private TagRepo repo;
    private StringRedisTemplate redis;
    private ValueOperations<String, String> ops;
    private TagService service;
    private CommunityRepo community;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:tag" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-tag.sql",
                    "schema-auth.sql", "schema-admin.sql", "schema-security.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        repo = new TagRepo(jdbc);
        community = new CommunityRepo(jdbc);

        redis = mock(StringRedisTemplate.class);
        ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        service = new TagService(repo, new SensitiveWordMasker(List.of("加微信")), redis);
    }

    private long post(String author) {
        return community.insertPost(author, "CHAT", "标题" + UUID.randomUUID(), "正文", "正文", null, 0);
    }

    private long tagId(String name) {
        Map<String, Object> row = repo.findByKey(TagService.SCOPE_POST, name.toLowerCase());
        return row == null ? -1 : ((Number) row.get("id")).longValue();
    }

    private int useCount(String name) {
        Long n = jdbc.queryForObject("select use_count from sy_tag where id = ?", Long.class, tagId(name));
        return n == null ? -1 : n.intValue();
    }

    // ==================== 规范化 ====================

    @Test
    void 归一化_大小写与空格() {
        assertEquals("ai", service.normalize("  AI  ").key());
        assertEquals("ai", service.normalize("ai").key());
        assertEquals("ai", service.normalize("Ai").key());
        assertEquals("AI", service.normalize("  AI  ").name(), "展示名保留大小写，只去首尾空格");
        assertEquals("人工 智能", service.normalize("人工   智能").name(), "连续空格合成一个");
    }

    @Test
    void 长度按码点算_1到12() {
        assertEquals(12, service.normalize("一二三四五六七八九十一二").name().codePointCount(0, 12));
        assertThrows(IllegalArgumentException.class, () -> service.normalize(""));
        assertThrows(IllegalArgumentException.class, () -> service.normalize("   "));
        assertThrows(IllegalArgumentException.class, () -> service.normalize("一二三四五六七八九十一二三"));
        // emoji 按码点算：12 个 emoji 合法，13 个不合法（用 length() 会算成 24/26 而误判）
        String twelve = "😀".repeat(12);
        String thirteen = "😀".repeat(13);
        assertDoesNotThrow(() -> service.normalize(twelve));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.normalize(thirteen));
        assertTrue(e.getMessage().startsWith("TAG_INVALID"), e.getMessage());
    }

    @Test
    void 禁用字符与敏感词() {
        for (String bad : new String[]{"a#b", "a@b", "a/b", "a\\b"}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                    () -> service.normalize(bad), bad);
            assertTrue(e.getMessage().startsWith("TAG_INVALID"), bad + " -> " + e.getMessage());
        }
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.normalize("加微信"));
        assertTrue(e.getMessage().startsWith("TAG_BLOCKED"), e.getMessage());
    }

    // ==================== 限额 ====================

    @Test
    void 每帖最多5个_第6个直接拒() {
        List<String> five = List.of("a1", "a2", "a3", "a4", "a5");
        assertDoesNotThrow(() -> service.resolveTagIds("u1", five, true));

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.resolveTagIds("u1", List.of("a1", "a2", "a3", "a4", "a5", "a6"), true));
        assertTrue(e.getMessage().startsWith("TAG_LIMIT"), e.getMessage());
    }

    @Test
    void 每人每天最多新建10个_第11个被拒() {
        when(ops.get(anyString())).thenReturn("10");
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> service.resolveTagIds("u2", List.of("全新标签"), true));
        assertTrue(e.getMessage().startsWith("TAG_QUOTA"), e.getMessage());

        when(ops.get(anyString())).thenReturn("9");
        assertDoesNotThrow(() -> service.resolveTagIds("u3", List.of("另一个新标签"), true));
        verify(ops, atLeastOnce()).increment(contains("tag:new:"));   // 用掉一个额度要记账
    }

    @Test
    void 已存在的标签不吃配额() {
        long postId = post("u1");
        service.bindPostTags(postId, "u1", List.of("复用标签"));

        when(ops.get(anyString())).thenReturn("10");          // 配额已满
        assertDoesNotThrow(() -> service.resolveTagIds("u1", List.of("复用标签"), true),
                "复用已有标签不该查配额");
    }

    @Test
    void Redis挂了_配额检查放行不阻塞发帖() {
        when(ops.get(anyString())).thenThrow(new RuntimeException("redis down"));
        assertDoesNotThrow(() -> service.resolveTagIds("u9", List.of("断线也能建"), true));
    }

    // ==================== 关联与计数 ====================

    @Test
    void 发帖绑定标签_use_count按真实关联重算() {
        long p1 = post("u1");
        long p2 = post("u1");

        service.bindPostTags(p1, "u1", List.of("AI", "教育"));
        service.bindPostTags(p2, "u1", List.of("ai"));      // 大小写归一，复用同一个标签

        assertEquals(2, useCount("AI"), "AI 被两篇帖子使用");
        assertEquals(1, useCount("教育"));
        assertEquals(2, service.tagsOfPost(p1).size());
        assertEquals(1, service.tagsOfPost(p2).size());
    }

    @Test
    void 同一个标签传两次只落一条关联() {
        long p1 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI", "ai"));

        assertEquals(1, service.tagsOfPost(p1).size());
        assertEquals(1, useCount("AI"));
    }

    @Test
    void 编辑替换标签_旧的解绑且计数减回去() {
        long p1 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI", "教育"));

        service.replacePostTags(p1, "u1", List.of("法律"));

        assertEquals(0, useCount("AI"), "AI 不再被使用");
        assertEquals(0, useCount("教育"));
        assertEquals(1, useCount("法律"));
        assertEquals("法律", service.tagsOfPost(p1).get(0).get("name"));
    }

    @Test
    void 清空标签也要重算() {
        long p1 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI"));
        service.replacePostTags(p1, "u1", List.of());

        assertEquals(0, service.tagsOfPost(p1).size());
        assertEquals(0, useCount("AI"));
    }

    @Test
    void 帖子软删不动标签关联_恢复后还在() {
        long p1 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI"));

        community.softDeletePost(p1);
        assertEquals(1, service.tagsOfPost(p1).size(), "软删只改 status，不许动 sy_post_tag（红线 4）");

        community.restorePost(p1);
        assertEquals("AI", service.tagsOfPost(p1).get(0).get("name"));
    }

    // ==================== 联想 / 热门 ====================

    @Test
    void 联想只出现用过的标签_按使用次数降序() {
        long p1 = post("u1");
        long p2 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI", "教育"));
        service.bindPostTags(p2, "u1", List.of("AI"));
        // 一个从没被用过的标签：不该出现在联想里
        repo.insert(TagService.SCOPE_POST, "孤儿", "孤儿", "admin");

        List<Map<String, Object>> items = service.suggest(null, 10);
        List<String> names = items.stream().map(m -> String.valueOf(m.get("name"))).toList();
        assertEquals(List.of("AI", "教育"), names, "按使用次数降序，且过滤掉 use_count=0");
        assertFalse(names.contains("孤儿"));
    }

    @Test
    void 热门标签_Redis可用时走缓存_不可用时回退查库() {
        long p1 = post("u1");
        service.bindPostTags(p1, "u1", List.of("AI"));

        // 缓存命中（热门缓存只有一份 key，要几个切几个）
        when(ops.get("tag:hot")).thenReturn("[{\"id\":9,\"name\":\"缓存标签\",\"useCount\":3}]");
        List<Map<String, Object>> cached = service.hot(12);
        assertEquals("缓存标签", cached.get(0).get("name"));

        // Redis 挂了：回退查库，不能因为缓存挂了就报错
        when(ops.get("tag:hot")).thenThrow(new RuntimeException("redis down"));
        List<Map<String, Object>> fresh = service.hot(5);
        assertFalse(fresh.isEmpty());
        assertEquals("AI", fresh.get(0).get("name"));
    }
}
