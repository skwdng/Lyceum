package com.siyige.community;

import com.siyige.community.ai.AiAccount;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * @ 候选的搜索口径（2026-11-28）。
 *
 * <p>产品口径（不要自己加需求）：**昵称前缀匹配**，不做包含匹配、不加账号匹配、不排除自己。
 * 这里钉住三件事：
 * <ol>
 *   <li>前缀能命中（{@code "d"} → DeepSeek）；</li>
 *   <li><b>大小写不敏感</b>：{@code "d"} 与 {@code "D"} 结果一样 —— MySQL 的 LIKE 默认不区分，
 *       H2 的 LIKE 却区分，之前两边行为不一致（本地搜不到、生产搜得到），改成 lower(...) like lower(?) 修掉；</li>
 *   <li>不是前缀就不命中（{@code "eep"} 不该命中 DeepSeek）—— 防止有人顺手改成包含匹配。</li>
 * </ol>
 */
class MentionSearchTest {

    private static final int LIMIT = 10;

    private NotificationRepo repo;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:mention" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        ds.setUser("sa");
        ds.setPassword("");
        try (Connection c = ds.getConnection()) {
            // schema-ai.sql 里带着 AI 账号种子（id=ai_deepseek / name=DeepSeek / is_bot=1）
            for (String f : new String[]{"schema.sql", "schema-auth.sql", "schema-ai.sql"}) {
                ScriptUtils.executeSqlScript(c, new ClassPathResource(f));
            }
        }
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        // 一个普通用户（前缀 "阿"），外加一个没有 account 的历史行（不该出现在候选里）
        jdbc.update("insert into sy_user(id, account, name, status, is_bot) values('u-a', 'alice', '阿丽', 1, 0)");
        jdbc.update("insert into sy_user(id, name) values('u-legacy', '老数据')");
        repo = new NotificationRepo(jdbc);
    }

    private List<String> names(String q) {
        return repo.searchUsers(q, LIMIT).stream().map((Map<String, Object> r) -> String.valueOf(r.get("name"))).toList();
    }

    @Test
    void 小写d能搜到DeepSeek() {
        assertTrue(names("d").contains(AiAccount.NAME), "搜 d 应命中 DeepSeek，实际：" + names("d"));
    }

    @Test
    void 大写D也能搜到DeepSeek_大小写不敏感() {
        assertTrue(names("D").contains(AiAccount.NAME), "搜 D 应命中 DeepSeek，实际：" + names("D"));
        assertEquals(names("d"), names("D"), "d 与 D 的结果必须完全一致");
    }

    @Test
    void 只做前缀匹配_不做包含匹配() {
        assertTrue(names("eep").isEmpty(), "eep 不是任何昵称的前缀，不该命中：" + names("eep"));
        assertTrue(names("eepl").isEmpty());
    }

    @Test
    void 中文前缀能命中() {
        assertEquals(List.of("阿丽"), names("阿"));
    }

    @Test
    void 候选里带is_bot_前端据此挂AI徽章() {
        Map<String, Object> ai = repo.searchUsers("d", LIMIT).stream()
                .filter((Map<String, Object> r) -> AiAccount.ID.equals(String.valueOf(r.get("id"))))
                .findFirst().orElseThrow();
        assertEquals(1, ((Number) ai.get("is_bot")).intValue(), "AI 账号的 is_bot 要带出来，弹层才能挂徽章");
    }

    @Test
    void 搜不到时返回空列表_前端据此显示没找到用户() {
        assertTrue(names("zzzz").isEmpty());
    }

    @Test
    void 没有account的历史行不进候选() {
        assertFalse(names("老").contains("老数据"), "历史行（account 为 null）不该出现在 @ 候选里");
    }
}
