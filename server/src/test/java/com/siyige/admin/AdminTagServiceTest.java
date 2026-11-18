package com.siyige.admin;

import com.siyige.admin.config.ConfigRepo;
import com.siyige.admin.config.ConfigService;
import com.siyige.community.SensitiveWordMasker;
import com.siyige.community.TagRepo;
import com.siyige.community.TagService;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * T3：后台标签管理的规则测试（真 H2 + mock Redis/审计）。
 *
 * <p>重点验四件事（都是上线一定出问题的地方）：
 * ① 预置重名幂等（点两次不该报红）；② 改名撞名 = 合并，且**跳过已同时有两个标签的帖子**
 * （否则主键冲突，合并直接 500）；③ 合并后 use_count 相加、源标签消失、帖子改挂；
 * ④ 删除只解关联不删帖子，帖子保留其它标签。外加审计动作与错误码。
 */
class AdminTagServiceTest {

    private JdbcTemplate jdbc;
    private TagRepo tagRepo;
    private TagService tags;
    private AuditLog audit;
    private AdminTagService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:admintag" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            for (String f : new String[]{"schema.sql", "schema-community.sql", "schema-tag.sql",
                    "schema-auth.sql", "schema-admin.sql", "schema-security.sql", "schema-config.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        jdbc = new JdbcTemplate(ds);
        tagRepo = new TagRepo(jdbc);

        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        tags = new TagService(tagRepo, new SensitiveWordMasker(List.of("加微信")), redis,
                new ConfigService(new ConfigRepo(jdbc)));

