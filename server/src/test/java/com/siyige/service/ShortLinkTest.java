package com.siyige.service;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 短链服务：房间邀请链接压成 6 位码。
 *
 * <p>锁四件事：同 target 幂等、码唯一且字符集正确、/s 命中后 hits 增长、非法 target 拒收。
 * （302/404 由 {@code ShortLinkController} 决定，这里验的是它背后那条 SQL 语义。）
 */
class ShortLinkTest {

    private JdbcTemplate jdbc;
    private ShortLinkService links;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:short" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("schema.sql"));
        }
        jdbc = new JdbcTemplate(ds);
        links = new ShortLinkService(jdbc);
    }

    private static final String TARGET = "/siyige/#/room?join=SY-7KQ2";

    @Test
    @DisplayName("同一个 target 重复请求返回同一个 code（幂等）")
    void 同target幂等() {
        ShortLinkService.Link a = links.create(TARGET);
        ShortLinkService.Link b = links.create(TARGET);
        ShortLinkService.Link c = links.create("  " + TARGET + "  ");   // 前后空白不影响

        assertEquals(a.code(), b.code(), "重复建链必须复用同一个短码");
        assertEquals(a.code(), c.code(), "首尾空白归一后也算同一个 target");
        Integer rows = jdbc.queryForObject("select count(*) from sy_shortlink where target=?",
                Integer.class, TARGET);
        assertEquals(1, rows, "库里只能有一条");

        // 不同 target → 不同 code
        String other = links.create("/siyige/#/room?join=SY-9ZQ1").code();
        assertTrue(!other.equals(a.code()), "不同 target 不能共用一个码");
    }

    @Test
    @DisplayName("code 唯一，且 6 位、只含 A-Za-z0-9 去掉 0O1lI")
    void 码唯一且字符集正确() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            String code = links.create("/siyige/#/room?join=SY-" + i).code();
            assertEquals(6, code.length(), "短码固定 6 位: " + code);
            assertTrue(code.matches("[A-Za-z0-9]{6}"), "只允许字母数字: " + code);
            for (char bad : new char[]{'0', 'O', '1', 'l', 'I'}) {
                assertTrue(code.indexOf(bad) < 0, "易混字符 " + bad + " 不该出现: " + code);
            }
            assertTrue(seen.add(code), "短码撞了（唯一性）: " + code);
        }
        Integer rows = jdbc.queryForObject("select count(*) from sy_shortlink", Integer.class);
        assertEquals(200, rows);
    }

    @Test
    @DisplayName("命中后 hits 增长；未知短码返回 null（Controller 转 404）")
    void 跳转计数与未知码() {
        ShortLinkService.Link link = links.create(TARGET);
        assertEquals(0, link.hits(), "新建时 hits=0");

        assertEquals(TARGET, links.resolveAndHit(link.code()));
        assertEquals(TARGET, links.resolveAndHit(link.code()));
        assertEquals(2, links.hits(link.code()), "两次点击应当记两次");
        Integer stored = jdbc.queryForObject("select hits from sy_shortlink where code=?",
                Integer.class, link.code());
        assertEquals(2, stored);

        assertNull(links.resolveAndHit("ZZZZZZ"), "不存在的码要能区分出来");
        assertNull(links.resolveAndHit(""), "空码也算不存在");
        assertNotNull(links.create(TARGET), "未知码的查询不能影响正常建链");
    }

    @Test
    @DisplayName("非法 target 400：空 / 超长 / javascript: / 协议相对 //evil")
    void 非法target被拒() {
        for (String bad : new String[]{
                "", "   ", "javascript:alert(1)", "data:text/html,hi",
                "//evil.com/x", "room?join=SY-1", "ftp://example.com/a",
                "/" + "a".repeat(600)}) {
            IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                    () -> links.create(bad), "应当拒绝: " + bad);
            assertTrue(ex.getMessage().contains("BAD_TARGET"), "实际: " + ex.getMessage());
        }
        Integer rows = jdbc.queryForObject("select count(*) from sy_shortlink", Integer.class);
        assertEquals(0, rows, "非法 target 不能落库");
    }

    @Test
    @DisplayName("合法 target：站内相对路径与 http(s) 都收")
    void 合法target放行() {
        List<String> good = List.of(
                "/siyige/#/room?join=SY-7KQ2",
                "/v2/",
                "https://example.com/a/b?c=1",
                "http://example.com");
        for (String t : good) {
            assertTrue(links.create(t).code().length() == 6, "应当接受: " + t);
        }
        // 正好 500 字符也要收（边界不算超长）
        String edge = "/" + "a".repeat(499);
        assertEquals(6, links.create(edge).code().length(), "500 字符应当放行");
    }

    // ---------- 接口层：302 / 404 / 绝对 url ----------

    @Test
    @DisplayName("/s/{code}：命中 302 到 target 且 hits+1；未知 404 SHORTLINK_NOT_FOUND")
    void 跳转与不存在() throws Exception {
        org.springframework.test.web.servlet.MockMvc mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders
                        .standaloneSetup(new com.siyige.api.ShortLinkController(links))
                                .setControllerAdvice(new com.siyige.api.ApiErrors()).build();

        ShortLinkService.Link link = links.create("/siyige/#/room?join=SY-7KQ2");

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/s/" + link.code()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isFound())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Location", "/siyige/#/room?join=SY-7KQ2"));
        assertEquals(1, links.hits(link.code()), "跳一次记一次");

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/s/ZZZZZZ"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.code").value("SHORTLINK_NOT_FOUND"));
    }

    @Test
    @DisplayName("POST /api/shortlinks：返回 path 与带 X-Forwarded-Prefix 的绝对 url；非法 target 400")
    void 建链接口返回绝对地址() throws Exception {
        org.springframework.test.web.servlet.MockMvc mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders
                        .standaloneSetup(new com.siyige.api.ShortLinkController(links))
                                .setControllerAdvice(new com.siyige.api.ApiErrors()).build();

        String body = "{\"target\":\"/siyige/#/room?join=SY-7KQ2\"}";
        String json = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/shortlinks")
                        .header("X-Forwarded-Prefix", "/siyige")
                        .header("X-Forwarded-Proto", "https")
                        .header("Host", "example.com")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);

        String code = json.replaceAll(".*\"code\":\"([A-Za-z0-9]{6})\".*", "$1");
        assertTrue(json.contains("\"path\":\"/s/" + code + "\""), "path 是站点内相对路径: " + json);
        assertTrue(json.contains("\"url\":\"https://example.com/siyige/s/" + code + "\""),
                "url 要按 X-Forwarded-* 拼绝对地址（含子路径前缀）: " + json);

        // 没有前缀头 → 根路径
        String bare = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/shortlinks")
                        .header("X-Forwarded-Proto", "https")
                        .header("Host", "example.com")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"/v2/\"}"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(bare.contains("://example.com/s/"), "没有前缀时不该凭空多一段: " + bare);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/shortlinks")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"javascript:alert(1)\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    @DisplayName("没有 X-Forwarded-Prefix 时，从 /siyige/ 开头的 target 推断子路径前缀")
    void 无前缀头时按target推断前缀() throws Exception {
        org.springframework.test.web.servlet.MockMvc mvc =
                org.springframework.test.web.servlet.setup.MockMvcBuilders
                        .standaloneSetup(new com.siyige.api.ShortLinkController(links))
                        .setControllerAdvice(new com.siyige.api.ApiErrors()).build();

        String json = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/shortlinks")
                        .header("X-Forwarded-Proto", "https")
                        .header("Host", "example.com")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"target\":\"/siyige/v2/#/room?join=SY-7KQ2\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);

        String code = json.replaceAll(".*\"code\":\"([A-Za-z0-9]{6})\".*", "$1");
        assertTrue(json.contains("\"url\":\"https://example.com/siyige/s/" + code + "\""),
                "反代没给前缀时也要按 target 推断 /siyige: " + json);
    }
}
