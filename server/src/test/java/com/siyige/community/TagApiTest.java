package com.siyige.community;

import com.siyige.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * T1：标签的 HTTP 层验收（真过滤器 + 真 SQL + 真 JSON）。
 *
 * <p>令牌用 {@link JwtService#issue} 直接签，不走登录接口：登录带 Redis 限流，
 * 本机跑测试不一定有 Redis，会把"标签功能测试"变成"环境测试"。
 *
 * <p>覆盖的都是设计方案 §7 里"发帖 / 筛选 / 兼容"三块：
 * 不带 tags 照旧成功、带 tags 落库并在列表/详情回显、按 tagId 筛选可与关键词叠加、
 * 联想与热门、错误码、编辑替换、软删不动标签。
 */
@SpringBootTest
@AutoConfigureMockMvc
class TagApiTest {

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtService jwt;
    @Autowired private CommunityRepo community;
    @Autowired private TagRepo tagRepo;

    private String token;
    private String userId;

    @BeforeEach
    void setUp() {
        userId = "tu" + (System.nanoTime() % 1000000);
        jdbc.update("insert into sy_user(id, name, account, password_hash, status) values(?, ?, ?, 'x', 1)",
                userId, userId, userId);
        token = jwt.issue(userId, userId);
    }

    private long createPost(String title, String tagsJson) throws Exception {
        String body = "{\"type\":\"CHAT\",\"title\":" + q(title) + ",\"body\":\"正文内容够长一点。\""
                + (tagsJson == null ? "" : ",\"tags\":" + tagsJson) + "}";
        String resp = mvc.perform(post("/api/community/posts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getContentAsString();
        Integer id = jsonInt(resp, "postId");
        assertNotNull(id, "发帖应返回 postId：" + resp);
        return id;
    }

    private String getJson(String url) throws Exception {
        return mvc.perform(get(url).header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
    }

    // ==================== 发帖 ====================

    @Test
    void 不带tags发帖照旧成功_老客户端兼容() throws Exception {
        var resp = mvc.perform(post("/api/community/posts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"CHAT\",\"title\":\"老客户端\",\"body\":\"没有 tags 字段。\"}"))
                .andReturn().getResponse();

        assertEquals(200, resp.getStatus());
        String json = resp.getContentAsString();
        assertTrue(json.contains("\"tags\":[]"), "响应里 tags 应是空数组：" + json);
    }

    @Test
    void 带tags发帖_列表与详情都能看到() throws Exception {
        long id = createPost("带标签的帖子", "[\"AI\",\"教育\"]");

        String detail = getJson("/api/community/posts/" + id);
        assertTrue(detail.contains("\"name\":\"AI\""), detail);
        assertTrue(detail.contains("\"name\":\"教育\""), detail);

        String list = getJson("/api/community/posts?size=50");
        assertTrue(list.contains("\"name\":\"AI\""), "列表也要带标签（批量查，不能 N+1）");
    }

    @Test
    void 大小写归一_ai与AI是同一个标签() throws Exception {
        createPost("第一篇", "[\"AI\"]");
        long second = createPost("第二篇", "[\"ai\"]");

        String detail = getJson("/api/community/posts/" + second);
        String aiId = detail.substring(detail.indexOf("\"tags\":[{"), detail.indexOf("]", detail.indexOf("\"tags\":[{")));
        Long tagCount = jdbc.queryForObject(
                "select count(*) from sy_tag where name_key = 'ai'", Long.class);
        assertEquals(1L, tagCount, "AI / ai 只能有一行标签");
        assertTrue(aiId.contains("\"name\":\"AI\""), "展示名沿用第一次的样子：" + aiId);
    }

    // ==================== 筛选 ====================

    @Test
    void 按tagId筛选_可与关键词叠加() throws Exception {
        long a = createPost("标签筛选A", "[\"筛选标签\"]");
        long b = createPost("标签筛选B", "[\"筛选标签\"]");
        createPost("不带标签的帖子", "[]");

        Long tagId = jdbc.queryForObject(
                "select id from sy_tag where name_key = '筛选标签'", Long.class);
        String only = getJson("/api/community/posts?tagId=" + tagId + "&size=50");
        assertTrue(only.contains("\"id\":" + a) && only.contains("\"id\":" + b), only);
        assertEquals(2, jsonInt(only, "total"));

        String combo = mvc.perform(get("/api/community/posts")
                        .param("tagId", String.valueOf(tagId))
                        .param("title", "标签筛选A")
                        .header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
        assertEquals(1, jsonInt(combo, "total"), "标签 + 关键词叠加：" + combo);
    }

    // ==================== 联想 / 热门 ====================

    @Test
    void 联想与热门_只出现用过的标签且按次数降序() throws Exception {
        createPost("联想1", "[\"联想标签\",\"乙标签\"]");
        createPost("联想2", "[\"联想标签\"]");
        tagRepo.insert(TagService.SCOPE_POST, "没人用的", "没人用的", "admin");

        String sug = getJson("/api/community/tags?q=联想");
        assertTrue(sug.contains("联想标签"), sug);
        assertFalse(sug.contains("没人用的"), "use_count=0 的标签不该出现在联想里");

        String hot = getJson("/api/community/tags/hot?limit=12");
        assertTrue(hot.contains("联想标签"), hot);
        assertFalse(hot.contains("没人用的"), hot);
        assertTrue(hot.indexOf("联想标签") < hot.indexOf("乙标签"), "使用次数多的排前面：" + hot);
    }

    // ==================== 校验 ====================

    @Test
    void 非法标签返回对应错误码且不落帖子() throws Exception {
        Long before = jdbc.queryForObject("select count(*) from sy_post", Long.class);

        assertEquals("400:TAG_INVALID", postError("[\"一二三四五六七八九十一二三\"]"), "超长");
        assertEquals("400:TAG_INVALID", postError("[\"a#b\"]"), "禁用字符");
        assertEquals("400:TAG_BLOCKED", postError("[\"加微信\"]"), "敏感词必须拒（不打码）");
        assertEquals("400:TAG_LIMIT", postError("[\"t1\",\"t2\",\"t3\",\"t4\",\"t5\",\"t6\"]"), "超过 5 个");

        Long after = jdbc.queryForObject("select count(*) from sy_post", Long.class);
        assertEquals(before, after, "标签不合法时不该落半条帖子");
    }

    private String postError(String tagsJson) throws Exception {
        String body = "{\"type\":\"CHAT\",\"title\":\"坏标签\",\"body\":\"正文。\",\"tags\":" + tagsJson + "}";
        var resp = mvc.perform(post("/api/community/posts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
        String json = resp.getContentAsString();
        String code = json.contains("\"code\"")
                ? json.substring(json.indexOf("\"code\":\"") + 8, json.indexOf('"', json.indexOf("\"code\":\"") + 8))
                : "";
        return resp.getStatus() + ":" + code;
    }

    // ==================== 编辑 / 软删 ====================

    @Test
    void 编辑替换标签_不传tags则不动() throws Exception {
        long id = createPost("编辑前", "[\"旧标签\"]");

        String replaced = mvc.perform(patch("/api/community/posts/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"tags\":[\"新标签\"]}"))
                .andReturn().getResponse().getContentAsString();
        assertTrue(replaced.contains("新标签") && !replaced.contains("旧标签"), replaced);

        String keep = mvc.perform(patch("/api/community/posts/" + id)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"只改标题\"}"))
                .andReturn().getResponse().getContentAsString();
        assertTrue(keep.contains("新标签"), "不传 tags 就不改标签：" + keep);
    }

    @Test
    void 软删帖子不动标签关联() throws Exception {
        long id = createPost("要软删的帖子", "[\"软删标签\"]");

        community.softDeletePost(id);
        assertEquals(1, tagRepo.tagsOfPost(id).size(), "软删（status=2）不许动 sy_post_tag（红线 4）");

        community.restorePost(id);
        String detail = getJson("/api/community/posts/" + id);
        assertTrue(detail.contains("软删标签"), "恢复后标签还在：" + detail);
    }

    // ==================== 小工具 ====================

    private static String q(String s) {
        return "\"" + s.replace("\"", "\\\"") + "\"";
    }

    private static Integer jsonInt(String json, String field) {
        String needle = "\"" + field + "\":";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        int start = i + needle.length();
        int end = start;
        while (end < json.length() && (Character.isDigit(json.charAt(end)))) end++;
        return end == start ? null : Integer.parseInt(json.substring(start, end));
    }
}