        audit = mock(AuditLog.class);
        service = new AdminTagService(tagRepo, tags, audit);
    }

    private long post(String tag1) {
        return post(tag1, null);
    }

    private long post(String tag1, String tag2) {
        long id = new com.siyige.community.CommunityRepo(jdbc)
                .insertPost("u1", "CHAT", "标题" + UUID.randomUUID(), "正文", "正文", null, 0);
        List<String> names = tag2 == null ? List.of(tag1) : List.of(tag1, tag2);
        tags.bindPostTags(id, "u1", names);
        return id;
    }

    private long idOf(String name) {
        Map<String, Object> row = tagRepo.findByKey(TagService.SCOPE_POST, name.toLowerCase());
        return row == null ? -1 : ((Number) row.get("id")).longValue();
    }

    private int useCount(String name) {
        Long n = jdbc.queryForObject("select use_count from sy_tag where id = ?", Long.class, idOf(name));
        return n == null ? -1 : n.intValue();
    }

    /** 出参里的数字有的是 Integer 有的是 Long，比较前统一一下。 */
    private static int num(Object v) {
        return v instanceof Number n ? n.intValue() : -1;
    }

    private List<String> tagNamesOf(long postId) {
        return tagRepo.tagsOfPost(postId).stream().map(m -> String.valueOf(m.get("name"))).toList();
    }

    // ==================== 列表 / 预置 ====================

    @Test
    void 列表含未使用的标签_按使用次数降序() {
        post("热门标签");
        post("热门标签");
        tagRepo.insert(TagService.SCOPE_POST, "没人用", "没人用", "admin");

        Map<String, Object> out = service.list(null, 1, 20);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");

        assertEquals(2, num(out.get("total")));
        assertEquals("热门标签", items.get(0).get("name"));
        assertEquals(2, num(items.get(0).get("useCount")));
        assertEquals("没人用", items.get(1).get("name"));
        assertEquals(0, num(items.get(1).get("useCount")), "use_count=0 的标签也要列出来（后台要能清理）");
    }

    @Test
    void 预置重名幂等() {
        Map<String, Object> first = service.create("官方标签", 1, "admin", "127.0.0.1");
        Map<String, Object> second = service.create("官方标签", 1, "admin", "127.0.0.1");

        assertEquals(true, first.get("created"));
        assertEquals(false, second.get("created"), "重名不该报错，直接返回已有的");
        assertEquals(1L, jdbc.queryForObject("select count(*) from sy_tag where name_key = '官方标签'", Long.class));
        verify(audit, times(1)).record(anyLong(), anyString(), eq(AuditLogRepo.ACTION_TAG_CREATE),
                isNull(), eq(AuditLogRepo.TARGET_TAG), anyLong(), anyString(), anyString(), anyString());
    }

    @Test
    void 预置也要过规范化与敏感词() {
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> service.create("加微信", 1, "admin", "ip"));
        assertTrue(e1.getMessage().startsWith("TAG_BLOCKED"), e1.getMessage());

        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> service.create("a/b", 1, "admin", "ip"));
        assertTrue(e2.getMessage().startsWith("TAG_INVALID"), e2.getMessage());
    }

    // ==================== 改名 ====================

    @Test
    void 普通改名_不影响使用次数() {
        long p = post("旧名");
        long id = idOf("旧名");

        Map<String, Object> out = service.rename(id, "新名", 1, "admin", "ip");

        assertEquals(false, out.get("merged"));
        assertEquals("新名", tagRepo.findById(id).get("name"));
        assertEquals(1, useCount("新名"));
        assertEquals(List.of("新名"), tagNamesOf(p), "帖子上的标签跟着改名（读的是同一行）");
        verify(audit).record(anyLong(), anyString(), eq(AuditLogRepo.ACTION_TAG_RENAME), isNull(),
                eq(AuditLogRepo.TARGET_TAG), eq(id), eq("旧名"), contains("旧名"), anyString());
    }

    @Test
    void 改名撞名_自动合并_计数相加且帖子改挂() {
        long srcId = idOf("人工智能");
        assertTrue(srcId < 0, "先确认还没有这个标签");
        long p1 = post("人工智能");                 // 只有源标签
        long p2 = post("人工智能", "AI");            // 两个标签都有（合并时这条必须跳过，否则主键冲突）
        long aiId = idOf("AI");

        Map<String, Object> out = service.rename(idOf("人工智能"), "AI", 1, "admin", "ip");

        assertEquals(true, out.get("merged"));
        assertEquals(1, num(out.get("moved")), "只有 p1 需要迁移；p2 两个都有，跳过");
        @SuppressWarnings("unchecked")
        Map<String, Object> into = (Map<String, Object>) out.get("mergedInto");
        assertEquals(aiId, into.get("id"));

        assertNull(tagRepo.findByKey(TagService.SCOPE_POST, "人工智能"), "源标签应当已删除");
        assertEquals(2, useCount("AI"), "计数相加：两篇帖子都用 AI");
        assertEquals(List.of("AI"), tagNamesOf(p1));
        assertEquals(List.of("AI"), tagNamesOf(p2), "不该出现重复关联");
        verify(audit).record(anyLong(), anyString(), eq(AuditLogRepo.ACTION_TAG_MERGE), isNull(),
                eq(AuditLogRepo.TARGET_TAG), eq(aiId), eq("AI"), contains("并入"), anyString());
    }

    @Test
    void 只改大小写不算撞名() {
        long p = post("Ai");
        long id = idOf("Ai");

        Map<String, Object> out = service.rename(id, "AI", 1, "admin", "ip");

        assertEquals(false, out.get("merged"), "key 相同 = 同一个标签，只是换个写法");
        assertEquals("AI", tagRepo.findById(id).get("name"));
        assertEquals(List.of("AI"), tagNamesOf(p));
    }

    // ==================== 删除 ====================

    @Test
    void 删除只解关联_帖子与其它标签都在() {
        long p = post("要删的", "保留的");
        long id = idOf("要删的");
        long postCount = jdbc.queryForObject("select count(*) from sy_post", Long.class);

        Map<String, Object> out = service.delete(id, 1, "admin", "ip");

        assertEquals(true, out.get("deleted"));
        assertEquals(1, num(out.get("affected")));
        assertNull(tagRepo.findById(id));
        assertEquals(List.of("保留的"), tagNamesOf(p), "帖子还在，其它标签也还在");
        assertEquals(postCount, jdbc.queryForObject("select count(*) from sy_post", Long.class));
        assertEquals(1, useCount("保留的"));
        verify(audit).record(anyLong(), anyString(), eq(AuditLogRepo.ACTION_TAG_DELETE), isNull(),
                eq(AuditLogRepo.TARGET_TAG), eq(id), eq("要删的"), contains("解除"), anyString());
    }

    @Test
    void 不存在的标签_改名与删除都404() {
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> service.rename(999999, "x", 1, "admin", "ip"));
        assertTrue(e1.getMessage().startsWith("TAG_NOT_FOUND"), e1.getMessage());

        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> service.delete(999999, 1, "admin", "ip"));
        assertTrue(e2.getMessage().startsWith("TAG_NOT_FOUND"), e2.getMessage());
    }

    @Test
    void 每次变动都清热门缓存() {
        post("热点");
        // invalidateHot 走的是 redis.delete，Redis 挂了也只 warn；这里只确认不抛异常
        assertDoesNotThrow(() -> service.rename(idOf("热点"), "热点2", 1, "admin", "ip"));
        assertDoesNotThrow(() -> service.delete(idOf("热点2"), 1, "admin", "ip"));
    }

    @Test
    void 审计里不出现SQL或堆栈() {
        post("审计标签");
        service.delete(idOf("审计标签"), 1, "admin", "ip");

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(audit).record(anyLong(), anyString(), eq(AuditLogRepo.ACTION_TAG_DELETE), isNull(),
                eq(AuditLogRepo.TARGET_TAG), anyLong(), anyString(), detail.capture(), anyString());
        String d = detail.getValue();
        for (String bad : new String[]{"select", "delete from", "Exception", "at com.", "\n"}) {
            assertFalse(d.toLowerCase().contains(bad.toLowerCase()), "detail 不该出现 " + bad + "：" + d);
        }
    }
}
