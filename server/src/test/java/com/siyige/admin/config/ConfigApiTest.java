package com.siyige.admin.config;

import com.siyige.auth.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 参数管理的 HTTP 层测试（真 Spring 上下文 + MockMvc）。
 *
 * <p>为什么要到 HTTP 层：这一批要验的不只是 Service，而是"接口形状 + 权限注解 + 错误体"
 * 这条链。4 角色矩阵在 {@code AdminPermissionMatrixTest} 里已经逐个接口跑过，
 * 这里补的是**超管的正常路径**：列表长什么样、改一个怎么回、非法值怎么拒、历史与回滚怎么走。
 *
 * <p>收尾：{@code @AfterEach} 把测试写进 sy_config 的行删掉 —— 同一个 Spring 上下文里
 * 还有别的用例（矩阵测试就会调本接口），不能让"我改过 tag.max-per-post"泄漏过去。
 */
@SpringBootTest
@AutoConfigureMockMvc
class ConfigApiTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private JwtService jwt;

    private String token;

    @BeforeEach
    void setUp() {
        String acc = "cfg-api-" + System.nanoTime();
        jdbc.update("insert into sy_admin(account, password_hash, role, status, must_change_pwd) "
                + "values(?, 'x', 'SUPER', 1, false)", acc);
        Long id = jdbc.queryForObject("select id from sy_admin where account = ?", Long.class, acc);
        token = jwt.issueAdmin(String.valueOf(id), acc);
    }

    @AfterEach
    void tearDown() {
        jdbc.update("delete from sy_config");
        jdbc.update("delete from sy_config_log");
    }

    private String getJson(String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
    }

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getContentAsString();
    }

    private int status(String path, String body) throws Exception {
        return mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("列表：10 项、带分组/来源/生效时机，库是空的时候来源全是默认值")
    void 列表形状() throws Exception {
        String json = getJson("/api/admin/config");
        assertTrue(json.contains("\"total\":10"), json.substring(0, Math.min(200, json.length())));
        assertTrue(json.contains("\"source\":\"DEFAULT\""));
        assertTrue(json.contains("\"sourceLabel\":\"默认值\""));
        assertTrue(json.contains("\"effectLabel\":\"下次扫描生效\""));
        assertTrue(json.contains("\"effectLabel\":\"立即生效\""));
        assertTrue(json.contains("\"key\":\"tag.max-per-post\""));
        assertTrue(json.contains("\"defaultValue\":\"5\""));
        assertTrue(json.contains("\"groups\":["), "分组顺序也要给前端");
    }

    @Test
    @DisplayName("改一个：立刻生效 + 来源变数据库 + 历史可查可回滚")
    void 改一个再回滚() throws Exception {
        String set = postJson("/api/admin/config",
                "{\"key\":\"tag.max-per-post\",\"value\":\"2\"}");
        assertTrue(set.contains("\"source\":\"DB\""), set);
        assertTrue(set.contains("\"value\":\"2\""), set);

        // 第二次读就是从库里读（不是缓存也不是默认值）
        assertTrue(getJson("/api/admin/config").contains("\"value\":\"2\""));

        String log = getJson("/api/admin/config/log?key=tag.max-per-post&limit=10");
        assertTrue(log.contains("\"newValue\":\"2\""), log);
        assertTrue(log.contains("\"operator\":\"cfg-api-"), "操作人要落库：" + log);
        long logId = extractLong(log);

        String back = postJson("/api/admin/config/rollback", "{\"logId\":" + logId + "}");
        assertTrue(back.contains("\"value\":\"5\""), "回滚到默认值：" + back);
        // 这条历史的 old_v 是 null（改之前库里没有行）-> 回滚 = 删掉那一行 -> 来源又变回默认值
        assertTrue(back.contains("\"source\":\"DEFAULT\""), "回滚到「原本没有那一行」=删行：" + back);
    }

    @Test
    @DisplayName("非法值 400 INVALID_PARAM，且库里不变")
    void 非法值被拒() throws Exception {
        assertEquals(400, status("/api/admin/config", "{\"key\":\"tag.max-per-post\",\"value\":\"abc\"}"));
        assertEquals(400, status("/api/admin/config", "{\"key\":\"tag.max-per-post\",\"value\":\"99\"}"));
        assertEquals(400, status("/api/admin/config", "{\"key\":\"no.such.key\",\"value\":\"1\"}"));
        assertEquals(400, status("/api/admin/config", "{\"value\":\"1\"}"));
        assertEquals(400, status("/api/admin/config/rollback", "{}"));
        assertEquals(400, status("/api/admin/config/rollback", "{\"logId\":999999}"));
        assertTrue(getJson("/api/admin/config").contains("\"source\":\"DEFAULT\""), "拒掉的写不该落库");
    }

    /** 从历史 JSON 里抠出第一个 id（不引 JSON 库，避免为了一个数字加依赖）。 */
    private static long extractLong(String json) {
        int i = json.indexOf("\"id\":");
        assertTrue(i >= 0, "历史里应该有 id：" + json);
        int start = i + 5;
        int end = start;
        while (end < json.length() && Character.isDigit(json.charAt(end))) end++;
        return Long.parseLong(json.substring(start, end));
    }
}
